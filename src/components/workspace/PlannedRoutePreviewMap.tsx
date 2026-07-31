"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import { getGoogleMapsApiKey, loadGoogleMapsClient, subscribeToGoogleMapsFailures } from "@/components/workspace/googleMapsLoader";
import { priorityChipClass, titleCase, visitStatusChipClass } from "@/components/workspace/routeUtils";

type PlannedRoutePreviewMapProps = {
  customers: CustomerSummary[];
  title: string;
  description: string;
  emptyLabel: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: (customerId: string) => string;
  selectedCustomerId?: string | null;
  onSelectedCustomerIdChange?: (customerId: string | null) => void;
  plannedRoute: {
    origin: {
      name: string;
      latitude: number;
      longitude: number;
    };
    stopOrder: string[];
    provider: "google" | "fallback";
    polyline: string | null;
  };
};

type ProjectedStop = {
  customer: CustomerSummary;
  x: number;
  y: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
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
  Polyline: new (options: {
    map: GoogleMapInstance;
    path: GoogleLatLngLiteral[];
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    icons?: Array<{
      icon: {
        path: string;
        strokeOpacity: number;
        strokeWeight: number;
        scale: number;
      };
      offset: string;
      repeat: string;
    }>;
  }) => GooglePolylineInstance;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: {
    CIRCLE: string;
  };
};

type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
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

type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
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

function projectPoint(latitude: number, longitude: number): ProjectedPoint {
  const xRatio = (longitude - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio = (MAP_BOUNDS.maxLat - latitude) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);

  return {
    x: clamp(xRatio * 100, 4, 96),
    y: clamp(yRatio * 100, 6, 94),
  };
}

function projectCustomer(customer: CustomerSummary): ProjectedStop | null {
  if (customer.latitude === null || customer.longitude === null) return null;

  return {
    customer,
    ...projectPoint(customer.latitude, customer.longitude),
  };
}

function decodeGooglePolyline(encoded: string) {
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return points;
}

