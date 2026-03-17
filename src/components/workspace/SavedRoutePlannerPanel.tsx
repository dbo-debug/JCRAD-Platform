"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { PendingRouteStop } from "@/lib/routeStopQueue";
import type { RouteRepOption, SavedRouteSummary, TerritoryOption } from "@/lib/routeWorkspace";
import RouteStopsMap from "@/components/workspace/RouteStopsMap";
import { JC_RAD_HQ } from "@/lib/routePlanning";

type SavedRoutePlannerPanelProps = {
  customers: CustomerSummary[];
  currentUserId: string;
  pendingStops: PendingRouteStop[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  savedRoutes: SavedRouteSummary[];
};

type DraftStop = {
  customerId: string;
  customerName: string;
  territoryCode: string | null;
  routeDay: string | null;
  queueId: string | null;
  stopOrder: number;
  plannedArrivalTime: string;
  plannedDepartureTime: string;
  estimatedDriveMinutesFromPrevious: number;
  estimatedVisitMinutes: number;
  legDistanceMeters: number;
};

type LunchBlock = {
  startTime: string;
  endTime: string;
  minutes: number;
};

type PlannedRoute = {
  provider: "google" | "fallback";
  orderedStops: DraftStop[];
  lunchBlock: LunchBlock | null;
  lunchMinutes: number;
  estimatedDriveMinutes: number;
  estimatedVisitMinutes: number;
  estimatedTotalMinutes: number;
  projectedFinishTime: string | null;
  estimatedReturnTime: string | null;
  returnDriveMinutes: number;
  polyline: string | null;
  warning: string | null;
};

function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return Promise.resolve({});
  return res.json().catch(() => ({}));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Not set";
  return new Date(parsed).toLocaleString();
}

