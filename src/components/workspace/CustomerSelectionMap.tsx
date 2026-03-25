"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
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

type WindowWithGoogleMaps = Window & {
  google?: GoogleMapsClient;
  __jcRadGoogleMapsPromise?: Promise<GoogleMapsClient>;
};

type GoogleMapsClient = {
  maps: GoogleMapsNamespace;
};

type GoogleLatLngLiteral = {
  lat: number;
  lng: number;
};

type GoogleMapsNamespace = {
  Map: new (
    element: HTMLElement,
    options: {
      center: GoogleLatLngLiteral;
      zoom: number;
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
      gestureHandling: string;
      zoomControl: boolean;
    }
  ) => GoogleMapInstance;
  Marker: new (options: {
    map: GoogleMapInstance;
    position: GoogleLatLngLiteral;
    title: string;
    label?: {
      text: string;
      color: string;
      fontWeight: string;
    };
    icon?: GoogleMarkerIcon;
    zIndex?: number;
  }) => GoogleMarkerInstance;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: {
    CIRCLE: string;
  };
};

type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
  panTo: (position: GoogleLatLngLiteral) => void;
  setZoom: (zoom: number) => void;
};

type GoogleLatLngBounds = {
  extend: (position: GoogleLatLngLiteral) => void;
  isEmpty: () => boolean;
};

type GoogleMarkerIcon = {
  path: string;
  scale: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
};

type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setZIndex: (zIndex: number) => void;
  setIcon: (icon: GoogleMarkerIcon) => void;
  addListener: (eventName: string, handler: () => void) => void;
};

type FocusOption = {
  key: string;
  label: string;
  center: GoogleLatLngLiteral;
  zoom: number;
};

function getGoogleMapsApiKey() {
  const value = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY || "").trim();
  return value || null;
}

function loadGoogleMapsClient(apiKey: string) {
  const win = window as WindowWithGoogleMaps;
  if (win.google?.maps) return Promise.resolve(win.google);
  if (win.__jcRadGoogleMapsPromise) return win.__jcRadGoogleMapsPromise;

  win.__jcRadGoogleMapsPromise = new Promise<GoogleMapsClient>((resolve, reject) => {
    const existingScript = document.querySelector('script[data-jc-rad-google-maps="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (win.google?.maps) resolve(win.google);
        else reject(new Error("Google Maps loaded without maps namespace"));
      });
      existingScript.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.jcRadGoogleMaps = "true";
    script.onload = () => {
      if (win.google?.maps) resolve(win.google);
      else reject(new Error("Google Maps loaded without maps namespace"));
    };
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  }).catch((error) => {
    delete win.__jcRadGoogleMapsPromise;
    throw error;
  });

  return win.__jcRadGoogleMapsPromise;
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
    if (googleMapStatus !== "ready" || !mapRef.current || !(window as WindowWithGoogleMaps).google?.maps) return;

    const googleMaps = (window as WindowWithGoogleMaps).google!.maps;
    const map =
      mapInstanceRef.current ||
      new googleMaps.Map(mapRef.current, {
        center: focusedCustomer
          ? { lat: focusedCustomer.latitude as number, lng: focusedCustomer.longitude as number }
          : { lat: 36.9, lng: -119.5 },
        zoom: focusedCustomer ? 9 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
        zoomControl: true,
      });

    mapInstanceRef.current = map;
    const bounds = new googleMaps.LatLngBounds();

    markerRefs.current.forEach(({ marker }) => marker.setMap(null));
    markerRefs.current = withCoords.map((customer) => {
      const position = { lat: customer.latitude as number, lng: customer.longitude as number };
      bounds.extend(position);
      const marker = new googleMaps.Marker({
        map,
        position,
        title: customer.name,
        zIndex: selectedCustomerIdSet.has(customer.id) ? 900 : 500,
      });
      marker.addListener("click", () => {
        onToggleCustomerSelection(customer.id);
        setFocusedCustomerId(customer.id);
      });
      return { customerId: customer.id, marker };
    });

    if (focusKey === "all") {
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 56);
      }
    } else {
      const nextFocus = focusOptions.find((option) => option.key === focusKey);
      if (nextFocus) {
        map.panTo(nextFocus.center);
        map.setZoom(nextFocus.zoom);
      }
    }

    return undefined;
  }, [focusKey, focusOptions, focusedCustomer, googleMapStatus, onToggleCustomerSelection, selectedCustomerIdSet, withCoords]);

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
  }, [effectiveFocusedCustomerId, selectedCustomerIdSet, withCoords]);

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
              <div className="rounded-[24px] border border-[#f1ddad] bg-[#fff9eb] px-4 py-6 text-sm text-[#8a5a08] shadow-sm">
                {googleMapError || "Google Maps is still loading for this workspace."}
              </div>
            )}
          </div>

          <div className="grid gap-4">
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
                  {secondaryActionLabel && secondaryActionHref ? (
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
