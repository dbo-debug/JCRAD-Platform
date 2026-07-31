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
  VISIT_OUTCOMES,
  visitStatusChipClass,
} from "@/components/workspace/routeUtils";

type RouteRunnerProps = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  currentUserId: string;
  staffRole: "admin" | "sales";
  focusCustomerId?: string;
  initialFilters: {
    q: string;
    scope: "mine" | "all";
    routeDay: string;
    territory: string;
    visitStatus: string;
    coordinateStatus: string;
    territorySort: string;
    territoryFocus: string;
    view: RouteViewMode;
  };
};

type SelectOption = {
  value: string;
  label: string;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function getCurrentRouteDay() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
}

function addDaysDateValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildEstimateMenuHref(args: {
  customerId: string;
}) {
  const params = new URLSearchParams({
    from: "route_runner",
    customerId: args.customerId,
  });
  return `/menu?${params.toString()}`;
}

export default function RouteRunner({ customers, routeRepOptions, territoryOptions, currentUserId, staffRole, focusCustomerId, initialFilters }: RouteRunnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(initialFilters.q);
  const [scope, setScope] = useState<"mine" | "all">(initialFilters.scope);
  const [routeDayFilter, setRouteDayFilter] = useState(initialFilters.routeDay || getCurrentRouteDay());
  const [territoryFilter, setTerritoryFilter] = useState(initialFilters.territory || "all");
  const [visitStatusFilter, setVisitStatusFilter] = useState(initialFilters.visitStatus || "all");
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

  const routeDays = Array.from(new Set(customers.map((customer) => String(customer.routeDay || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((option) => ({ value: option, label: titleCase(option) }));
  const visitStatuses = Array.from(new Set(customers.map((customer) => String(customer.visitStatus || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((option) => ({ value: option, label: titleCase(option) }));

  const visibleCustomers = [...customers]
    .filter((customer) => {
      if (focusCustomerId && customer.id !== focusCustomerId) return false;
      const query = normalizeText(deferredSearch);
      if (query && !getRouteSearchText(customer).includes(query)) return false;
      if (!focusCustomerId && scope === "mine" && customer.assignedRouteRepUserId !== currentUserId) return false;
      if (routeDayFilter !== "all" && normalizeText(customer.routeDay) !== normalizeText(routeDayFilter)) return false;
      if (territoryFilter !== "all" && normalizeText(customer.territoryCode) !== normalizeText(territoryFilter)) return false;
      if (visitStatusFilter !== "all" && normalizeText(customer.visitStatus) !== normalizeText(visitStatusFilter)) return false;
      if (coordinateStatusFilter === "needs_coords" && customer.latitude !== null && customer.longitude !== null) return false;
      if (coordinateStatusFilter !== "all" && coordinateStatusFilter !== "needs_coords" && getCoordinateCoverageState(customer) !== coordinateStatusFilter) return false;
      return true;
    })
    .sort(sortCustomersForRoute);

  const currentRepLabel = routeRepOptions.find((option) => option.userId === currentUserId)?.label || "Current rep";
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
  const focusedCustomer = focusCustomerId ? visibleCustomers.find((customer) => customer.id === focusCustomerId) || null : null;

  useEffect(() => {
    const params = new URLSearchParams();
    setQueryParam(params, "q", search.trim(), [""]);
    setQueryParam(params, "scope", scope, ["mine", ""]);
    setQueryParam(params, "routeDay", routeDayFilter);
    setQueryParam(params, "territory", territoryFilter);
    setQueryParam(params, "visitStatus", visitStatusFilter);
    setQueryParam(params, "coordStatus", coordinateStatusFilter);
    setQueryParam(params, "territorySort", territorySort, ["account_count", ""]);
    setQueryParam(params, "territoryFocus", territoryFocus);
    setQueryParam(params, "view", viewMode, ["list", ""]);
    if (focusCustomerId) params.set("customerId", focusCustomerId);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [coordinateStatusFilter, focusCustomerId, pathname, routeDayFilter, router, scope, search, territoryFilter, territoryFocus, territorySort, viewMode, visitStatusFilter]);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7f7f4_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[780px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Field Queue Mode</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#181817]">
              {focusCustomerId ? "Focused stop execution" : "Route-scoped stop execution for the field"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">
              {focusCustomerId
                ? "You are focused on one account inside the runner. Capture the visit outcome, create follow-up if needed, and continue back to the broader route flow."
                : "This is the broad route-scoped field queue, not a saved route in progress. Use it to work rep-assigned stops, capture outcomes, and clean up follow-up when you are not running a specific saved route."}
            </p>
          </div>
          <div className="rounded-2xl border border-[#deded8] bg-white/85 p-4 text-sm text-[#506877] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Execution Scope</p>
            <p className="mt-1 text-lg font-semibold text-[#181817]">{currentRepLabel}</p>
            <div className="mt-3 grid gap-2">
              <MetricLine label="Mode" value={focusCustomerId ? "Focused Stop" : "Field Queue"} />
              <MetricLine label="Stops In Scope" value={String(visibleCustomers.length)} />
              <MetricLine label="Due Today" value={String(stats.dueToday)} />
              <MetricLine label="Visited Today" value={String(stats.visitedToday)} />
              <MetricLine label="Follow-Up Needed" value={String(stats.followUpNeeded)} />
              <MetricLine label="No Territory" value={String(stats.noTerritory)} />
              <MetricLine label="No Coords" value={String(stats.noCoords)} />
            </div>
            {focusedCustomer ? (
              <div className="mt-4">
                <Link
                  href={buildEstimateMenuHref({ customerId: focusedCustomer.id })}
                  className="inline-flex rounded-full bg-[#181817] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
                >
                  Build Estimate
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#deded8] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Execution Controls</p>
            <p className="mt-1 text-sm text-[#5c7483]">Tune the field queue by rep, day, territory, and stop readiness before opening a stop card.</p>
          </div>
          <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4f6877]">
            {viewMode === "map" ? "Map view active" : "List view active"}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.9fr))]">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Search stops</span>
            <input
              value={search}
              onChange={(event) => startTransition(() => setSearch(event.target.value))}
              placeholder="Search account, contact, phone, email"
              className="rounded-2xl border border-[#cedde6] bg-[#fafaf8] px-4 py-3 text-sm text-[#181817] outline-none transition focus:border-[#1b1b1a] focus:bg-white"
            />
          </label>

          {staffRole === "admin" ? (
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span className="font-medium">Scope</span>
              <select
                value={scope}
                onChange={(event) => startTransition(() => setScope(event.target.value as "mine" | "all"))}
                className="rounded-2xl border border-[#cedde6] bg-[#fafaf8] px-4 py-3 text-sm text-[#181817] outline-none transition focus:border-[#1b1b1a] focus:bg-white"
              >
                <option value="mine">Assigned to me</option>
                <option value="all">All reps</option>
              </select>
            </label>
          ) : null}

          <SelectFilter label="Route Day" value={routeDayFilter} onChange={setRouteDayFilter} options={routeDays} />
          <SelectFilter label="Territory" value={territoryFilter} onChange={setTerritoryFilter} options={territoryOptions} />
          <SelectFilter
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SelectFilter label="Visit Status" value={visitStatusFilter} onChange={setVisitStatusFilter} options={visitStatuses} />
          <SelectFilter
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
          <SelectFilter
            label="Territory Sort"
            value={territorySort}
            onChange={(value) => setTerritorySort(value as TerritorySortMode)}
            options={[
              { value: "account_count", label: "Account Count" },
              { value: "due_today", label: "Due Today" },
              { value: "follow_up_needed", label: "Follow-Up Needed" },
            ]}
          />
          <div className="inline-flex rounded-full border border-[#deded8] bg-white p-1">
            <button
              type="button"
              onClick={() => startTransition(() => setViewMode("list"))}
              className={["rounded-full px-3 py-1.5 text-sm font-semibold transition", viewMode === "list" ? "bg-[#181817] text-white" : "text-[#7891a0] hover:text-[#181817]"].join(" ")}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setViewMode("map"))}
              className={["rounded-full px-3 py-1.5 text-sm font-semibold transition", viewMode === "map" ? "bg-[#181817] text-white" : "text-[#7891a0] hover:text-[#181817]"].join(" ")}
            >
              Map
            </button>
          </div>
          <Link
            href="/workspace/routes"
            className="inline-flex rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#181817] lg:ml-auto"
          >
            Back to Planner
          </Link>
        </div>
      </section>

      {viewMode === "map" ? (
        <RouteStopsMap
          customers={visibleCustomers}
          title="Runner Map"
          description="See today’s filtered stop set as field-ready points, keep coordinate gaps visible, and jump into the full stop runner or account detail from the selected marker."
          emptyLabel="No filtered runner stops have coordinates yet. Keep using list mode for those accounts until lat/long coverage is filled in."
          secondaryActionLabel="Open Runner Card"
          secondaryActionHref={(customerId) => `/workspace/routes/run?customerId=${customerId}`}
        />
      ) : null}

      <section className={viewMode === "map" ? "hidden" : "space-y-4"}>
        <div className="rounded-2xl border border-[#deded8] bg-white p-4 shadow-[0_12px_32px_rgba(16,42,67,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Runner Flow</p>
          <p className="mt-1 text-sm text-[#5c7483]">Work territory sections in order, open the next stop card, capture the outcome, then move to the next account in sequence.</p>
        </div>

        {territorySections.length > 0 ? (
          <nav className="rounded-[24px] border border-[#deded8] bg-white p-4 shadow-[0_12px_32px_rgba(16,42,67,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory Jump</p>
                <p className="mt-1 text-sm text-[#5c7483]">Work the runner territory-by-territory and jump directly into the next section.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {territorySections.map((territory) => (
                  <a
                    key={territory.territoryKey}
                    href={`#runner-territory-${territory.territoryKey}`}
                    className="rounded-full border border-[#d5e1e8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4a6575] transition hover:bg-white hover:text-[#181817]"
                  >
                    {territory.label} ({territory.accountCount})
                  </a>
                ))}
              </div>
            </div>
          </nav>
        ) : null}

        {territorySections.map((territory) => (
          <section
            key={territory.territoryKey}
            id={`runner-territory-${territory.territoryKey}`}
            className="rounded-[28px] border border-[#deded8] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)]"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory</p>
                <h3 className="mt-1 text-xl font-semibold text-[#181817]">{territory.label}</h3>
                <p className="mt-1 text-sm text-[#5c7483]">
                  {territory.accountCount} stops in scope • {territory.territoryKey === "UNASSIGNED" ? "Needs territory assignment" : territory.territoryKey}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <TerritoryOwnerPill ownerState={territory.ownerState} ownerLabel={territory.ownerLabel} />
                  {territory.unassignedRep > 0 ? <InlinePill tone="warn" label={`${territory.unassignedRep} without rep`} /> : null}
                  {territory.noRouteDay > 0 ? <InlinePill tone="warn" label={`${territory.noRouteDay} without route day`} /> : null}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px] xl:grid-cols-6">
                <MiniMetric label="Accounts" value={territory.accountCount} />
                <MiniMetric label="Due Today" value={territory.dueToday} />
                <MiniMetric label="Visited Today" value={territory.visitedToday} />
                <MiniMetric label="Follow-Up" value={territory.followUpNeeded} />
                <MiniMetric label="No Coords" value={territory.noCoords} />
                <MiniMetric label="No Rep" value={territory.unassignedRep} />
                <MiniMetric label="No Route Day" value={territory.noRouteDay} />
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {territory.customers.map((customer) => (
                <RouteStopCard key={customer.id} customer={customer} />
              ))}
            </div>
          </section>
        ))}

        {visibleCustomers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f7f7f4] px-4 py-6 text-sm text-[#5d7685]">
            No route stops match the current runner filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[] }) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => startTransition(() => onChange(event.target.value))}
        className="rounded-2xl border border-[#cedde6] bg-[#fafaf8] px-4 py-3 text-sm text-[#181817] outline-none transition focus:border-[#1b1b1a] focus:bg-white"
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

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-base font-semibold text-[#181817]">{value}</span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#deded8] bg-[#f7f7f4] px-3 py-2 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#181817]">{value}</p>
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
      ? "border-[#d9ddd9] bg-[#f7f7f4] text-[#1b1b1a]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#deded8] bg-[#f7f7f4] text-[#4f6877]";

  return (
    <span
      title={label}
      className={["inline-flex max-w-full min-w-0 items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}
    >
      {label}
    </span>
  );
}

function RouteStopCard({ customer }: { customer: CustomerSummary }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"visit" | "log" | "task" | "outcome" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visitStatus, setVisitStatus] = useState(customer.visitStatus || "visited");
  const [nextVisitDueAt, setNextVisitDueAt] = useState(customer.nextVisitDueAt ? String(customer.nextVisitDueAt).slice(0, 10) : "");
  const [visitNotes, setVisitNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [autoCreateTask, setAutoCreateTask] = useState(false);

  const primaryContact = customer.primaryContacts[0] || null;
  const emailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
  const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);

  async function submitVisit(payload: Record<string, unknown>, successMessage: string) {
    const res = await fetch(`/api/workspace/customers/${customer.id}/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
    setStatusMessage(successMessage);
    setVisitNotes("");
    router.refresh();
  }

  async function submitTask(taskOverrides?: { title?: string; dueDate?: string | null }) {
    const title = String(taskOverrides?.title || taskTitle).trim();
    if (!title) {
      throw new Error("Enter a follow-up title first.");
    }

    const dueDate = taskOverrides?.dueDate === undefined ? taskDueDate : taskOverrides.dueDate;
    const res = await fetch(`/api/workspace/customers/${customer.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        due_date: dueDate || null,
        assigned_user_id: customer.assignedRouteRepUserId || null,
        priority: customer.routePriority,
      }),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

    setTaskTitle("");
    setTaskDueDate("");
    setAutoCreateTask(false);
  }

  async function runAction(action: "visit" | "log", summary: string) {
    setBusyAction(action);
    setError(null);
    setStatusMessage(null);

    try {
      await submitVisit(
        {
          mark_visited: action === "visit",
          activity_type: action === "visit" ? "visit_completed" : "visit_logged",
          summary,
          notes: visitNotes || null,
          visit_status: visitStatus || null,
          next_visit_due_at: nextVisitDueAt || null,
        },
        action === "visit" ? "Visit recorded." : "Visit activity logged."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function applyOutcome(outcome: (typeof VISIT_OUTCOMES)[number]) {
    setBusyAction("outcome");
    setError(null);
    setStatusMessage(null);

    try {
      const outcomeDueDate = nextVisitDueAt || "";
      const shouldPreserveBlankNextVisit = outcome.nextVisitDays === null && !outcomeDueDate;
      const defaultTaskTitle =
        outcome.key === "interested"
          ? `Follow up with ${customer.name}`
          : outcome.key === "revisit_needed"
            ? `Revisit ${customer.name}`
            : outcome.key === "sample_drop"
              ? `Check in after sample drop for ${customer.name}`
              : outcome.key === "met_buyer"
                ? `Send recap to ${customer.name}`
                : "";

      await submitVisit(
        {
          outcome: outcome.key,
          summary: `${outcome.label} at ${customer.name}`,
          notes: visitNotes || null,
          next_visit_due_at: outcomeDueDate || null,
          preserve_blank_next_visit: shouldPreserveBlankNextVisit,
        },
        `${outcome.label} recorded.`
      );
      if (autoCreateTask) {
        await submitTask({ title: taskTitle || defaultTaskTitle, dueDate: outcomeDueDate || (outcome.nextVisitDays !== null ? addDaysDateValue(outcome.nextVisitDays) : null) });
        setStatusMessage(`${outcome.label} recorded and follow-up task created.`);
      }
      setVisitStatus(outcome.visitStatus);
      if (!outcomeDueDate && outcome.nextVisitDays !== null) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + outcome.nextVisitDays);
        setNextVisitDueAt(nextDate.toISOString().slice(0, 10));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function createFollowUpTask() {
    setBusyAction("task");
    setError(null);
    setStatusMessage(null);

    try {
      await submitTask();
      setStatusMessage("Follow-up task created.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article className="rounded-[24px] border border-[#d9e7ee] bg-white p-4 shadow-[0_14px_40px_rgba(16,42,67,0.05)] lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/workspace/customers/${customer.id}`} className="text-lg font-semibold text-[#181817] transition hover:text-[#1b1b1a]">
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
            {titleCase(customer.routeDay, "No route day")} • Territory {customer.territoryCode || "Unassigned"} • Rep {customer.assignedRouteRepName || "Unassigned"}
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <RunnerInfo
              title="Primary Contact"
              lines={[
                primaryContact?.name || "No primary contact",
                primaryContact?.phone || customer.mainPhone || "No phone",
                primaryContact?.email || customer.primaryContactEmail || "No email",
              ]}
            />
            <RunnerInfo
              title="Visit Window"
              lines={[
                `Next due ${formatDate(customer.nextVisitDueAt)}`,
                `Last visit ${formatDateTime(customer.lastVisitAt)}`,
                `Current status ${titleCase(customer.visitStatus, "Not set")}`,
              ]}
            />
            <RunnerInfo
              title="Routing"
              lines={[
                `Priority ${customer.routePriority ?? "None"} • Territory ${customer.territoryCode || "Unassigned"}`,
                customer.mainPhone ? `Main line ${customer.mainPhone}` : "No main line",
                customer.latitude !== null && customer.longitude !== null ? `Geo ${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}` : "No coordinates yet",
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:w-[240px] lg:flex-none lg:justify-end">
          <Link
            href={buildEstimateMenuHref({ customerId: customer.id })}
            className="rounded-full bg-[#181817] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#0f2a35]"
          >
            Build Estimate
          </Link>
          <Link href={`/workspace/customers/${customer.id}`} className="rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#181817]">
            Open account
          </Link>
          {phoneHref ? (
            <a href={phoneHref} className="rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#181817]">
              Call contact
            </a>
          ) : null}
          {emailHref ? (
            <a href={emailHref} className="rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#181817]">
              Email contact
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-2xl border border-[#e1ebf1] bg-[#fafaf8] p-4">
          <h3 className="text-sm font-semibold text-[#181817]">Visit Actions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {VISIT_OUTCOMES.map((outcome) => (
              <button
                key={outcome.key}
                type="button"
                onClick={() => void applyOutcome(outcome)}
                disabled={busyAction !== null}
                className={["rounded-full border px-3 py-1.5 text-sm font-semibold disabled:opacity-60", outcome.accentClass].join(" ")}
              >
                {busyAction === "outcome" ? "Saving..." : outcome.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#5b7382]">
            {VISIT_OUTCOMES.map((outcome) => (
              <span key={outcome.key} className="rounded-full border border-[#deded8] bg-white px-2 py-1">
                {outcome.label}: {outcome.nextVisitDays === null ? "keeps due date" : `${outcome.nextVisitDays}d follow-up`}
              </span>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span>Status after stop</span>
              <select
                value={visitStatus}
                onChange={(event) => setVisitStatus(event.target.value)}
                className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#181817]"
              >
                {["visited", "scheduled", "due", "overdue", "needs_follow_up", "skipped"].map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span>Next visit due</span>
              <input
                type="date"
                value={nextVisitDueAt}
                onChange={(event) => setNextVisitDueAt(event.target.value)}
                className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#181817]"
              />
            </label>
          </div>

          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Visit notes</span>
            <textarea
              value={visitNotes}
              onChange={(event) => setVisitNotes(event.target.value)}
              rows={3}
              placeholder="What happened at this stop?"
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#181817]"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction("visit", `Visited ${customer.name}`)}
              disabled={busyAction !== null}
              className="rounded-full bg-[#1b1b1a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busyAction === "visit" ? "Saving..." : "Mark visited"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("log", `Logged visit update for ${customer.name}`)}
              disabled={busyAction !== null}
              className="rounded-full border border-[#ddcfe8] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] disabled:opacity-60"
            >
              {busyAction === "log" ? "Saving..." : "Log visit activity"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e1ebf1] bg-[#fafaf8] p-4">
          <h3 className="text-sm font-semibold text-[#181817]">Follow-up Task</h3>
          <label className="mt-3 flex items-center gap-2 text-sm text-[#4b6676]">
            <input type="checkbox" checked={autoCreateTask} onChange={(event) => setAutoCreateTask(event.target.checked)} className="h-4 w-4 rounded border-[#deded8] text-[#1b1b1a]" />
            <span>Create task on next outcome</span>
          </label>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Task title</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Send quote recap, call back, collect info"
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#181817]"
            />
          </label>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Due date</span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(event) => setTaskDueDate(event.target.value)}
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#181817]"
            />
          </label>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void createFollowUpTask()}
              disabled={busyAction !== null}
              className="rounded-full border border-[#ddcfe8] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] disabled:opacity-60"
            >
              {busyAction === "task" ? "Saving..." : "Create follow-up task"}
            </button>
          </div>
        </section>
      </div>

      {error ? <p className="mt-3 text-sm text-[#9a3d3d]">{error}</p> : null}
      {statusMessage ? <p className="mt-3 text-sm text-[#16624b]">{statusMessage}</p> : null}
    </article>
  );
}

function RunnerInfo({ title, lines }: { title: string; lines: Array<string | null> }) {
  return (
    <div className="rounded-xl border border-[#dfe9ef] bg-white px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#5a7483]">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
