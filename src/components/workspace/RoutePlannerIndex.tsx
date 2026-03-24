"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { RouteRepOption, TerritoryOption } from "@/lib/routeWorkspace";
import RouteStopsMap from "@/components/workspace/RouteStopsMap";
import {
  buildRouteStats,
  buildTerritoryStats,
  CoordinateCoverageFilter,
  formatDate,
  formatDateTime,
  getCoordinateCoverageState,
  getRouteSearchText,
  normalizeMailtoHref,
  normalizeTelHref,
  normalizeText,
  priorityChipClass,
  RouteViewMode,
  setQueryParam,
  sortCustomersForRoute,
  sortTerritoryStats,
  TerritoryFocusMode,
  TerritorySortMode,
  titleCase,
  visitStatusChipClass,
} from "@/components/workspace/routeUtils";

type RoutePlannerIndexProps = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  currentUserId: string;
  initialFilters: {
    q: string;
    routeDay: string;
    territory: string;
    rep: string;
    visitStatus: string;
    priority: string;
    coordinateStatus: string;
    territorySort: string;
    territoryFocus: string;
    view: RouteViewMode;
  };
};

export default function RoutePlannerIndex({ customers, routeRepOptions, territoryOptions, currentUserId, initialFilters }: RoutePlannerIndexProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(initialFilters.q);
  const [routeDayFilter, setRouteDayFilter] = useState(initialFilters.routeDay || "all");
  const [territoryFilter, setTerritoryFilter] = useState(initialFilters.territory || "all");
  const [repFilter, setRepFilter] = useState(initialFilters.rep || "all");
  const [visitStatusFilter, setVisitStatusFilter] = useState(initialFilters.visitStatus || "all");
  const [routePriorityFilter, setRoutePriorityFilter] = useState(initialFilters.priority || "all");
  const [coordinateStatusFilter, setCoordinateStatusFilter] = useState<CoordinateCoverageFilter>(
    initialFilters.coordinateStatus === "has_coords" ||
      initialFilters.coordinateStatus === "needs_coords" ||
      initialFilters.coordinateStatus === "failed" ||
      initialFilters.coordinateStatus === "needs_review" ||
      initialFilters.coordinateStatus === "address_ready" ||
      initialFilters.coordinateStatus === "missing_address"
      ? initialFilters.coordinateStatus
      : "all"
  );
  const [territorySort, setTerritorySort] = useState<TerritorySortMode>(
    initialFilters.territorySort === "due_today" || initialFilters.territorySort === "follow_up_needed" ? initialFilters.territorySort : "account_count"
  );
  const [territoryFocus, setTerritoryFocus] = useState<TerritoryFocusMode>(
    initialFilters.territoryFocus === "my_territories" ||
      initialFilters.territoryFocus === "unassigned_territories" ||
      initialFilters.territoryFocus === "due_heavy" ||
      initialFilters.territoryFocus === "cleanup"
      ? initialFilters.territoryFocus
      : "all"
  );
  const [viewMode, setViewMode] = useState<RouteViewMode>(initialFilters.view === "map" ? "map" : "list");
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
      if (coordinateStatusFilter === "needs_coords" && customer.latitude !== null && customer.longitude !== null) return false;
      if (coordinateStatusFilter !== "all" && coordinateStatusFilter !== "needs_coords" && getCoordinateCoverageState(customer) !== coordinateStatusFilter) return false;
      return true;
    })
    .sort(sortCustomersForRoute);

  const stats = buildRouteStats(visibleCustomers, referenceNow);
  const territoryLabelMap = new Map(territoryOptions.map((option) => [option.value, option.label]));
  const routeRepLabelMap = new Map(routeRepOptions.map((option) => [option.userId, option.label]));
  const territorySections = sortTerritoryStats(buildTerritoryStats(visibleCustomers, referenceNow), territorySort)
    .map((territory) => ({
      ...territory,
      label: territory.territoryKey === "UNASSIGNED" ? "Unassigned Territory" : territoryLabelMap.get(territory.territoryKey) || territory.territoryKey,
      ownerLabel: territory.ownerUserId ? routeRepLabelMap.get(territory.ownerUserId) || "Assigned rep" : null,
      customers: [...territory.customers].sort(sortCustomersForRoute),
    }))
    .filter((territory) => {
      if (territoryFocus === "my_territories") return territory.ownerUserId === currentUserId;
      if (territoryFocus === "unassigned_territories") return territory.ownerState === "unassigned" || territory.unassignedRep > 0;
      if (territoryFocus === "due_heavy") return territory.dueToday > 0;
      if (territoryFocus === "cleanup") return territory.noCoords > 0 || territory.unassignedRep > 0 || territory.noRouteDay > 0;
      return true;
    });

  useEffect(() => {
    const params = new URLSearchParams();
    setQueryParam(params, "q", search.trim(), [""]);
    setQueryParam(params, "routeDay", routeDayFilter);
    setQueryParam(params, "territory", territoryFilter);
    setQueryParam(params, "rep", repFilter);
    setQueryParam(params, "visitStatus", visitStatusFilter);
    setQueryParam(params, "priority", routePriorityFilter);
    setQueryParam(params, "coordStatus", coordinateStatusFilter);
    setQueryParam(params, "territorySort", territorySort, ["account_count", ""]);
    setQueryParam(params, "territoryFocus", territoryFocus);
    setQueryParam(params, "view", viewMode, ["list", ""]);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [coordinateStatusFilter, pathname, repFilter, routeDayFilter, routePriorityFilter, router, search, territoryFilter, territoryFocus, territorySort, viewMode, visitStatusFilter]);

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
          <FilterSelect
            label="Coordinates"
            value={coordinateStatusFilter}
            onChange={(value) => setCoordinateStatusFilter(value as CoordinateCoverageFilter)}
            options={[
              { value: "has_coords", label: "Map Ready" },
              { value: "needs_coords", label: "Needs Coordinates" },
              { value: "failed", label: "Geocode Failed" },
              { value: "needs_review", label: "Needs Review" },
              { value: "address_ready", label: "Has Address, Missing Coords" },
              { value: "missing_address", label: "No Address, No Coords" },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Territory Focus"
            value={territoryFocus}
            onChange={(value) => setTerritoryFocus(value as TerritoryFocusMode)}
            options={[
              { value: "my_territories", label: "My Territories" },
              { value: "unassigned_territories", label: "Unassigned Territories" },
              { value: "due_heavy", label: "Most Due Today" },
              { value: "cleanup", label: "Needs Cleanup" },
            ]}
          />
          <FilterSelect
            label="Territory Sort"
            value={territorySort}
            onChange={(value) => setTerritorySort(value as TerritorySortMode)}
            options={[
              { value: "account_count", label: "Account Count" },
              { value: "due_today", label: "Due Today" },
              { value: "follow_up_needed", label: "Follow-Up Needed" },
            ]}
          />
          <div className="inline-flex rounded-full border border-[#d0dde5] bg-white p-1">
            <button
              type="button"
              onClick={() => startTransition(() => setViewMode("list"))}
              className={["rounded-full px-3 py-1.5 text-sm font-semibold transition", viewMode === "list" ? "bg-[#173543] text-white" : "text-[#7891a0] hover:text-[#173543]"].join(" ")}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setViewMode("map"))}
              className={["rounded-full px-3 py-1.5 text-sm font-semibold transition", viewMode === "map" ? "bg-[#173543] text-white" : "text-[#7891a0] hover:text-[#173543]"].join(" ")}
            >
              Map
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
                setCoordinateStatusFilter("all");
                setTerritorySort("account_count");
                setTerritoryFocus("all");
              });
            }}
            className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Reset filters
          </button>
        </div>
      </section>

      {viewMode === "map" ? (
        <RouteStopsMap
          customers={visibleCustomers}
          title="Map View"
          description="Map the filtered stop set by customer coordinates, keep list-only stops visible when coordinates are missing, and jump directly into account detail or the route runner."
          emptyLabel="No filtered stops have coordinates yet. Adjust filters or keep using the list workflow while location coverage is completed."
          secondaryActionLabel="Run Stop"
          secondaryActionHref={(customerId) => `/workspace/routes/run?customerId=${customerId}`}
        />
      ) : null}

      <section className={viewMode === "map" ? "hidden" : "space-y-5"}>
        {territorySections.length > 0 ? (
          <nav className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-[0_12px_32px_rgba(16,42,67,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory Jump</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {territorySections.map((territory) => (
                <a
                  key={territory.territoryKey}
                  href={`#planner-territory-${territory.territoryKey}`}
                  className="rounded-full border border-[#d5e1e8] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4a6575] transition hover:bg-white hover:text-[#173543]"
                >
                    {territory.label} ({territory.accountCount})
                  </a>
                ))}
              </div>
          </nav>
        ) : null}

        {territorySections.map((territory, index) => (
          <details
            key={territory.territoryKey}
            id={`planner-territory-${territory.territoryKey}`}
            open={index < 3}
            className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)]"
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#173543]">{territory.label}</h3>
                  <p className="mt-1 text-sm text-[#5b7382]">
                    {territory.territoryKey === "UNASSIGNED" ? "Accounts still need territory assignment." : `${territory.territoryKey} coverage workspace`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <TerritoryOwnerPill ownerState={territory.ownerState} ownerLabel={territory.ownerLabel} />
                    {territory.unassignedRep > 0 ? <InlinePill tone="warn" label={`${territory.unassignedRep} without rep`} /> : null}
                    {territory.noRouteDay > 0 ? <InlinePill tone="warn" label={`${territory.noRouteDay} without route day`} /> : null}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 2xl:min-w-[520px] xl:grid-cols-4 2xl:grid-cols-6">
                  <MiniMetric label="Accounts" value={territory.accountCount} />
                  <MiniMetric label="Due Today" value={territory.dueToday} />
                  <MiniMetric label="Visited Today" value={territory.visitedToday} />
                  <MiniMetric label="Follow-Up" value={territory.followUpNeeded} />
                  <MiniMetric label="No Coords" value={territory.noCoords} />
                  <MiniMetric label="No Rep" value={territory.unassignedRep} />
                  <MiniMetric label="No Route Day" value={territory.noRouteDay} />
                </div>
              </div>
            </summary>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {territory.customers.map((customer) => {
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
          </details>
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#dbe8ef] bg-[#f8fbfc] px-3 py-2 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#173543]">{value}</p>
    </div>
  );
}

function TerritoryOwnerPill({ ownerState, ownerLabel }: { ownerState: "owned" | "partial" | "mixed" | "unassigned"; ownerLabel: string | null }) {
  if (ownerState === "owned" && ownerLabel) return <InlinePill tone="ok" label={`Owned by ${ownerLabel}`} />;
  if (ownerState === "partial" && ownerLabel) return <InlinePill tone="warn" label={`Primary rep ${ownerLabel}`} />;
  if (ownerState === "mixed") return <InlinePill tone="neutral" label="Mixed rep ownership" />;
  return <InlinePill tone="warn" label="Territory unassigned" />;
}

function InlinePill({ label, tone }: { label: string; tone: "neutral" | "warn" | "ok" }) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  return (
    <span
      title={label}
      className={["inline-flex max-w-full min-w-0 items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}
    >
      {label}
    </span>
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
