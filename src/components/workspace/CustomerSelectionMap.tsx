"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import {
  getGoogleMapsApiKey,
  loadGoogleMapsClient,
  subscribeToGoogleMapsFailures,
  type GoogleLatLngLiteral,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
  type WindowWithGoogleMaps,
} from "@/components/workspace/googleMapsLoader";
import { priorityChipClass, titleCase, visitStatusChipClass } from "@/components/workspace/routeUtils";

type CustomerSelectionMapProps = {
  customers: CustomerSummary[];
  title: string;
  description: string;
  emptyLabel: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: (customerId: string) => string;
  selectedCustomerIds: string[];
  onToggleCustomerSelection: (customerId: string) => void;
  onAddSelectedCustomers: () => void;
  addSelectedCustomersLabel: string;
  selectionScopeLabel: string;
};

type FocusOption = {
  key: string;
  label: string;
  center: GoogleLatLngLiteral;
  zoom: number;
};

type ProjectedCustomer = {
  customer: CustomerSummary;
  x: number;
  y: number;
};

type ProjectedFocusOption = {
  key: string;
  label: string;
  bounds: ProjectedBounds;
};

type ProjectedBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const MAP_BOUNDS = {
  minLat: 32.45,
  maxLat: 42.1,
  minLng: -124.55,
  maxLng: -114.05,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function projectPoint(latitude: number, longitude: number) {
  const xRatio = (longitude - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio = (MAP_BOUNDS.maxLat - latitude) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
  return {
    x: clamp(xRatio * 100, 4, 96),
    y: clamp(yRatio * 100, 6, 94),
  };
}

function projectCustomer(customer: CustomerSummary): ProjectedCustomer | null {
  if (customer.latitude === null || customer.longitude === null) return null;
  return {
    customer,
    ...projectPoint(customer.latitude, customer.longitude),
  };
}

function buildProjectedBounds(customers: ProjectedCustomer[]): ProjectedBounds | null {
  if (customers.length === 0) return null;
  return customers.reduce<ProjectedBounds>(
    (bounds, customer) => ({
      minX: Math.min(bounds.minX, customer.x),
      maxX: Math.max(bounds.maxX, customer.x),
      minY: Math.min(bounds.minY, customer.y),
      maxY: Math.max(bounds.maxY, customer.y),
    }),
    {
      minX: customers[0].x,
      maxX: customers[0].x,
      minY: customers[0].y,
      maxY: customers[0].y,
    }
  );
}

function buildFocusOptions(customers: CustomerSummary[]): FocusOption[] {
  const withCoords = customers.filter((customer) => customer.latitude !== null && customer.longitude !== null);
  const cityGroups = new Map<string, CustomerSummary[]>();
  const territoryGroups = new Map<string, CustomerSummary[]>();

  withCoords.forEach((customer) => {
    const city = String(customer.city || "").trim();
    if (city) cityGroups.set(city, [...(cityGroups.get(city) || []), customer]);
    const territory = String(customer.territoryCode || "").trim();
    if (territory) territoryGroups.set(territory, [...(territoryGroups.get(territory) || []), customer]);
  });

  function toOptions(prefix: string, labelPrefix: string, groups: Map<string, CustomerSummary[]>) {
    return Array.from(groups.entries())
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([label, groupedCustomers]) => {
        const center = {
          lat: groupedCustomers.reduce((sum, customer) => sum + (customer.latitude as number), 0) / groupedCustomers.length,
          lng: groupedCustomers.reduce((sum, customer) => sum + (customer.longitude as number), 0) / groupedCustomers.length,
        };
        const zoom = groupedCustomers.length > 10 ? 8 : groupedCustomers.length > 4 ? 9 : 10;
        return { key: `${prefix}:${label}`, label: `${labelPrefix} ${label}`, center, zoom };
      });
  }

  return [{ key: "all", label: "Fit All Results", center: { lat: 36.9, lng: -119.5 }, zoom: 6 }, ...toOptions("city", "City:", cityGroups), ...toOptions("territory", "Territory:", territoryGroups)];
}

export default function CustomerSelectionMap({
  customers,
  title,
  description,
  emptyLabel,
  secondaryActionLabel,
  secondaryActionHref,
  selectedCustomerIds,
  onToggleCustomerSelection,
  onAddSelectedCustomers,
  addSelectedCustomersLabel,
  selectionScopeLabel,
}: CustomerSelectionMapProps) {
  const withCoords = useMemo(
    () => customers.filter((customer) => customer.latitude !== null && customer.longitude !== null),
    [customers]
  );
  const projectedCustomers = useMemo(
    () => customers.map(projectCustomer).filter((customer): customer is ProjectedCustomer => Boolean(customer)),
    [customers]
  );
  const withoutCoords = useMemo(
    () => customers.filter((customer) => customer.latitude === null || customer.longitude === null),
    [customers]
  );
  const selectedCustomerIdSet = useMemo(() => new Set(selectedCustomerIds), [selectedCustomerIds]);
  const selectedMapCustomers = useMemo(
    () => withCoords.filter((customer) => selectedCustomerIdSet.has(customer.id)),
    [selectedCustomerIdSet, withCoords]
  );
  const focusOptions = useMemo(() => buildFocusOptions(withCoords), [withCoords]);
  const projectedFocusOptions = useMemo<ProjectedFocusOption[]>(
    () => {
      const allBounds = buildProjectedBounds(projectedCustomers);
      const options: ProjectedFocusOption[] = allBounds ? [{ key: "all", label: "Fit All Results", bounds: allBounds }] : [];

      const cityGroups = new Map<string, ProjectedCustomer[]>();
      const territoryGroups = new Map<string, ProjectedCustomer[]>();
      projectedCustomers.forEach((customer) => {
        const city = String(customer.customer.city || "").trim();
        if (city) cityGroups.set(city, [...(cityGroups.get(city) || []), customer]);
        const territory = String(customer.customer.territoryCode || "").trim();
        if (territory) territoryGroups.set(territory, [...(territoryGroups.get(territory) || []), customer]);
      });

      function pushGroupOptions(prefix: string, labelPrefix: string, groups: Map<string, ProjectedCustomer[]>) {
        Array.from(groups.entries())
          .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
          .slice(0, 8)
          .forEach(([label, groupedCustomers]) => {
            const bounds = buildProjectedBounds(groupedCustomers);
            if (!bounds) return;
            options.push({ key: `${prefix}:${label}`, label: `${labelPrefix} ${label}`, bounds });
          });
      }

      pushGroupOptions("city", "City:", cityGroups);
      pushGroupOptions("territory", "Territory:", territoryGroups);
      return options;
    },
    [projectedCustomers]
  );
  const [focusedCustomerId, setFocusedCustomerId] = useState<string>(selectedCustomerIds[0] || withCoords[0]?.id || "");
  const [googleMapStatus, setGoogleMapStatus] = useState<"idle" | "ready" | "failed">(() =>
    getGoogleMapsApiKey() ? "idle" : "failed"
  );
  const [googleMapError, setGoogleMapError] = useState<string | null>(() =>
    getGoogleMapsApiKey() ? null : "Google Maps browser key is not configured."
  );
  const [focusKey, setFocusKey] = useState("all");
  const googleMapsApiKey = getGoogleMapsApiKey();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<Array<{ customerId: string; marker: GoogleMarkerInstance }>>([]);
  const toggleCustomerSelectionRef = useRef(onToggleCustomerSelection);
  const effectiveFocusedCustomerId =
    focusedCustomerId && withCoords.some((customer) => customer.id === focusedCustomerId)
      ? focusedCustomerId
      : selectedCustomerIds[0] || withCoords[0]?.id || "";

  const focusedCustomer =
    withCoords.find((customer) => customer.id === effectiveFocusedCustomerId) ||
    selectedMapCustomers[0] ||
    withCoords[0] ||
    null;

  useEffect(() => {
    toggleCustomerSelectionRef.current = onToggleCustomerSelection;
  }, [onToggleCustomerSelection]);

  useEffect(() => {
    if (!googleMapsApiKey) return;

    let cancelled = false;
    loadGoogleMapsClient(googleMapsApiKey)
      .then(() => {
        if (!cancelled) {
          setGoogleMapStatus("ready");
          setGoogleMapError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGoogleMapStatus("failed");
          setGoogleMapError(error instanceof Error ? error.message : "Google Maps failed to load");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey]);

  useEffect(() => {
    return subscribeToGoogleMapsFailures((message) => {
      setGoogleMapStatus("failed");
      setGoogleMapError(message);
    });
  }, []);

  useEffect(() => {
    if (googleMapStatus !== "ready" || !mapRef.current || !(window as WindowWithGoogleMaps).google?.maps) return;

    const googleMaps = (window as WindowWithGoogleMaps).google!.maps;
    const map =
      mapInstanceRef.current ||
      new googleMaps.Map(mapRef.current, {
        center: withCoords[0]
          ? { lat: withCoords[0].latitude as number, lng: withCoords[0].longitude as number }
          : { lat: 36.9, lng: -119.5 },
        zoom: withCoords[0] ? 9 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
        zoomControl: true,
      });

    mapInstanceRef.current = map;

    markerRefs.current.forEach(({ marker }) => marker.setMap(null));
    markerRefs.current = withCoords.map((customer) => {
      const position = { lat: customer.latitude as number, lng: customer.longitude as number };
      const marker = new googleMaps.Marker({
        map,
        position,
        title: customer.name,
        zIndex: 500,
      });
      marker.addListener("click", () => {
        toggleCustomerSelectionRef.current(customer.id);
        setFocusedCustomerId(customer.id);
      });
      return { customerId: customer.id, marker };
    });

    return undefined;
  }, [googleMapStatus, withCoords]);

  useEffect(() => {
    if (googleMapStatus !== "ready" || !mapInstanceRef.current || !(window as WindowWithGoogleMaps).google?.maps) return;

    const googleMaps = (window as WindowWithGoogleMaps).google!.maps;
    const map = mapInstanceRef.current;
    const bounds = new googleMaps.LatLngBounds();

    withCoords.forEach((customer) => {
      bounds.extend({ lat: customer.latitude as number, lng: customer.longitude as number });
    });

    if (focusKey === "all") {
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 56);
      }
      return;
    }

    const nextFocus = focusOptions.find((option) => option.key === focusKey);
    if (nextFocus) {
      map.panTo(nextFocus.center);
      map.setZoom(nextFocus.zoom);
    }
  }, [focusKey, focusOptions, googleMapStatus, withCoords]);

  useEffect(() => {
    const googleMaps = (window as WindowWithGoogleMaps).google?.maps;
    if (!googleMaps) return;

    markerRefs.current.forEach(({ customerId, marker }) => {
      const customer = withCoords.find((item) => item.id === customerId);
      if (!customer) return;
      const isFocused = customerId === effectiveFocusedCustomerId;
      const isSelected = selectedCustomerIdSet.has(customerId);
      marker.setZIndex(isFocused ? 950 : isSelected ? 900 : 500);
      marker.setIcon({
        path: googleMaps.SymbolPath.CIRCLE,
        scale: isFocused ? 16 : isSelected ? 14 : 12,
        fillColor: isFocused ? "#173543" : isSelected ? "#0f766e" : "#14b8a6",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      });
    });
  }, [effectiveFocusedCustomerId, googleMapStatus, selectedCustomerIdSet, withCoords]);

  useEffect(() => {
    return () => {
      markerRefs.current.forEach(({ marker }) => marker.setMap(null));
    };
  }, []);

  return (
    <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">{title}</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#173543]">Live territory map for proximity-based route drafting</h3>
          <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">{description}</p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-4 text-sm text-[#506877] shadow-sm sm:min-w-[220px]">
          <MapMetric label="Mapped Stops" value={String(withCoords.length)} />
          <MapMetric label="No Coords" value={String(withoutCoords.length)} />
          <MapMetric label="Selected" value={String(selectedMapCustomers.length)} />
          <MapMetric label="Territory Open" value={String(customers.filter((customer) => !customer.territoryCode).length)} />
        </div>
      </div>

      {withCoords.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-8 text-sm text-[#5d7685]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.72fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[#dbe8ef] bg-[#fbfdfe] p-3">
              <select
                value={focusKey}
                onChange={(event) => setFocusKey(event.target.value)}
                className="h-10 min-w-[220px] rounded-full border border-[#cedde6] bg-white px-4 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
              >
                {focusOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-sm text-[#4f6877]">
                {selectionScopeLabel}
              </span>
              <button
                type="button"
                onClick={onAddSelectedCustomers}
                disabled={selectedMapCustomers.length === 0}
                className="rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2a35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addSelectedCustomersLabel}
              </button>
            </div>

            {googleMapStatus === "ready" ? (
              <div className="relative overflow-hidden rounded-[24px] border border-[#dbe8ef] bg-[linear-gradient(180deg,#f6fbfd_0%,#ecf7fa_100%)] shadow-sm">
                <div ref={mapRef} className="aspect-[1.7/1] min-h-[560px] w-full" />
              </div>
            ) : (
              <ProjectedCustomerMap
                customers={projectedCustomers}
                selectedCustomerIdSet={selectedCustomerIdSet}
                focusedCustomerId={effectiveFocusedCustomerId}
                focusOptions={projectedFocusOptions}
                onSelectCustomer={(customerId) => {
                  onToggleCustomerSelection(customerId);
                  setFocusedCustomerId(customerId);
                }}
              />
            )}
          </div>

          <div className="grid gap-4">
            {googleMapStatus !== "ready" ? (
              <div className="rounded-2xl border border-[#f1ddad] bg-[#fff9eb] px-4 py-3 text-sm text-[#8a5a08]">
                {googleMapStatus === "failed"
                  ? `${googleMapError || "Google Maps is unavailable for this browser session."} Showing the projected fallback map instead.`
                  : "Google Maps is still loading for this workspace. Showing the projected fallback map until the live map is ready."}
              </div>
            ) : null}
            {focusedCustomer ? (
              <div className="rounded-[24px] border border-[#dbe8ef] bg-[#fbfdfe] p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-[#173543]">Focused Stop</h4>
                      {selectedCustomerIdSet.has(focusedCustomer.id) ? (
                        <span className="rounded-full border border-[#cfe8e4] bg-[#effaf7] px-2.5 py-1 text-xs font-semibold text-[#0f766e]">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#173543]">{focusedCustomer.name}</p>
                    <p className="mt-1 text-sm text-[#58717f]">
                      {focusedCustomer.territoryCode || "Unassigned"} • {focusedCustomer.city || "No city"} • Live map preview
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", visitStatusChipClass(focusedCustomer.visitStatus)].join(" ")}>
                      {titleCase(focusedCustomer.visitStatus, "No visit status")}
                    </span>
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", priorityChipClass(focusedCustomer.routePriority)].join(" ")}>
                      Priority {focusedCustomer.routePriority ?? "None"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#e1ebf1] bg-white p-3 text-sm text-[#4f6877]">
                  <p>{focusedCustomer.address1 || focusedCustomer.city || "No address on file"}</p>
                  <p className="mt-1">
                    Contact {focusedCustomer.primaryContacts[0]?.name || "No primary contact"} • {focusedCustomer.primaryContacts[0]?.email || focusedCustomer.mainPhone || "No contact info"}
                  </p>
                  <p className="mt-1">
                    Coordinates {(focusedCustomer.latitude as number).toFixed(4)}, {(focusedCustomer.longitude as number).toFixed(4)}
                  </p>
                </div>
              <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleCustomerSelection(focusedCustomer.id)}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      selectedCustomerIdSet.has(focusedCustomer.id)
                        ? "border border-[#bfe8e2] bg-[#f5fffd] text-[#0f766e]"
                        : "border border-[#cfdde6] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]",
                    ].join(" ")}
                  >
                    {selectedCustomerIdSet.has(focusedCustomer.id) ? "Unselect Marker" : "Select Marker"}
                  </button>
                  <Link href={`/workspace/customers/${focusedCustomer.id}`} className="rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
                    Open Account
                  </Link>
                  {secondaryActionLabel &&
                  secondaryActionHref &&
                  secondaryActionLabel.trim().toLowerCase() !== "open account" &&
                  secondaryActionHref(focusedCustomer.id) !== `/workspace/customers/${focusedCustomer.id}` ? (
                    <Link
                      href={secondaryActionHref(focusedCustomer.id)}
                      className="rounded-full border border-[#cfdde6] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                    >
                      {secondaryActionLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f8897]">Map Selection</h4>
                  <p className="mt-1 text-sm text-[#5d7685]">
                    {selectedMapCustomers.length === 0
                      ? "Click markers to build a route draft by proximity."
                      : `${selectedMapCustomers.length} account${selectedMapCustomers.length === 1 ? "" : "s"} selected from ${selectionScopeLabel.toLowerCase()}.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAddSelectedCustomers}
                  disabled={selectedMapCustomers.length === 0}
                  className="rounded-full border border-[#173543] px-3 py-1.5 text-sm font-semibold text-[#173543] transition hover:bg-[#173543] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addSelectedCustomersLabel}
                </button>
              </div>
              {selectedMapCustomers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedMapCustomers.slice(0, 8).map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setFocusedCustomerId(customer.id)}
                      className="rounded-full border border-[#cfe8e4] bg-[#effaf7] px-3 py-1 text-xs font-semibold text-[#0f766e]"
                    >
                      {customer.name}
                    </button>
                  ))}
                  {selectedMapCustomers.length > 8 ? (
                    <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1 text-xs font-semibold text-[#4f6877]">
                      +{selectedMapCustomers.length - 8} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f8897]">Stops Without Coordinates</h4>
                <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#4f6877]">
                  {withoutCoords.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {withoutCoords.slice(0, 6).map((customer) => (
                  <div key={customer.id} className="rounded-xl border border-[#e1ebf1] bg-[#fbfdfe] px-3 py-2 text-sm text-[#4f6877]">
                    <p className="font-semibold text-[#173543]">{customer.name}</p>
                    <p className="mt-1">
                      Territory {customer.territoryCode || "Unassigned"} • {customer.city || "No city"}
                    </p>
                  </div>
                ))}
                {withoutCoords.length === 0 ? <p className="text-sm text-[#5d7685]">All filtered stops have coordinates.</p> : null}
                {withoutCoords.length > 6 ? <p className="text-sm text-[#5d7685]">Plus {withoutCoords.length - 6} more list-only stops.</p> : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-base font-semibold text-[#173543]">{value}</span>
    </div>
  );
}

function ProjectedCustomerMap(args: {
  customers: ProjectedCustomer[];
  selectedCustomerIdSet: Set<string>;
  focusedCustomerId: string;
  focusOptions: ProjectedFocusOption[];
  onSelectCustomer: (customerId: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [focusKey, setFocusKey] = useState("all");

  function fitBounds(bounds: ProjectedBounds) {
    const frame = frameRef.current;
    if (!frame) return;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const paddingRatio = 0.12;
    const boundsWidthRatio = Math.max((bounds.maxX - bounds.minX) / 100, 0.06);
    const boundsHeightRatio = Math.max((bounds.maxY - bounds.minY) / 100, 0.08);
    const nextZoom = Math.max(
      1,
      Math.min((1 - paddingRatio * 2) / boundsWidthRatio, (1 - paddingRatio * 2) / boundsHeightRatio, 2.8)
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    setZoom(nextZoom);
    setPanX(width / 2 - (width * centerX * nextZoom) / 100);
    setPanY(height / 2 - (height * centerY * nextZoom) / 100);
  }

  function resetViewport() {
    setFocusKey("all");
    const allOption = args.focusOptions.find((option) => option.key === "all");
    if (allOption) fitBounds(allOption.bounds);
  }

  useEffect(() => {
    const nextFocus = args.focusOptions.find((option) => option.key === focusKey) || args.focusOptions[0];
    if (!nextFocus) return;
    const frameId = window.requestAnimationFrame(() => {
      fitBounds(nextFocus.bounds);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [args.customers, args.focusOptions, focusKey]);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#dbe8ef] bg-[linear-gradient(180deg,#f6fbfd_0%,#ecf7fa_100%)] shadow-sm">
      <div className="absolute right-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-[#35505d] shadow-sm backdrop-blur">
        <select
          value={focusKey}
          onChange={(event) => {
            setFocusKey(event.target.value);
          }}
          className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1 text-xs text-[#173543]"
        >
          {args.focusOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setZoom((current) => Math.min(current + 0.2, 2.4))} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          +
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.max(current - 0.2, 1))} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          -
        </button>
        <button type="button" onClick={() => setPanY((current) => current + 80)} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          N
        </button>
        <button type="button" onClick={() => setPanY((current) => current - 80)} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          S
        </button>
        <button type="button" onClick={() => setPanX((current) => current + 80)} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          W
        </button>
        <button type="button" onClick={() => setPanX((current) => current - 80)} className="rounded-full border border-[#d7e6ed] px-2 py-1">
          E
        </button>
        <button type="button" onClick={resetViewport} className="rounded-full border border-[#d7e6ed] px-3 py-1">
          Reset
        </button>
      </div>

      <div ref={frameRef} className="relative aspect-[1.7/1] min-h-[560px] overflow-hidden">
        <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(20,184,166,0.14),transparent_26%),radial-gradient(circle_at_68%_30%,rgba(23,53,67,0.1),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0))]" />
          <div className="pointer-events-none absolute inset-y-0 left-[22%] w-px bg-white/80" />
          <div className="pointer-events-none absolute inset-y-0 left-[46%] w-px bg-white/60" />
          <div className="pointer-events-none absolute inset-y-0 left-[70%] w-px bg-white/70" />
          <div className="pointer-events-none absolute inset-x-0 top-[26%] h-px bg-white/70" />
          <div className="pointer-events-none absolute inset-x-0 top-[53%] h-px bg-white/60" />
          <div className="pointer-events-none absolute inset-x-0 top-[80%] h-px bg-white/70" />
          <div className="pointer-events-none absolute left-[8%] top-[10%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">North Coast</div>
          <div className="pointer-events-none absolute left-[33%] top-[16%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">Sacramento</div>
          <div className="pointer-events-none absolute left-[49%] top-[29%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">Bay Area</div>
          <div className="pointer-events-none absolute left-[45%] top-[52%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">Central Valley</div>
          <div className="pointer-events-none absolute left-[28%] top-[69%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">Los Angeles</div>
          <div className="pointer-events-none absolute left-[18%] top-[84%] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f8897]">San Diego</div>

          {args.customers.map((customer) => {
            const isFocused = args.focusedCustomerId === customer.customer.id;
            const isSelected = args.selectedCustomerIdSet.has(customer.customer.id);

            return (
              <button
                key={customer.customer.id}
                type="button"
                onClick={() => args.onSelectCustomer(customer.customer.id)}
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_8px_20px_rgba(16,42,67,0.22)] transition",
                  isFocused ? "z-20 h-8 w-8 bg-[#173543]" : isSelected ? "z-10 h-7 w-7 bg-[#0f766e]" : "z-10 h-6 w-6 bg-[#14b8a6] hover:scale-110",
                ].join(" ")}
                style={{ left: `${customer.x}%`, top: `${customer.y}%` }}
                aria-label={`Select ${customer.customer.name}`}
                title={customer.customer.name}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