function toTimeLabel(minutesFromMidnight: number) {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHour = ((hours + 11) % 12) + 1;
  return `${normalizedHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function parseStartTimeMinutes(value: string) {
  const [hoursText, minutesText] = String(value || "").split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 9 * 60;
  return hours * 60 + minutes;
}

function deriveRouteTerritoryCode(stops: DraftStop[], explicitTerritoryCode: string) {
  if (explicitTerritoryCode) return explicitTerritoryCode;
  const territoryCodes = Array.from(new Set(stops.map((stop) => stop.territoryCode).filter((value): value is string => Boolean(value))));
  return territoryCodes.length === 1 ? territoryCodes[0] : "";
}

function getMissingCoordLabel(customer: CustomerSummary) {
  if (customer.latitude !== null && customer.longitude !== null) return "Coords ready";
  if (customer.geocodeStatus === "failed") return "Geocode failed";
  if (customer.geocodeStatus === "needs_review") return "Needs review";
  if (customer.address1 || customer.city || customer.state || customer.postalCode) return "Missing coords";
  return "No address";
}

export default function SavedRoutePlannerPanel({
  customers,
  currentUserId,
  pendingStops: initialPendingStops,
  routeRepOptions,
  territoryOptions,
  savedRoutes,
}: SavedRoutePlannerPanelProps) {
  const router = useRouter();
  const [pendingStops, setPendingStops] = useState(initialPendingStops);
  const [territoryCode, setTerritoryCode] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [maxStops, setMaxStops] = useState("12");
  const [notes, setNotes] = useState("");
  const [draftStops, setDraftStops] = useState<DraftStop[]>([]);
  const [draftSource, setDraftSource] = useState<"pending" | "territory" | null>(null);
  const [draftPlan, setDraftPlan] = useState<PlannedRoute | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate_pending" | "generate_territory" | "save" | "queue" | null>(null);

  const selectedTerritory = territoryOptions.find((option) => option.value === territoryCode) || null;
  const coordinateReadyPendingStops = pendingStops.filter((stop) => stop.customer.latitude !== null && stop.customer.longitude !== null);
  const candidateCustomers = customers.filter(
    (customer) => customer.territoryCode === territoryCode && customer.latitude !== null && customer.longitude !== null
  );
  const normalizedMaxStops = Math.max(1, Math.min(40, Number(maxStops) || 12));
  const derivedRouteTerritoryCode = deriveRouteTerritoryCode(draftStops, territoryCode);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const draftMapCustomers = draftStops
    .map((stop) => customerById.get(stop.customerId))
    .filter((customer): customer is CustomerSummary => Boolean(customer));

  function applyPlannedRoute(nextPlan: PlannedRoute, source: "pending" | "territory") {
    setDraftPlan(nextPlan);
    setDraftStops(nextPlan.orderedStops);
    setDraftSource(source);
  }

  async function syncPendingStops(args: { method: "DELETE"; body: Record<string, unknown> }) {
    const res = await fetch("/api/workspace/route-stop-queue", {
      method: args.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Pending stop update failed (${res.status})`));

    const queueRows = Array.isArray(json.queue) ? (json.queue as Array<Record<string, unknown>>) : [];
    const nextPendingStops: PendingRouteStop[] = [];

    queueRows.forEach((row) => {
      const customerId = String(row.customer_id || row.customerId || "").trim();
      const customer = customerById.get(customerId);
      const id = String(row.id || "").trim();
      if (!customer || !id || !customerId) return;

      nextPendingStops.push({
        id,
        customerId,
        addedByUserId: String(row.added_by_user_id || row.addedByUserId || currentUserId).trim(),
        createdAt: String(row.created_at || row.createdAt || "").trim() || null,
        customer,
      });
    });

    setPendingStops(nextPendingStops);
    return nextPendingStops;
  }

  async function generatePlan(args: {
    source: "pending" | "territory";
    stops: Array<{
      customer_id: string;
      customer_name: string;
      territory_code: string | null;
      route_day: string | null;
      latitude: number;
      longitude: number;
      queue_id?: string | null;
    }>;
  }) {
    const busyKey = args.source === "pending" ? "generate_pending" : "generate_territory";
    setBusy(busyKey);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workspace/routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_date: routeDate,
          planned_start_time: startTime,
          max_stops: normalizedMaxStops,
          stops: args.stops.slice(0, normalizedMaxStops),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Route planning failed (${res.status})`));

      const plan = (json.plan || null) as PlannedRoute | null;
      if (!plan) throw new Error("Route planning did not return a plan");

      applyPlannedRoute(plan, args.source);
      setStatusMessage(
        plan.orderedStops.length > 0
          ? `Generated a ${plan.orderedStops.length}-stop ${args.source === "pending" ? "pending-stop" : "territory"} route with ${plan.provider === "google" ? "Google routing" : "fallback routing"}.`
          : "No coordinate-ready customers were available for route planning."
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Route planning failed");
    } finally {
      setBusy(null);
    }
  }

  function generatePendingDraft() {
    void generatePlan({
      source: "pending",
      stops: coordinateReadyPendingStops.map((stop) => ({
        customer_id: stop.customerId,
        customer_name: stop.customer.name,
        territory_code: stop.customer.territoryCode,
        route_day: stop.customer.routeDay,
        latitude: stop.customer.latitude as number,
        longitude: stop.customer.longitude as number,
        queue_id: stop.id,
      })),
    });
  }

  function generateTerritoryDraft() {
    if (!territoryCode) {
      setStatusMessage("Choose a territory first.");
      return;
    }

    void generatePlan({
      source: "territory",
      stops: candidateCustomers.map((customer) => ({
        customer_id: customer.id,
        customer_name: customer.name,
        territory_code: customer.territoryCode,
        route_day: customer.routeDay,
        latitude: customer.latitude as number,
        longitude: customer.longitude as number,
      })),
    });
  }

  function moveStop(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftStops.length) return;
    const nextStops = [...draftStops];
    const [stop] = nextStops.splice(index, 1);
    nextStops.splice(nextIndex, 0, stop);
    setDraftStops(nextStops.map((item, nextOrder) => ({ ...item, stopOrder: nextOrder + 1 })));
    setDraftPlan((current) => (current ? { ...current, orderedStops: nextStops.map((item, nextOrder) => ({ ...item, stopOrder: nextOrder + 1 })) } : current));
  }

  async function removePendingStop(queueId: string) {
    setBusy("queue");
    setStatusMessage(null);

    try {
      const nextPendingStops = await syncPendingStops({
        method: "DELETE",
        body: { queue_ids: [queueId] },
      });
      if (draftSource === "pending") {
        const nextQueueIdSet = new Set(nextPendingStops.map((stop) => stop.id));
        const nextStops = draftStops.filter((stop) => !stop.queueId || nextQueueIdSet.has(stop.queueId));
        setDraftStops(nextStops.map((stop, index) => ({ ...stop, stopOrder: index + 1 })));
        setDraftPlan((current) =>
          current ? { ...current, orderedStops: nextStops.map((stop, index) => ({ ...stop, stopOrder: index + 1 })) } : current
        );
      }
      setStatusMessage("Removed stop from pending stops.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Pending stop update failed");
    } finally {
      setBusy(null);
    }
  }

  async function clearPendingStops() {
    setBusy("queue");
    setStatusMessage(null);

    try {
      await syncPendingStops({
        method: "DELETE",
        body: { clear_all: true },
      });
      if (draftSource === "pending") {
        setDraftStops([]);
        setDraftPlan(null);
        setDraftSource(null);
      }
      setStatusMessage("Cleared pending stops.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Pending stop update failed");
    } finally {
      setBusy(null);
    }
  }

  function removeDraftStop(customerId: string) {
    const nextStops = draftStops.filter((stop) => stop.customerId !== customerId).map((stop, index) => ({ ...stop, stopOrder: index + 1 }));
    setDraftStops(nextStops);
    setDraftPlan((current) => (current ? { ...current, orderedStops: nextStops } : current));
  }

  async function saveRoute() {
    if (!assignedUserId || !routeDate || !startTime) {
      setStatusMessage("Assigned rep, route date, and start time are required.");
      return;
    }
    if (draftStops.length === 0 || !draftPlan) {
      setStatusMessage("Generate a finalized route before saving.");
      return;
    }

    setBusy("save");
    setStatusMessage(null);

    try {
      const routeLabel = draftSource === "pending" ? "Pending Stops" : "Draft Route";
      const routeName = derivedRouteTerritoryCode ? `${derivedRouteTerritoryCode} • ${routeDate}` : `${routeLabel} • ${routeDate}`;
      const res = await fetch("/api/workspace/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          territory_code: derivedRouteTerritoryCode || null,
          origin_name: JC_RAD_HQ.name,
          origin_address: JC_RAD_HQ.address,
          origin_latitude: JC_RAD_HQ.latitude,
          origin_longitude: JC_RAD_HQ.longitude,
          assigned_user_id: assignedUserId,
          route_date: routeDate,
          status: "assigned",
          planned_start_time: startTime,
          max_stops: normalizedMaxStops,
          lunch_minutes: draftPlan.lunchMinutes,
          estimated_drive_minutes: draftPlan.estimatedDriveMinutes,
          estimated_visit_minutes: draftPlan.estimatedVisitMinutes,
          estimated_total_minutes: draftPlan.estimatedTotalMinutes,
          estimated_return_time: draftPlan.estimatedReturnTime,
          notes: notes || null,
          queue_ids: draftStops.map((stop) => stop.queueId).filter((value): value is string => Boolean(value)),
          stops: draftStops.map((stop) => ({
            customer_id: stop.customerId,
            planned_arrival_time: stop.plannedArrivalTime,
            planned_departure_time: stop.plannedDepartureTime,
            estimated_drive_minutes_from_previous: stop.estimatedDriveMinutesFromPrevious,
            estimated_visit_minutes: stop.estimatedVisitMinutes,
            stop_status: "planned",
            locked: false,
          })),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      const routeId = String(json.route_id || "");
      const usedQueueIds = new Set(draftStops.map((stop) => stop.queueId).filter((value): value is string => Boolean(value)));
      if (usedQueueIds.size > 0) {
        setPendingStops((current) => current.filter((stop) => !usedQueueIds.has(stop.id)));
      }
      setStatusMessage("Saved route.");
      setDraftStops([]);
      setDraftPlan(null);
      setDraftSource(null);
      setNotes("");
      router.refresh();
      if (routeId) {
        router.push(`/workspace/routes/run?routeId=${routeId}`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-[760px]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Saved Routes</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Build pending-stop routes with Google optimization and traffic-aware timing</h2>
          <p className="mt-2 text-sm text-[#5c7483]">
            Pending stops remain the primary workflow. Route drafts are finalized server-side, use Google services when configured, and fall back safely when they are not.
          </p>
        </div>
        <div className="grid w-full gap-2 rounded-2xl border border-[#dbe8ef] bg-white/90 p-4 text-sm text-[#506877] shadow-sm sm:max-w-[340px]">
          <MetricLine label="Pending Stops" value={String(pendingStops.length)} />
          <MetricLine label="Queue Ready" value={String(coordinateReadyPendingStops.length)} />
          <MetricLine label="Draft Stops" value={String(draftStops.length)} />
          <MetricLine label="Drive Minutes" value={String(draftPlan?.estimatedDriveMinutes || 0)} />
          <MetricLine label="Projected Return" value={draftPlan?.estimatedReturnTime ? formatDateTime(draftPlan.estimatedReturnTime) : "Not set"} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Pending Stops</p>
              <h3 className="mt-1 text-lg font-semibold text-[#173543]">{pendingStops.length} queued for this staff user</h3>
              <p className="mt-1 text-sm text-[#5c7483]">Generate a finalized daily route from coordinate-ready pending stops or use territory generation as a fallback path.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startTransition(generatePendingDraft)}
                disabled={busy !== null || pendingStops.length === 0}
                className="rounded-full bg-[#173543] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35] disabled:opacity-60"
              >
                {busy === "generate_pending" ? "Finalizing..." : "Finalize Pending Route"}
              </button>
              <button
                type="button"
                onClick={() => void clearPendingStops()}
                disabled={busy !== null || pendingStops.length === 0}
                className="rounded-full border border-[#f2d1d1] bg-white px-4 py-2.5 text-sm font-semibold text-[#9a3d3d] disabled:opacity-60"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-[#4f6877]">
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Coordinate-ready {coordinateReadyPendingStops.length}</span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Missing coords {pendingStops.length - coordinateReadyPendingStops.length}</span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Max stops/day {normalizedMaxStops}</span>
          </div>

          <div className="mt-4 space-y-3">
            {pendingStops.map((stop) => (
              <div key={stop.id} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-[#173543]">{stop.customer.name}</p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      {stop.customer.territoryCode || "Territory open"} • {stop.customer.routeDay || "No route day"} • {getMissingCoordLabel(stop.customer)}
                    </p>
                    <p className="mt-1 text-sm text-[#5c7483]">{stop.customer.address1 || stop.customer.city || "No address on file"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/workspace/customers/${stop.customer.id}`} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f]">
                      Open Account
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removePendingStop(stop.id)}
                      disabled={busy !== null}
                      className="rounded-full border border-[#f2d1d1] bg-white px-3 py-1.5 text-sm text-[#9a3d3d] disabled:opacity-60"
                    >
                      Remove Stop
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {pendingStops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                Add customers to pending stops from the Customers workspace to start building a saved route.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Route Setup</p>
            <h3 className="mt-1 text-lg font-semibold text-[#173543]">Assign rep, date, start time, and save a finalized schedule</h3>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <PlannerSelect label="Assigned Rep" value={assignedUserId} onChange={setAssignedUserId} options={routeRepOptions.map((option) => ({ value: option.userId, label: option.label }))} />
            <PlannerInput label="Route Date" type="date" value={routeDate} onChange={setRouteDate} />
            <PlannerInput label="Start Time" type="time" value={startTime} onChange={setStartTime} />
            <PlannerInput label="Max Stops" type="number" value={maxStops} onChange={setMaxStops} min="1" max="40" />
            <PlannerSelect label="Territory Override" value={territoryCode} onChange={setTerritoryCode} options={territoryOptions.map((option) => ({ value: option.value, label: option.label }))} />
          </div>

          <label className="mt-4 grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Optional route notes"
              className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-[#4f6877]">
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Origin {JC_RAD_HQ.name}</span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Start {toTimeLabel(parseStartTimeMinutes(startTime))}</span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Route territory {derivedRouteTerritoryCode || "Mixed / optional"}</span>
          </div>

          <div className="mt-5 rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory-First Backup</p>
                <p className="mt-1 text-sm text-[#5c7483]">Use the same finalized scheduling flow against a territory’s coordinate-ready candidate set when needed.</p>
              </div>
              <button
                type="button"
                onClick={() => startTransition(generateTerritoryDraft)}
                disabled={busy !== null}
                className="rounded-full border border-[#d0dde5] bg-white px-4 py-2.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
              >
                {busy === "generate_territory" ? "Finalizing..." : "Finalize Territory Route"}
              </button>
            </div>
            <p className="mt-3 text-sm text-[#5c7483]">
              {selectedTerritory ? `${candidateCustomers.length} coordinate-ready customers in ${selectedTerritory.label}.` : "Choose a territory override to generate a territory-first route."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveRoute()}
              disabled={busy !== null || draftStops.length === 0 || !draftPlan}
              className="rounded-full bg-[#14b8a6] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {busy === "save" ? "Saving..." : "Save Route"}
            </button>
            {statusMessage ? <p className="text-sm text-[#4f6877]">{statusMessage}</p> : null}
          </div>
        </section>
      </div>

      {draftMapCustomers.length > 0 ? (
        <RouteStopsMap
          customers={draftMapCustomers}
          title="Optimized Draft Map"
          description="Review the finalized stop set on the map before saving. Stop order and timing come from the server-planned route schedule."
          emptyLabel="The finalized draft does not have map-ready stops."
          secondaryActionLabel="Open Account"
          secondaryActionHref={(customerId) => `/workspace/customers/${customerId}`}
        />
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Finalized Schedule</p>
              <h3 className="mt-1 text-lg font-semibold text-[#173543]">{draftStops.length > 0 ? `${draftStops.length} scheduled stops` : "No finalized route yet"}</h3>
              <p className="mt-1 text-sm text-[#5c7483]">
                {draftPlan
                  ? `${draftPlan.provider === "google" ? "Google routing" : "Fallback routing"} • projected finish ${formatDateTime(draftPlan.projectedFinishTime)} • projected return ${formatDateTime(draftPlan.estimatedReturnTime)}`
                  : "Finalize a route to review planned arrival/departure times, lunch, and return-to-base timing."}
              </p>
              {draftPlan?.warning ? <p className="mt-1 text-sm text-[#946200]">{draftPlan.warning}</p> : null}
            </div>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
              Start {toTimeLabel(parseStartTimeMinutes(startTime))}
            </span>
          </div>

          {draftPlan?.lunchBlock ? (
            <div className="mt-4 rounded-2xl border border-[#f1ddad] bg-[#fff9eb] p-3 text-sm text-[#8a5a08]">
              Lunch block {formatDateTime(draftPlan.lunchBlock.startTime)} to {formatDateTime(draftPlan.lunchBlock.endTime)} ({draftPlan.lunchBlock.minutes} min)
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {draftStops.map((stop, index) => (
              <div key={`${stop.customerId}-${stop.stopOrder}`} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Stop {stop.stopOrder}</p>
                    <p className="mt-1 font-semibold text-[#173543]">{stop.customerName}</p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      Arrive {formatDateTime(stop.plannedArrivalTime)} • Depart {formatDateTime(stop.plannedDepartureTime)}
                    </p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      Leg {stop.estimatedDriveMinutesFromPrevious} min • Visit {stop.estimatedVisitMinutes} min • Distance {(stop.legDistanceMeters / 1609.34).toFixed(1)} mi
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] disabled:opacity-60">
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStop(index, 1)}
                      disabled={index === draftStops.length - 1}
                      className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] disabled:opacity-60"
                    >
                      Down
                    </button>
                    <button type="button" onClick={() => removeDraftStop(stop.customerId)} className="rounded-full border border-[#f2d1d1] bg-white px-3 py-1.5 text-sm text-[#9a3d3d]">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {draftStops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                Finalize a route to review the optimized stop order and schedule.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Saved Routes</p>
            <h3 className="mt-1 text-lg font-semibold text-[#173543]">Recent route plans</h3>
          </div>

          <div className="mt-4 space-y-3">
            {savedRoutes.map((route) => (
              <div key={route.id} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#173543]">{route.name}</p>
                    <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#496574]">{route.status}</span>
                  </div>
                  <p className="text-sm text-[#5c7483]">
                    {route.routeDate || "No date"} • {route.assignedUserLabel || "Unassigned rep"} • {route.stopCount} stops
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/workspace/routes/run?routeId=${route.id}`} className="rounded-full bg-[#173543] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
                      Open Runner
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            {savedRoutes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                No saved routes yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function PlannerSelect({
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
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlannerInput({
  label,
  value,
  onChange,
  type,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "date" | "time" | "number";
  min?: string;
  max?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
      />
    </label>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-base font-semibold text-[#173543]">{value}</span>
    </div>
  );
}
