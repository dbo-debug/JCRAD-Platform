"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import { priorityChipClass, titleCase, visitStatusChipClass } from "@/components/workspace/routeUtils";

type RouteStopsMapProps = {
  customers: CustomerSummary[];
  title: string;
  description: string;
  emptyLabel: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: (customerId: string) => string;
};

type ProjectedStop = {
  customer: CustomerSummary;
  x: number;
  y: number;
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

function projectCustomer(customer: CustomerSummary): ProjectedStop | null {
  if (customer.latitude === null || customer.longitude === null) return null;

  const xRatio = (customer.longitude - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio = (MAP_BOUNDS.maxLat - customer.latitude) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);

  return {
    customer,
    x: clamp(xRatio * 100, 4, 96),
    y: clamp(yRatio * 100, 6, 94),
  };
}

export default function RouteStopsMap({
  customers,
  title,
  description,
  emptyLabel,
  secondaryActionLabel,
  secondaryActionHref,
}: RouteStopsMapProps) {
  const withCoords = useMemo(() => customers.map(projectCustomer).filter((stop): stop is ProjectedStop => Boolean(stop)), [customers]);
  const withoutCoords = useMemo(() => customers.filter((customer) => customer.latitude === null || customer.longitude === null), [customers]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(withCoords[0]?.customer.id || "");

  const selectedStop =
    withCoords.find((stop) => stop.customer.id === selectedCustomerId) ||
    withCoords[0] ||
    null;

  return (
    <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">{title}</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#173543]">Filtered stop map for field execution</h3>
          <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">{description}</p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-4 text-sm text-[#506877] shadow-sm sm:min-w-[220px]">
          <MapMetric label="Mapped Stops" value={String(withCoords.length)} />
          <MapMetric label="No Coords" value={String(withoutCoords.length)} />
          <MapMetric label="Territory Open" value={String(customers.filter((customer) => !customer.territoryCode).length)} />
        </div>
      </div>

      {withCoords.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-8 text-sm text-[#5d7685]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
          <div className="relative overflow-hidden rounded-[24px] border border-[#dbe8ef] bg-[linear-gradient(180deg,#f6fbfd_0%,#ecf7fa_100%)] shadow-sm">
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

            <div className="relative aspect-[1.45/1] min-h-[420px]">
              {withCoords.map((stop) => {
                const isSelected = selectedStop?.customer.id === stop.customer.id;
                const pointSize = stop.customer.routePriority !== null && stop.customer.routePriority <= 2 ? "h-4 w-4" : "h-3.5 w-3.5";

                return (
                  <button
                    key={stop.customer.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(stop.customer.id)}
                    className={[
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_8px_20px_rgba(16,42,67,0.22)] transition",
                      pointSize,
                      isSelected ? "z-20 scale-125 bg-[#173543]" : "z-10 bg-[#14b8a6] hover:scale-110",
                    ].join(" ")}
                    style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                    aria-label={`Open stop summary for ${stop.customer.name}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid gap-4">
            {selectedStop ? (
              <div className="rounded-[24px] border border-[#dbe8ef] bg-[#fbfdfe] p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold text-[#173543]">{selectedStop.customer.name}</h4>
                  <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", visitStatusChipClass(selectedStop.customer.visitStatus)].join(" ")}>
                    {titleCase(selectedStop.customer.visitStatus, "No visit status")}
                  </span>
                  <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", priorityChipClass(selectedStop.customer.routePriority)].join(" ")}>
                    Priority {selectedStop.customer.routePriority ?? "None"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#58717f]">
                  Territory {selectedStop.customer.territoryCode || "Unassigned"} • {titleCase(selectedStop.customer.routeDay, "No route day")}
                </p>
                <div className="mt-4 grid gap-3 rounded-2xl border border-[#e1ebf1] bg-white p-3 text-sm text-[#4f6877]">
                  <InfoLine label="Primary Contact" value={selectedStop.customer.primaryContacts[0]?.name || "No primary contact"} />
                  <InfoLine label="Contact Info" value={selectedStop.customer.primaryContacts[0]?.email || selectedStop.customer.mainPhone || "No contact info"} />
                  <InfoLine
                    label="Coordinates"
                    value={
                      selectedStop.customer.latitude !== null && selectedStop.customer.longitude !== null
                        ? `${selectedStop.customer.latitude.toFixed(4)}, ${selectedStop.customer.longitude.toFixed(4)}`
                        : "No coordinates"
                    }
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/workspace/customers/${selectedStop.customer.id}`}
                    className="rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
                  >
                    Open Account
                  </Link>
                  {secondaryActionLabel && secondaryActionHref ? (
                    <Link
                      href={secondaryActionHref(selectedStop.customer.id)}
                      className="rounded-full border border-[#cfdde6] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                    >
                      {secondaryActionLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

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
                      Territory {customer.territoryCode || "Unassigned"} • {titleCase(customer.routeDay, "No route day")}
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="max-w-[68%] text-right text-sm text-[#173543]">{value}</span>
    </div>
  );
}
