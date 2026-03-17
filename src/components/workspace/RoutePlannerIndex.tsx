"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { RouteRepOption, TerritoryOption } from "@/lib/routeWorkspace";
import {
  buildRouteStats,
  formatDate,
  formatDateTime,
  getRouteSearchText,
  normalizeMailtoHref,
  normalizeTelHref,
  normalizeText,
  priorityChipClass,
  RouteViewMode,
  setQueryParam,
  sortCustomersForRoute,
  titleCase,
  visitStatusChipClass,
} from "@/components/workspace/routeUtils";

type RoutePlannerIndexProps = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  initialFilters: {
    q: string;
    routeDay: string;
    territory: string;
    rep: string;
    visitStatus: string;
    priority: string;
    view: RouteViewMode;
  };
};

export default function RoutePlannerIndex({ customers, routeRepOptions, territoryOptions, initialFilters }: RoutePlannerIndexProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(initialFilters.q);
  const [routeDayFilter, setRouteDayFilter] = useState(initialFilters.routeDay || "all");
  const [territoryFilter, setTerritoryFilter] = useState(initialFilters.territory || "all");
  const [repFilter, setRepFilter] = useState(initialFilters.rep || "all");
  const [visitStatusFilter, setVisitStatusFilter] = useState(initialFilters.visitStatus || "all");
  const [routePriorityFilter, setRoutePriorityFilter] = useState(initialFilters.priority || "all");
  const [viewMode] = useState<RouteViewMode>(initialFilters.view === "map" ? "map" : "list");
  const [referenceNow] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search);

  const routeDays = uniqueOptions(customers.map((customer) => customer.routeDay));
  const visitStatuses = uniqueOptions(customers.map((customer) => customer.visitStatus));
  const routePriorities = uniqueOptions(customers.map((customer) => (customer.routePriority === null ? null : String(customer.routePriority))));

  const visibleCustomers = [...customers]
    .filter((customer) => {
      const query = normalizeText(deferredSearch);
      if (query && !getRouteSearchText(customer).includes(query)) return false;
      if (routeDayFilter !== "all" && normalizeText(customer.routeDay) !== normalizeText(routeDayFilter)) return false;
      if (territoryFilter !== "all" && normalizeText(customer.territoryCode) !== normalizeText(territoryFilter)) return false;
      if (repFilter !== "all" && customer.assignedRouteRepUserId !== repFilter) return false;
      if (visitStatusFilter !== "all" && normalizeText(customer.visitStatus) !== normalizeText(visitStatusFilter)) return false;
      if (routePriorityFilter !== "all" && String(customer.routePriority ?? "") !== routePriorityFilter) return false;
      return true;
    })
    .sort(sortCustomersForRoute);

  const groupedCustomers = new Map<string, CustomerSummary[]>();
  for (const customer of visibleCustomers) {
    const key = customer.routeDay || "Unassigned";
    const existing = groupedCustomers.get(key) || [];
    existing.push(customer);
    groupedCustomers.set(key, existing);
  }

  const stats = buildRouteStats(visibleCustomers, referenceNow);

  useEffect(() => {
    const params = new URLSearchParams();
    setQueryParam(params, "q", search.trim(), [""]);
    setQueryParam(params, "routeDay", routeDayFilter);
    setQueryParam(params, "territory", territoryFilter);
    setQueryParam(params, "rep", repFilter);
    setQueryParam(params, "visitStatus", visitStatusFilter);
    setQueryParam(params, "priority", routePriorityFilter);
    setQueryParam(params, "view", viewMode, ["list", ""]);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, repFilter, routeDayFilter, routePriorityFilter, router, search, territoryFilter, viewMode, visitStatusFilter]);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[780px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Route Planning</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Operational stop list for field coverage, rep assignment, and visit cadence</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">
              Filter by route day, territory, assigned rep, visit state, and priority. Accounts are grouped for daily execution even before map tools are added.
            </p>
          </div>
          <div className="grid w-full gap-3 rounded-2xl border border-[#dbe8ef] bg-white/85 p-4 shadow-sm sm:max-w-[320px] xl:w-[320px] xl:flex-none">
            <MetricLine label="Due Today" value={String(stats.dueToday)} />
            <MetricLine label="Visited Today" value={String(stats.visitedToday)} />
            <MetricLine label="Follow-Up Needed" value={String(stats.followUpNeeded)} />
            <MetricLine label="No Territory" value={String(stats.noTerritory)} />
            <MetricLine label="No Coords" value={String(stats.noCoords)} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,0.85fr))]">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Search stops</span>
            <input
              value={search}
              onChange={(event) => startTransition(() => setSearch(event.target.value))}
              placeholder="Search account, contact, territory, route day, rep"
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
          </label>

          <FilterSelect label="Route Day" value={routeDayFilter} onChange={setRouteDayFilter} options={routeDays} />
          <FilterSelect label="Territory" value={territoryFilter} onChange={setTerritoryFilter} options={territoryOptions} />
          <FilterSelect label="Assigned Rep" value={repFilter} onChange={setRepFilter} options={routeRepOptions.map((option) => ({ value: option.userId, label: option.label }))} />
          <FilterSelect label="Visit Status" value={visitStatusFilter} onChange={setVisitStatusFilter} options={visitStatuses} />
          <FilterSelect label="Priority" value={routePriorityFilter} onChange={setRoutePriorityFilter} options={routePriorities} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-[#d0dde5] bg-white p-1">
            <button type="button" className="rounded-full bg-[#173543] px-3 py-1.5 text-sm font-semibold text-white">
              List
            </button>
            <button
              type="button"
              disabled
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-[#7891a0] disabled:cursor-not-allowed"
              title="Map mode is planned next."
            >
              Map Soon
            </button>
          </div>
          <Link
            href="/workspace/routes/run"
            className="inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Open Route Runner
          </Link>
          <button
            type="button"
            onClick={() => {
              startTransition(() => {
                setSearch("");
                setRouteDayFilter("all");
                setTerritoryFilter("all");
                setRepFilter("all");
                setVisitStatusFilter("all");
                setRoutePriorityFilter("all");
              });
            }}
            className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Reset filters
          </button>
        </div>
      </section>

      {viewMode === "map" ? (
        <section className="rounded-[28px] border border-dashed border-[#d3e1e8] bg-white p-6 text-sm text-[#5d7685] shadow-[0_12px_32px_rgba(16,42,67,0.04)]">
          Map mode is staged next. The planner is keeping list grouping, route stats, and URL-backed filters ready for the map/list toggle.
        </section>
      ) : null}

      <section className="space-y-5">
        {Array.from(groupedCustomers.entries()).map(([group, groupCustomers]) => (
          <div key={group} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Route Day</p>
                <h3 className="text-xl font-semibold text-[#173543]">{titleCase(group, "Unassigned")}</h3>
              </div>
              <p className="text-sm text-[#5b7382]">{groupCustomers.length} stops</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {groupCustomers.map((customer) => {
                const primaryContact = customer.primaryContacts[0] || null;
                const emailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
                const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);

                return (
                  <article
                    key={customer.id}
                    className="rounded-[24px] border border-[#d9e7ee] bg-white p-5 shadow-[0_14px_40px_rgba(16,42,67,0.05)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/workspace/customers/${customer.id}`} className="text-lg font-semibold text-[#173543] transition hover:text-[#0f766e]">
                            {customer.name}
                          </Link>
                          <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", visitStatusChipClass(customer.visitStatus)].join(" ")}>
                            {titleCase(customer.visitStatus, "No visit status")}
                          </span>
                          <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", priorityChipClass(customer.routePriority)].join(" ")}>
                            Priority {customer.routePriority ?? "None"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-[#5a7483]">
                          Territory {customer.territoryCode || "Unassigned"} • Rep {customer.assignedRouteRepName || "Unassigned"}
                        </p>
                      </div>

                      <Link
                        href={`/workspace/routes/run?customerId=${customer.id}`}
                        className="inline-flex rounded-full border border-[#b9d5df] bg-white px-3 py-1.5 text-sm font-semibold text-[#21414d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                      >
                        Run Stop
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <InfoBlock
                        label="Primary Contact"
                        title={primaryContact?.name || "No primary contact"}
                        lines={[primaryContact?.title || null, primaryContact?.email || customer.primaryContactEmail || null, primaryContact?.phone || customer.mainPhone || null]}
                      />
                      <InfoBlock
                        label="Visit Cadence"
                        title={`Next due ${formatDate(customer.nextVisitDueAt)}`}
                        lines={[
                          `Last visit ${formatDateTime(customer.lastVisitAt)}`,
                          `Priority ${customer.routePriority ?? "None"} • Territory ${customer.territoryCode || "Unassigned"}`,
                          customer.latitude !== null && customer.longitude !== null ? `Geo ${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}` : "No coordinates yet",
                        ]}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <Link href={`/workspace/customers/${customer.id}`} className="rounded-full border border-[#d5e1e8] bg-[#f8fbfc] px-3 py-1.5 text-[#4a6575] transition hover:bg-white">
                        Open account
                      </Link>
                      {phoneHref ? (
                        <a href={phoneHref} className="rounded-full border border-[#d5e1e8] bg-[#f8fbfc] px-3 py-1.5 text-[#4a6575] transition hover:bg-white">
                          Call contact
                        </a>
                      ) : null}
                      {emailHref ? (
                        <a href={emailHref} className="rounded-full border border-[#d5e1e8] bg-[#f8fbfc] px-3 py-1.5 text-[#4a6575] transition hover:bg-white">
                          Email contact
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {visibleCustomers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-6 text-sm text-[#5d7685]">
            No route stops match the current filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function uniqueOptions(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: titleCase(value) }));
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-[#506877]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-lg font-semibold text-[#173543]">{value}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => startTransition(() => onChange(event.target.value))}
        className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoBlock({ label, title, lines }: { label: string; title: string; lines: Array<string | null> }) {
  return (
    <div className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</p>
      <p className="mt-1 font-semibold text-[#173543]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#5a7483]">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