export default function PlannedRoutePreviewMap({
  customers,
  title,
  description,
  emptyLabel,
  secondaryActionLabel,
  secondaryActionHref,
  selectedCustomerId: controlledSelectedCustomerId,
  onSelectedCustomerIdChange,
  plannedRoute,
}: PlannedRoutePreviewMapProps) {
  const withCoords = useMemo(() => customers.map(projectCustomer).filter((stop): stop is ProjectedStop => Boolean(stop)), [customers]);
  const withoutCoords = useMemo(() => customers.filter((customer) => customer.latitude === null || customer.longitude === null), [customers]);
  const [internalSelectedCustomerId, setInternalSelectedCustomerId] = useState<string>(withCoords[0]?.customer.id || "");
  const selectedCustomerId = controlledSelectedCustomerId ?? internalSelectedCustomerId;

  const selectedStop =
    withCoords.find((stop) => stop.customer.id === selectedCustomerId) ||
    withCoords[0] ||
    null;

  const projectedOrigin = useMemo(() => projectPoint(plannedRoute.origin.latitude, plannedRoute.origin.longitude), [plannedRoute]);
  const orderedProjectedStops = useMemo(() => {
    const stopById = new Map(withCoords.map((stop) => [stop.customer.id, stop]));
    return plannedRoute.stopOrder.map((customerId) => stopById.get(customerId)).filter((stop): stop is ProjectedStop => Boolean(stop));
  }, [plannedRoute, withCoords]);
  const polylinePoints = useMemo(() => {
    if (!plannedRoute.polyline) return [] as ProjectedPoint[];
    return decodeGooglePolyline(plannedRoute.polyline).map((point) => projectPoint(point.latitude, point.longitude));
  }, [plannedRoute]);
  const fallbackPathPoints = useMemo(
    () => [projectedOrigin, ...orderedProjectedStops.map((stop) => projectPoint(stop.customer.latitude as number, stop.customer.longitude as number)), projectedOrigin],
    [orderedProjectedStops, projectedOrigin]
  );
  const svgPath = useMemo(() => {
    const points = polylinePoints.length > 1 ? polylinePoints : fallbackPathPoints;
    if (points.length < 2) return null;
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }, [fallbackPathPoints, polylinePoints]);
  const selectedOrderIndex = selectedStop ? orderedProjectedStops.findIndex((stop) => stop.customer.id === selectedStop.customer.id) : -1;
  const [googleMapStatus, setGoogleMapStatus] = useState<"idle" | "ready" | "failed">("idle");
  const [googleMapError, setGoogleMapError] = useState<string | null>(null);
  const googleMapsApiKey = getGoogleMapsApiKey();
  const shouldAttemptGoogleMap = Boolean(googleMapsApiKey);
  const googleMapReady = shouldAttemptGoogleMap && googleMapStatus === "ready";
  const googleMapFailed = !googleMapsApiKey || googleMapStatus === "failed";

  useEffect(() => {
    if (!shouldAttemptGoogleMap || !googleMapsApiKey) return;

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
  }, [googleMapsApiKey, shouldAttemptGoogleMap]);

  useEffect(() => {
    return subscribeToGoogleMapsFailures((message) => {
      setGoogleMapStatus("failed");
      setGoogleMapError(message);
    });
  }, []);

  function selectCustomer(customerId: string) {
    if (controlledSelectedCustomerId === undefined) {
      setInternalSelectedCustomerId(customerId);
    }
    onSelectedCustomerIdChange?.(customerId);
  }

  return (
    <section className="rounded-[28px] border border-[#deded8] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">{title}</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#181817]">Finalized route preview with origin, ordered stops, and pathing</h3>
          <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">{description}</p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-[#deded8] bg-[#fafaf8] p-4 text-sm text-[#506877] shadow-sm sm:min-w-[220px]">
          <MapMetric label="Mapped Stops" value={String(withCoords.length)} />
          <MapMetric label="No Coords" value={String(withoutCoords.length)} />
          <MapMetric label="Provider" value={plannedRoute.provider === "google" ? "Google" : "Fallback"} />
          <MapMetric label="Path" value={plannedRoute.polyline ? "Polyline" : "Estimated"} />
        </div>
      </div>

      {withCoords.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#d3e1e8] bg-[#f7f7f4] px-4 py-8 text-sm text-[#5d7685]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,0.72fr)]">
          <div className="space-y-4">
            {googleMapReady ? (
              <GooglePlannedRouteMap plannedRoute={plannedRoute} orderedProjectedStops={orderedProjectedStops} selectedCustomerId={selectedCustomerId} onSelectCustomer={selectCustomer} />
            ) : (
              <ProjectedRouteMap
                plannedRoute={plannedRoute}
                orderedProjectedStops={orderedProjectedStops}
                projectedOrigin={projectedOrigin}
                svgPath={svgPath}
                withCoords={withCoords}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={selectCustomer}
              />
            )}

            {orderedProjectedStops.length > 0 ? (
              <div className="rounded-[24px] border border-[#deded8] bg-[#fafaf8] p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f8897]">Stop Strip</h4>
                    <p className="mt-1 text-sm text-[#5d7685]">Use the strip for quick route navigation. Detailed control stays in the itinerary.</p>
                  </div>
                  <span className="rounded-full border border-[#deded8] bg-white px-2.5 py-1 text-xs font-semibold text-[#4f6877]">{orderedProjectedStops.length} stops</span>
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {orderedProjectedStops.map((stop, index) => {
                    const isActive = stop.customer.id === selectedStop?.customer.id;
                    return (
                      <button
                        key={stop.customer.id}
                        type="button"
                        onClick={() => selectCustomer(stop.customer.id)}
                        className={[
                          "min-w-[160px] rounded-2xl border px-3 py-3 text-left transition",
                          isActive
                            ? "border-[#181817] bg-[#181817] text-white shadow-[0_10px_24px_rgba(16,42,67,0.16)]"
                            : "border-[#deded8] bg-white text-[#181817] hover:border-[#1b1b1a] hover:bg-[#f5fbfa]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={["rounded-full px-2 py-1 text-[11px] font-semibold", isActive ? "bg-white/16 text-white" : "bg-[#effaf7] text-[#1b1b1a]"].join(" ")}>
                            Stop {index + 1}
                          </span>
                          <span className={["rounded-full border px-2 py-1 text-[11px] font-semibold", isActive ? "border-white/20 text-white" : visitStatusChipClass(stop.customer.visitStatus)].join(" ")}>
                            {titleCase(stop.customer.visitStatus, "Open")}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold">{stop.customer.name}</p>
                        <p className={["mt-1 text-xs", isActive ? "text-white/80" : "text-[#5d7685]"].join(" ")}>
                          {stop.customer.territoryCode || "Unassigned"} • {stop.customer.city || "No city"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4">
            {googleMapFailed ? (
              <div className="rounded-2xl border border-[#f1ddad] bg-[#fff9eb] px-4 py-3 text-sm text-[#8a5a08]">
                {googleMapsApiKey
                  ? `Google Maps preview is unavailable in this browser session${googleMapError ? `: ${googleMapError}.` : "."} Showing the projected fallback preview instead.`
                  : "Google Maps preview is not configured for the browser. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY to enable the live planner map. Showing the projected fallback preview instead."}
              </div>
            ) : null}

            {selectedStop ? (
              <div className="rounded-[24px] border border-[#deded8] bg-[#fafaf8] p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-[#181817]">Focused Stop</h4>
                      {selectedOrderIndex >= 0 ? (
                        <span className="rounded-full border border-[#cfe8e4] bg-[#effaf7] px-2.5 py-1 text-xs font-semibold text-[#1b1b1a]">
                          Stop {selectedOrderIndex + 1}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#181817]">{selectedStop.customer.name}</p>
                    <p className="mt-1 text-sm text-[#58717f]">
                      {selectedStop.customer.territoryCode || "Unassigned"} • {plannedRoute.provider === "google" ? "Google route" : "Fallback route"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", visitStatusChipClass(selectedStop.customer.visitStatus)].join(" ")}>
                      {titleCase(selectedStop.customer.visitStatus, "No visit status")}
                    </span>
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", priorityChipClass(selectedStop.customer.routePriority)].join(" ")}>
                      Priority {selectedStop.customer.routePriority ?? "None"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#e1ebf1] bg-white p-3 text-sm text-[#4f6877]">
                  <p>{selectedStop.customer.address1 || selectedStop.customer.city || "No address on file"}</p>
                  <p className="mt-1">
                    Contact {selectedStop.customer.primaryContacts[0]?.name || "No primary contact"} • {selectedStop.customer.primaryContacts[0]?.email || selectedStop.customer.mainPhone || "No contact info"}
                  </p>
                  <p className="mt-1">
                    Priority {selectedStop.customer.routePriority ?? "None"} • Coordinates{" "}
                    {selectedStop.customer.latitude !== null && selectedStop.customer.longitude !== null
                      ? `${selectedStop.customer.latitude.toFixed(4)}, ${selectedStop.customer.longitude.toFixed(4)}`
                      : "No coordinates"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/workspace/customers/${selectedStop.customer.id}`} className="rounded-full bg-[#181817] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
                    Open Account
                  </Link>
                  {secondaryActionLabel && secondaryActionHref ? (
                    <Link href={secondaryActionHref(selectedStop.customer.id)} className="rounded-full border border-[#deded8] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#1b1b1a] hover:text-[#1b1b1a]">
                      {secondaryActionLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-[24px] border border-[#deded8] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f8897]">Stops Without Coordinates</h4>
                <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-2.5 py-1 text-xs font-semibold text-[#4f6877]">
                  {withoutCoords.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {withoutCoords.slice(0, 6).map((customer) => (
                  <div key={customer.id} className="rounded-xl border border-[#e1ebf1] bg-[#fafaf8] px-3 py-2 text-sm text-[#4f6877]">
                    <p className="font-semibold text-[#181817]">{customer.name}</p>
                    <p className="mt-1">Territory {customer.territoryCode || "Unassigned"} • {customer.city || "No city"}</p>
                  </div>
                ))}
                {withoutCoords.length === 0 ? <p className="text-sm text-[#5d7685]">All planned stops have coordinates.</p> : null}
                {withoutCoords.length > 6 ? <p className="text-sm text-[#5d7685]">Plus {withoutCoords.length - 6} more list-only stops.</p> : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectedRouteMap(args: {
  plannedRoute: PlannedRoutePreviewMapProps["plannedRoute"];
  orderedProjectedStops: ProjectedStop[];
  projectedOrigin: ProjectedPoint;
  svgPath: string | null;
  withCoords: ProjectedStop[];
  selectedCustomerId: string;
  onSelectCustomer: (customerId: string) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#deded8] bg-[linear-gradient(180deg,#f7f7f4_0%,#ecf7fa_100%)] shadow-sm">
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

      <div className="relative aspect-[1.7/1] min-h-[520px]">
        {args.svgPath ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <path d={args.svgPath} fill="none" stroke={args.plannedRoute.polyline ? "#181817" : "#1b1b1a"} strokeWidth={args.plannedRoute.polyline ? 1.2 : 0.9} strokeDasharray={args.plannedRoute.polyline ? undefined : "2.5 2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          </svg>
        ) : null}

        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${args.projectedOrigin.x}%`, top: `${args.projectedOrigin.y}%` }}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#f97316] text-[11px] font-bold text-white shadow-[0_8px_20px_rgba(16,42,67,0.22)]">
            HQ
          </div>
        </div>

        {args.withCoords.map((stop) => {
          const isSelected = args.selectedCustomerId === stop.customer.id;
          const orderedIndex = args.orderedProjectedStops.findIndex((projectedStop) => projectedStop.customer.id === stop.customer.id);

          return (
            <button
              key={stop.customer.id}
              type="button"
              onClick={() => args.onSelectCustomer(stop.customer.id)}
              className={[
                "absolute -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-[0_8px_20px_rgba(16,42,67,0.22)] transition",
                isSelected ? "z-20 scale-125 bg-[#181817]" : "z-10 bg-[#1b1b1a] hover:scale-110",
              ].join(" ")}
              style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
              aria-label={`Open stop summary for ${stop.customer.name}`}
            >
              {orderedIndex >= 0 ? orderedIndex + 1 : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GooglePlannedRouteMap(args: {
  plannedRoute: PlannedRoutePreviewMapProps["plannedRoute"];
  orderedProjectedStops: ProjectedStop[];
  selectedCustomerId: string;
  onSelectCustomer: (customerId: string) => void;
}) {
  const { onSelectCustomer, orderedProjectedStops, plannedRoute, selectedCustomerId } = args;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<Array<{ customerId: string; marker: GoogleMarkerInstance }>>([]);
  const originMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const polylineRef = useRef<GooglePolylineInstance | null>(null);

  useEffect(() => {
    if (!mapRef.current || !(window as WindowWithGoogleMaps).google?.maps) return;

    const googleMaps = (window as WindowWithGoogleMaps).google!.maps;
    const map =
      mapInstanceRef.current ||
      new googleMaps.Map(mapRef.current, {
        center: { lat: plannedRoute.origin.latitude, lng: plannedRoute.origin.longitude },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
      });

    mapInstanceRef.current = map;
    const bounds = new googleMaps.LatLngBounds();
    bounds.extend({ lat: plannedRoute.origin.latitude, lng: plannedRoute.origin.longitude });

    if (originMarkerRef.current) originMarkerRef.current.setMap(null);
    originMarkerRef.current = new googleMaps.Marker({
      map,
      position: { lat: plannedRoute.origin.latitude, lng: plannedRoute.origin.longitude },
      title: plannedRoute.origin.name,
      label: { text: "HQ", color: "#ffffff", fontWeight: "700" },
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: "#f97316",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
      zIndex: 1000,
    });

    markerRefs.current.forEach(({ marker }) => marker.setMap(null));
    markerRefs.current = orderedProjectedStops
      .filter((stop) => stop.customer.latitude !== null && stop.customer.longitude !== null)
      .map((stop, index) => {
        bounds.extend({ lat: stop.customer.latitude as number, lng: stop.customer.longitude as number });
        const marker = new googleMaps.Marker({
          map,
          position: { lat: stop.customer.latitude as number, lng: stop.customer.longitude as number },
          title: stop.customer.name,
          label: { text: String(index + 1), color: "#ffffff", fontWeight: "700" },
          zIndex: 500,
        });
        marker.addListener("click", () => onSelectCustomer(stop.customer.id));
        return { customerId: stop.customer.id, marker };
      });

    if (polylineRef.current) polylineRef.current.setMap(null);
    const path = plannedRoute.polyline
      ? decodeGooglePolyline(plannedRoute.polyline).map((point) => ({ lat: point.latitude, lng: point.longitude }))
      : [
          { lat: plannedRoute.origin.latitude, lng: plannedRoute.origin.longitude },
          ...orderedProjectedStops
            .filter((stop) => stop.customer.latitude !== null && stop.customer.longitude !== null)
            .map((stop) => ({ lat: stop.customer.latitude as number, lng: stop.customer.longitude as number })),
          { lat: plannedRoute.origin.latitude, lng: plannedRoute.origin.longitude },
        ];

    polylineRef.current = new googleMaps.Polyline({
      map,
      path,
      strokeColor: plannedRoute.polyline ? "#181817" : "#1b1b1a",
      strokeOpacity: 0.92,
      strokeWeight: plannedRoute.polyline ? 5 : 4,
      icons: plannedRoute.polyline
        ? undefined
        : [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeWeight: 2,
                scale: 4,
              },
              offset: "0",
              repeat: "16px",
            },
          ],
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    }

    return undefined;
  }, [onSelectCustomer, orderedProjectedStops, plannedRoute]);

  useEffect(() => {
    const googleMaps = (window as WindowWithGoogleMaps).google?.maps;
    if (!googleMaps) return;

    markerRefs.current.forEach(({ customerId, marker }, index) => {
      const isSelected = customerId === selectedCustomerId;
      marker.setZIndex(isSelected ? 900 : 500 + index);
      marker.setIcon({
        path: googleMaps.SymbolPath.CIRCLE,
        scale: isSelected ? 16 : 13,
        fillColor: isSelected ? "#181817" : "#1b1b1a",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      });
    });
  }, [selectedCustomerId]);

  useEffect(() => {
    return () => {
      polylineRef.current?.setMap(null);
      markerRefs.current.forEach(({ marker }) => marker.setMap(null));
      originMarkerRef.current?.setMap(null);
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#deded8] bg-[linear-gradient(180deg,#f7f7f4_0%,#ecf7fa_100%)] shadow-sm">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      <div ref={mapRef} className="aspect-[1.7/1] min-h-[520px] w-full" />
    </div>
  );
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-base font-semibold text-[#181817]">{value}</span>
    </div>
  );
}
