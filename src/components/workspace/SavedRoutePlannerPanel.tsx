"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { SegmentBuilderSettings } from "@/lib/segmentBuilderSettings";
import type { PendingRouteStop } from "@/lib/routeStopQueue";
import type { RouteRepOption, SavedRouteSummary, TerritoryOption } from "@/lib/routeWorkspace";
import PlannedRoutePreviewMap from "@/components/workspace/PlannedRoutePreviewMap";
import { formatBusinessDateTime, formatBusinessDateTimeLong } from "@/lib/businessTime";
import { JC_RAD_HQ } from "@/lib/routePlanning";
import { getRouteEligibilityReason, isRouteEligibleCustomer } from "@/lib/routeEligibility";

type SavedRoutePlannerPanelProps = {
  customers: CustomerSummary[];
  currentUserId: string;
  staffRole: "admin" | "sales";
  pendingStops: PendingRouteStop[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  savedRoutes: SavedRouteSummary[];
  plannerDefaults: SegmentBuilderSettings;
};

type DraftStop = {
  customerId: string;
  customerName: string;
  territoryCode: string | null;
  routeDay: string | null;
  queueId: string | null;
  locked: boolean;
  stopOrder: number;
  plannedArrivalTime: string;
  plannedDepartureTime: string;
  estimatedDriveMinutesFromPrevious: number;
  estimatedVisitMinutes: number;
  legDistanceMeters: number;
  scheduleFlag: "on_time" | "tight" | "overtime";
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
  projectedReturnTime: string | null;
  returnDriveMinutes: number;
  fitsWithinShift: boolean;
  shiftStartTime: string;
  requiredReturnBy: string;
  overtimeMinutes: number;
  firstOvertimeStopIndex: number | null;
  firstOvertimeStopId: string | null;
  suggestedTrimStopIds: string[];
  polyline: string | null;
  warning: string | null;
};

type RouteReadinessItem = {
  queueId: string;
  customer: CustomerSummary;
  status: "included" | "route_ready" | "excluded";
  reason:
    | "missing_coordinates"
    | "missing_address"
    | "invalid_coordinates"
    | "geocode_needs_attention"
    | "not_eligible_for_current_planning_set"
    | "not_in_finalized_preview"
    | null;
};

function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return Promise.resolve({});
  return res.json().catch(() => ({}));
}

function formatDateTime(value: string | null) {
  return formatBusinessDateTimeLong(value, "Not set");
}

function formatCompactDateTime(value: string | null) {
  return formatBusinessDateTime(value, "Not set");
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

function scheduleFlagBadgeClass(flag: DraftStop["scheduleFlag"]) {
  if (flag === "overtime") return "border-[#f3c6c6] bg-[#fff3f3] text-[#a33a3a]";
  if (flag === "tight") return "border-[#f2ddb0] bg-[#fff9ea] text-[#9a640a]";
  return "border-[#cfe8e4] bg-[#effaf7] text-[#0f766e]";
}

function lockBadgeClass(locked: boolean) {
  return locked ? "border-[#d7d2f4] bg-[#f7f4ff] text-[#5f4aa5]" : "border-[#d7e6ed] bg-white text-[#607b89]";
}

function routeStatusTone(args: { fitsWithinShift: boolean; previewNeedsRefresh: boolean; overtimeApproved: boolean }) {
  if (args.previewNeedsRefresh) {
    return {
      label: "Needs Re-Optimize",
      className: "border-[#f2ddb0] bg-[#fff9ea] text-[#9a640a]",
      detail: "Preview timing is out of date after manual edits.",
    };
  }
  if (!args.fitsWithinShift) {
    return args.overtimeApproved
      ? {
          label: "Approved Overtime",
          className: "border-[#f3c6c6] bg-[#fff3f3] text-[#a33a3a]",
          detail: "Route exceeds shift cutoff, but overtime has been approved locally.",
        }
      : {
          label: "Blocked By Overtime",
          className: "border-[#f3c6c6] bg-[#fff3f3] text-[#a33a3a]",
          detail: "Approve overtime or reduce the route before saving.",
        };
  }
  return {
    label: "Ready To Save",
    className: "border-[#cfe8e4] bg-[#effaf7] text-[#0f766e]",
    detail: "Preview is current and the route fits within shift.",
  };
}

function readinessReasonLabel(reason: RouteReadinessItem["reason"]) {
  if (reason === "missing_address") return "Needs address";
  if (reason === "missing_coordinates") return "Needs coordinates";
  if (reason === "invalid_coordinates") return "Needs coordinates review";
  if (reason === "geocode_needs_attention") return "Needs geocode review";
  if (reason === "not_eligible_for_current_planning_set") return "Queued beyond current stop limit";
  if (reason === "not_in_finalized_preview") return "Queued, not in current preview";
  return "Available";
}

function deriveRouteTerritoryCode(stops: DraftStop[], explicitTerritoryCode: string) {
  if (explicitTerritoryCode) return explicitTerritoryCode;
  const territoryCodes = Array.from(new Set(stops.map((stop) => stop.territoryCode).filter((value): value is string => Boolean(value))));
  return territoryCodes.length === 1 ? territoryCodes[0] : "";
}

export default function SavedRoutePlannerPanel({
  customers,
  currentUserId,
  staffRole,
  pendingStops: initialPendingStops,
  routeRepOptions,
  territoryOptions,
  savedRoutes,
  plannerDefaults,
}: SavedRoutePlannerPanelProps) {
  const router = useRouter();
  const [pendingStops, setPendingStops] = useState(initialPendingStops);
  const [territoryCode, setTerritoryCode] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(plannerDefaults.route_planner_default_start_time || "09:00");
  const [maxStops, setMaxStops] = useState(String(plannerDefaults.route_planner_default_max_stops || 12));
  const [notes, setNotes] = useState("");
  const [draftStops, setDraftStops] = useState<DraftStop[]>([]);
  const [draftSource, setDraftSource] = useState<"pending" | "territory" | null>(null);
  const [draftPlan, setDraftPlan] = useState<PlannedRoute | null>(null);
  const [selectedPreviewStopId, setSelectedPreviewStopId] = useState<string | null>(null);
  const [overtimeApproved, setOvertimeApproved] = useState(false);
  const [previewNeedsRefresh, setPreviewNeedsRefresh] = useState(false);
  const [savedRoutesState, setSavedRoutesState] = useState(savedRoutes);
  const [routeActionById, setRouteActionById] = useState<Record<string, "assign" | null>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate_pending" | "generate_territory" | "save" | "queue" | "reoptimize" | "delete_route" | null>(null);

  const selectedTerritory = territoryOptions.find((option) => option.value === territoryCode) || null;
  const routeReadyPendingStops = pendingStops.filter((stop) => isRouteEligibleCustomer(stop.customer));
  const candidateCustomers = customers.filter((customer) => customer.territoryCode === territoryCode && isRouteEligibleCustomer(customer));
  const normalizedMaxStops = Math.max(1, Math.min(40, Number(maxStops) || 12));
  const derivedRouteTerritoryCode = deriveRouteTerritoryCode(draftStops, territoryCode);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const draftMapCustomers = draftStops
    .map((stop) => customerById.get(stop.customerId))
    .filter((customer): customer is CustomerSummary => Boolean(customer));
  const suggestedTrimStops = (draftPlan?.suggestedTrimStopIds || [])
    .map((customerId) => draftPlan?.orderedStops.find((stop) => stop.customerId === customerId))
    .filter((stop): stop is DraftStop => Boolean(stop));
  const previewIncludedIds = new Set((draftPlan?.orderedStops || []).map((stop) => stop.customerId));
  const pendingRouteReadyStops = pendingStops.filter((stop) => isRouteEligibleCustomer(stop.customer));
  const pendingEligibleIds = new Set(pendingRouteReadyStops.slice(0, normalizedMaxStops).map((stop) => stop.customerId));
  const readinessItems = pendingStops.map((stop) => {
    const reason = getRouteEligibilityReason(stop.customer);
    if (reason) {
      return {
        queueId: stop.id,
        customer: stop.customer,
        status: "excluded",
        reason,
      } satisfies RouteReadinessItem;
    }
    if (!pendingEligibleIds.has(stop.customerId)) {
      return {
        queueId: stop.id,
        customer: stop.customer,
        status: "excluded",
        reason: "not_eligible_for_current_planning_set",
      } satisfies RouteReadinessItem;
    }
    if (draftPlan && !previewIncludedIds.has(stop.customerId)) {
      return {
        queueId: stop.id,
        customer: stop.customer,
        status: "excluded",
        reason: "not_in_finalized_preview",
      } satisfies RouteReadinessItem;
    }
    return {
      queueId: stop.id,
      customer: stop.customer,
      status: draftPlan && previewIncludedIds.has(stop.customerId) ? "included" : "route_ready",
      reason: null,
    } satisfies RouteReadinessItem;
  });
  const readinessCounts = {
    queued: readinessItems.length,
    routeReady: readinessItems.filter((item) => item.status === "route_ready" || item.status === "included").length,
    excluded: readinessItems.filter((item) => item.status === "excluded").length,
    included: readinessItems.filter((item) => item.status === "included").length,
  };
  const readinessExcludedItems = readinessItems.filter((item) => item.status === "excluded");
  const selectedPreviewStop = draftStops.find((stop) => stop.customerId === selectedPreviewStopId) || draftStops[0] || null;
  const saveBlockedByOvertime = Boolean(draftPlan && !draftPlan.fitsWithinShift && !overtimeApproved);
  const saveBlocked = saveBlockedByOvertime || previewNeedsRefresh;
  const topLevelRouteStatus = routeStatusTone({
    fitsWithinShift: draftPlan?.fitsWithinShift ?? false,
    previewNeedsRefresh,
    overtimeApproved,
  });
  const lunchInsertIndex =
    draftPlan?.lunchBlock ? draftStops.findIndex((stop) => new Date(stop.plannedArrivalTime).getTime() >= new Date(draftPlan.lunchBlock?.endTime || "").getTime()) : -1;

  function applyPlannedRoute(nextPlan: PlannedRoute, source: "pending" | "territory") {
    setDraftPlan(nextPlan);
    setDraftStops(nextPlan.orderedStops);
    setDraftSource(source);
    setSelectedPreviewStopId(nextPlan.orderedStops[0]?.customerId || null);
    setOvertimeApproved(false);
    setPreviewNeedsRefresh(false);
  }

  function toPlannerStops(stops: DraftStop[]) {
    return stops
      .map((stop) => {
        const customer = customerById.get(stop.customerId);
        if (!customer || customer.latitude === null || customer.longitude === null) return null;
        return {
          customer_id: stop.customerId,
          customer_name: stop.customerName,
          territory_code: stop.territoryCode,
          route_day: stop.routeDay,
          latitude: customer.latitude,
          longitude: customer.longitude,
          queue_id: stop.queueId,
          locked: stop.locked,
        };
      })
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
  }

  async function reoptimizeDraft(nextDraftStops: DraftStop[], source: "pending" | "territory", successMessage: string) {
    setBusy("reoptimize");
    setStatusMessage(null);

    try {
      const plannerStops = toPlannerStops(nextDraftStops);
      const res = await fetch("/api/workspace/routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_date: routeDate,
          planned_start_time: startTime,
          max_stops: Math.max(1, Math.min(normalizedMaxStops, plannerStops.length || normalizedMaxStops)),
          stops: plannerStops,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Route planning failed (${res.status})`));

      const plan = (json.plan || null) as PlannedRoute | null;
      if (!plan) throw new Error("Route planning did not return a plan");

      applyPlannedRoute(plan, source);
      setStatusMessage(successMessage);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Route planning failed");
    } finally {
      setBusy(null);
    }
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
          : "No route-available stops were available for route planning."
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
        stops: routeReadyPendingStops.map((stop) => ({
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
    setOvertimeApproved(false);
    setPreviewNeedsRefresh(true);
    setStatusMessage("Stop order changed. Re-optimize route to refresh schedule and overtime calculations before saving.");
  }

  function toggleStopLock(customerId: string) {
    const nextStops = draftStops.map((stop) => (stop.customerId === customerId ? { ...stop, locked: !stop.locked } : stop));
    const toggledStop = nextStops.find((stop) => stop.customerId === customerId) || null;
    setDraftStops(nextStops);
    setDraftPlan((current) => (current ? { ...current, orderedStops: nextStops } : current));
    setOvertimeApproved(false);
    setPreviewNeedsRefresh(true);
    setStatusMessage(
      toggledStop?.locked
        ? `${toggledStop.customerName} locked in place. Re-optimize to preserve this anchor while optimizing the remaining stops.`
        : `${toggledStop?.customerName || "Stop"} unlocked. Re-optimize to let the planner move it again.`
    );
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
    const nextSelectedStopId = selectedPreviewStopId === customerId ? nextStops[0]?.customerId || null : selectedPreviewStopId;
    setSelectedPreviewStopId(nextSelectedStopId);
    if (nextStops.length === 0) {
      setDraftStops([]);
      setDraftPlan(null);
      setOvertimeApproved(false);
      setPreviewNeedsRefresh(false);
      setStatusMessage("Removed the last stop from the draft route.");
      return;
    }
    void reoptimizeDraft(nextStops, draftSource || "pending", "Removed stop and refreshed route preview.");
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
    if (previewNeedsRefresh) {
      setStatusMessage("Re-optimize the route before saving so the preview timing and overtime state are current.");
      return;
    }
    if (saveBlockedByOvertime) {
      setStatusMessage("Approve overtime or bring the route back within shift before saving.");
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
            locked: stop.locked,
          })),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      const routeId = String(json.route_id || "");
      const queueCleanupWarning = String(json.queue_cleanup_warning || "").trim();
      const usedQueueIds = new Set(draftStops.map((stop) => stop.queueId).filter((value): value is string => Boolean(value)));
      if (usedQueueIds.size > 0) {
        setPendingStops((current) => current.filter((stop) => !usedQueueIds.has(stop.id)));
      }
      if (routeId) {
        const assignedUserLabel = routeRepOptions.find((option) => option.userId === assignedUserId)?.label || assignedUserId;
        const nextSummary: SavedRouteSummary = {
          id: routeId,
          name: routeName,
          territoryCode: derivedRouteTerritoryCode || null,
          originName: JC_RAD_HQ.name,
          originAddress: JC_RAD_HQ.address,
          assignedUserId,
          assignedUserLabel,
          routeDate,
          status: "assigned",
          plannedStartTime: startTime,
          maxStops: normalizedMaxStops,
          lunchMinutes: draftPlan.lunchMinutes,
          estimatedTotalMinutes: draftPlan.estimatedTotalMinutes,
          estimatedReturnTime: draftPlan.estimatedReturnTime,
          stopCount: draftStops.length,
          createdByUserId: currentUserId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSavedRoutesState((current) => [nextSummary, ...current.filter((route) => route.id !== routeId)].slice(0, 40));
      }
      setStatusMessage(queueCleanupWarning ? `Saved route. A few queued stops still need prep in Customers: ${queueCleanupWarning}` : "Saved route.");
      setDraftStops([]);
      setDraftPlan(null);
      setDraftSource(null);
      setSelectedPreviewStopId(null);
      setOvertimeApproved(false);
      setPreviewNeedsRefresh(false);
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

  async function deleteSavedRoute(routeId: string) {
    if (!routeId) return;
    if (!window.confirm("Delete this saved route and all of its route stops?")) return;

    setBusy("delete_route");
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workspace/routes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_id: routeId }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Delete failed (${res.status})`));

      setSavedRoutesState((current) => current.filter((route) => route.id !== routeId));
      setStatusMessage("Deleted saved route.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function updateSavedRouteAssignment(routeId: string, assignedUserId: string) {
    if (!routeId || !assignedUserId) return;

    setRouteActionById((current) => ({ ...current, [routeId]: "assign" }));
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workspace/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: routeId,
          assigned_user_id: assignedUserId,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Assignment failed (${res.status})`));

      const assignedUserLabel = routeRepOptions.find((option) => option.userId === assignedUserId)?.label || assignedUserId;
      setSavedRoutesState((current) =>
        current.map((route) =>
          route.id === routeId
            ? {
                ...route,
                assignedUserId,
                assignedUserLabel,
              }
            : route
        )
      );
      setStatusMessage("Route assignment updated.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      setRouteActionById((current) => ({ ...current, [routeId]: null }));
    }
  }

  return (
    <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-[820px]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Route Command Center</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Build, review, and save field routes from one cleaner planning surface</h2>
          <p className="mt-2 text-sm text-[#5c7483]">
            The itinerary drives stop order and removals. Prep geocoding in Customers first, then use this planner to work from the route-available queue and finalize the route.
          </p>
        </div>
        <div className="grid w-full gap-2 rounded-2xl border border-[#dbe8ef] bg-white/90 p-4 text-sm text-[#506877] shadow-sm sm:max-w-[340px]">
          <MetricLine label="Pending Stops" value={String(pendingStops.length)} />
          <MetricLine label="Route-Available" value={String(routeReadyPendingStops.length)} />
          <MetricLine label="Draft Stops" value={String(draftStops.length)} />
          <MetricLine label="Drive Minutes" value={String(draftPlan?.estimatedDriveMinutes || 0)} />
          <MetricLine label="Projected Return" value={draftPlan?.projectedReturnTime ? formatDateTime(draftPlan.projectedReturnTime) : "Not set"} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Pending Stop Queue</p>
              <h3 className="mt-1 text-lg font-semibold text-[#173543]">{pendingStops.length} queued stops for this planner</h3>
              <p className="mt-1 text-sm text-[#5c7483]">Build from the pending queue first. If any queued stops still need geocode prep, handle that in Customers and come back here to finalize the route.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startTransition(generatePendingDraft)}
                disabled={busy !== null || routeReadyPendingStops.length === 0}
                className="rounded-full bg-[#173543] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35] disabled:opacity-60"
              >
                {busy === "generate_pending" ? "Building Preview..." : "Build Pending Route Preview"}
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
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Route-available now {routeReadyPendingStops.length}</span>
            {pendingStops.length > routeReadyPendingStops.length ? (
              <span className="rounded-full border border-[#f2ddb0] bg-[#fff9ea] px-3 py-1.5 text-[#9a640a]">
                Prep in Customers {pendingStops.length - routeReadyPendingStops.length}
              </span>
            ) : null}
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5">Max stops/day {normalizedMaxStops}</span>
          </div>

          <div className="mt-4 space-y-2.5">
            {pendingStops.map((stop) => {
              const isEligible = isRouteEligibleCustomer(stop.customer);
              return (
                <div key={stop.id} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] px-3 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#173543]">{stop.customer.name}</p>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            isEligible ? "border-[#cfe8e4] bg-[#effaf7] text-[#0f766e]" : "border-[#f2ddb0] bg-[#fff9ea] text-[#9a640a]",
                          ].join(" ")}
                          title={!isEligible ? readinessReasonLabel(getRouteEligibilityReason(stop.customer)) : undefined}
                        >
                          {isEligible ? "Route-available" : "Prep in Customers"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#5c7483]">
                        {stop.customer.address1 || stop.customer.city || "No address on file"} • {stop.customer.territoryCode || "Territory open"}
                      </p>
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
              );
            })}

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
            <h3 className="mt-1 text-lg font-semibold text-[#173543]">Set the route frame, then build from the route-available stop set</h3>
          </div>

          <div className="mt-4 rounded-[22px] border border-[#dbe8ef] bg-[linear-gradient(180deg,#f8fcfd_0%,#f3f8fa_100%)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Leave Time</p>
                <p className="mt-1 text-sm text-[#5c7483]">Departure time from HQ drives the stop timeline, lunch placement, and return calculations.</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbe8ef] bg-white px-4 py-3">
                <span className="text-sm font-semibold text-[#173543]">Leave JC RAD HQ</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm font-semibold text-[#173543] outline-none transition focus:border-[#14b8a6]"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <PlannerSelect
              label="Assigned Rep"
              value={assignedUserId}
              onChange={setAssignedUserId}
              disabled={staffRole !== "admin"}
              options={routeRepOptions.map((option) => ({ value: option.userId, label: option.label }))}
            />
            <PlannerInput label="Route Date" type="date" value={routeDate} onChange={setRouteDate} />
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
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory Backup Build</p>
                <p className="mt-1 text-sm text-[#5c7483]">Use the same route builder against a territory’s route-available customer set when the pending queue is not the right entry point.</p>
              </div>
              <button
                type="button"
                onClick={() => startTransition(generateTerritoryDraft)}
                disabled={busy !== null}
                className="rounded-full border border-[#d0dde5] bg-white px-4 py-2.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
              >
                {busy === "generate_territory" ? "Building Preview..." : "Build Territory Route Preview"}
              </button>
            </div>
            <p className="mt-3 text-sm text-[#5c7483]">
              {selectedTerritory ? `${candidateCustomers.length} route-available customers in ${selectedTerritory.label}.` : "Choose a territory override to build a territory-first route."}
            </p>
          </div>

          {statusMessage ? <p className="mt-4 text-sm text-[#4f6877]">{statusMessage}</p> : null}
        </section>
      </div>

      <section className="mt-5 rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Planning Set</p>
            <h3 className="mt-1 text-lg font-semibold text-[#173543]">Planner works from the route-available subset</h3>
            <p className="mt-1 text-sm text-[#5c7483]">
              Queued stops stay in the CRM queue. This panel keeps the route-available set visible here and pushes geocode prep back to Customers where it belongs.
            </p>
          </div>
          <div className="grid gap-2 rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-4 text-sm text-[#506877] sm:min-w-[240px]">
            <MetricLine label="Queued Stops" value={String(readinessCounts.queued)} />
            <MetricLine label="Route-Available" value={String(readinessCounts.routeReady)} />
            <MetricLine label="Needs Prep" value={String(readinessCounts.excluded)} />
            {draftPlan ? <MetricLine label="In Preview" value={String(readinessCounts.included)} /> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-[#4f6877]">Max stops in current planning set: {normalizedMaxStops}</span>
          <span className="rounded-full border border-[#cfe8e4] bg-[#effaf7] px-3 py-1.5 text-[#0f766e]">Available now: {readinessItems.filter((item) => item.status === "route_ready").length}</span>
          {draftPlan ? (
            <span className="rounded-full border border-[#d6ebea] bg-white px-3 py-1.5 text-[#355966]">Included in preview: {readinessCounts.included}</span>
          ) : null}
          {readinessExcludedItems.length > 0 ? (
            <span className="rounded-full border border-[#f2ddb0] bg-[#fff9ea] px-3 py-1.5 text-[#9a640a]">Prep remaining queued stops in Customers as needed</span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[22px] border border-[#dbe8ef] bg-[#fbfdfe] p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f8897]">Current Planning Set</h4>
              <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#4f6877]">
                {readinessItems.filter((item) => item.status !== "excluded").length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {readinessItems
                .filter((item) => item.status !== "excluded")
                .map((item) => (
                  <div key={item.queueId} className="rounded-xl border border-[#e1ebf1] bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#173543]">{item.customer.name}</p>
                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          item.status === "included" ? "border-[#cfe8e4] bg-[#effaf7] text-[#0f766e]" : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]",
                        ].join(" ")}
                      >
                        {item.status === "included" ? "Included in preview" : "Route-available"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      {item.customer.territoryCode || "Territory open"} • {item.customer.address1 || item.customer.city || "Address on file"}
                    </p>
                  </div>
                ))}
              {readinessItems.filter((item) => item.status !== "excluded").length === 0 ? (
                <p className="text-sm text-[#5d7685]">No queued stops are route-available yet.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#ece2c9] bg-[#fffdf8] p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#7d6b44]">Needs Prep In Customers</h4>
              <span className="rounded-full border border-[#f2ddb0] bg-[#fff9ea] px-2.5 py-1 text-xs font-semibold text-[#9a640a]">
                {readinessExcludedItems.length}
              </span>
            </div>
            <p className="mt-2 text-sm text-[#7d6b44]">These queued stops stay intact here, but they should be geocoded or corrected in Customers before route planning.</p>
            <div className="mt-3 space-y-2">
              {readinessExcludedItems.map((item) => (
                <div key={item.queueId} className="rounded-xl border border-[#f0dfba] bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#173543]">{item.customer.name}</p>
                    <span className="rounded-full border border-[#f2ddb0] bg-[#fff9ea] px-2.5 py-1 text-xs font-semibold text-[#9a640a]">
                      {readinessReasonLabel(item.reason)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#5c7483]">
                    {item.customer.address1 || item.customer.city || "No usable address"} • {item.customer.territoryCode || "Territory open"}
                  </p>
                </div>
              ))}
              {readinessExcludedItems.length === 0 ? <p className="text-sm text-[#5d7685]">All queued stops are route-available for the current planning set.</p> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.95fr)]">
        <section className="space-y-5">
          {draftMapCustomers.length > 0 && draftPlan ? (
            <PlannedRoutePreviewMap
              customers={draftMapCustomers}
              title="Route Preview"
              description="Use the map as a live preview and the itinerary as the working control surface. The stop strip mirrors the finalized order without duplicating the full stop card UI."
              emptyLabel="The finalized draft does not have map-ready stops."
              secondaryActionLabel="Open Account"
              secondaryActionHref={(customerId) => `/workspace/customers/${customerId}`}
              selectedCustomerId={selectedPreviewStopId}
              onSelectedCustomerIdChange={setSelectedPreviewStopId}
              plannedRoute={{
                origin: {
                  name: JC_RAD_HQ.name,
                  latitude: JC_RAD_HQ.latitude,
                  longitude: JC_RAD_HQ.longitude,
                },
                stopOrder: draftPlan.orderedStops.map((stop) => stop.customerId),
                provider: draftPlan.provider,
                polyline: draftPlan.polyline,
              }}
            />
          ) : (
            <section className="rounded-[24px] border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-14 text-center text-sm text-[#5c7483]">
              Build a pending-stop or territory route preview to open the map workspace.
            </section>
          )}

          <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
            <div className="rounded-[22px] border border-[#dbe8ef] bg-[linear-gradient(180deg,#f8fcfd_0%,#f3f8fa_100%)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Route Decision</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#173543]">
                    {draftStops.length > 0 ? `${draftStops.length} stops ready for final review` : "No finalized route yet"}
                  </h3>
                  <p className="mt-1 text-sm text-[#5c7483]">
                    {draftPlan
                      ? `${draftPlan.provider === "google" ? "Google routing" : "Fallback routing"} with a projected return of ${formatDateTime(draftPlan.projectedReturnTime)}.`
                      : "Finalize a route to review shift fit, stop timing, and return-to-origin feasibility."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={["rounded-full border px-3 py-1.5 text-sm font-semibold", draftPlan ? topLevelRouteStatus.className : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]"].join(" ")}>
                    {draftPlan ? topLevelRouteStatus.label : "Awaiting Preview"}
                  </span>
                  <span className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-sm text-[#4f6877]">
                    Start {draftPlan ? formatCompactDateTime(draftPlan.shiftStartTime) : toTimeLabel(parseStartTimeMinutes(startTime))}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Projected Finish" value={draftPlan ? formatCompactDateTime(draftPlan.projectedFinishTime) : "Not set"} />
                <SummaryCard label="Projected Return" value={draftPlan ? formatCompactDateTime(draftPlan.projectedReturnTime) : "Not set"} />
                <SummaryCard label="Required Return By" value={draftPlan ? formatCompactDateTime(draftPlan.requiredReturnBy) : "Not set"} />
                <SummaryCard label="Route Status" value={draftPlan ? topLevelRouteStatus.label : "Not set"} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-[#4f6877]">
                  Lunch {draftPlan?.lunchBlock ? `${draftPlan.lunchBlock.minutes} min` : "Not scheduled"}
                </span>
                <span className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-[#4f6877]">
                  Overtime {draftPlan && !draftPlan.fitsWithinShift ? `${draftPlan.overtimeMinutes} min` : "0 min"}
                </span>
                <span className="text-sm text-[#5c7483]">{draftPlan ? topLevelRouteStatus.detail : "Build a route to unlock final review actions."}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Decision Actions</p>
                <h4 className="mt-1 text-lg font-semibold text-[#173543]">Choose the path that gets this route into a savable state</h4>
                <p className="mt-1 text-sm text-[#5c7483]">Trim stops, re-optimize after manual edits, or explicitly approve overtime for this local finalization session.</p>
                {draftPlan?.warning ? <p className="mt-1 text-sm text-[#946200]">{draftPlan.warning}</p> : null}
                {previewNeedsRefresh ? <p className="mt-1 text-sm text-[#946200]">Preview is stale after manual order changes. Re-optimize before saving.</p> : null}
                {draftStops.some((stop) => stop.locked) ? (
                  <p className="mt-1 text-sm text-[#5f4aa5]">
                    Locked stops stay anchored during re-optimization. Unlocked stops are reordered around them while locked stops keep their relative order.
                  </p>
                ) : null}
              </div>
              <div className="grid min-w-[260px] gap-2 rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3 text-sm">
                <MetricLine label="Save Status" value={!draftPlan ? "Locked" : saveBlocked ? "Blocked" : "Ready"} />
                <MetricLine label="Selected Stop" value={selectedPreviewStop ? `${selectedPreviewStop.stopOrder}` : "None"} />
                <MetricLine label="Route Provider" value={draftPlan ? (draftPlan.provider === "google" ? "Google" : "Fallback") : "Not set"} />
                <MetricLine label="Locked Stops" value={String(draftStops.filter((stop) => stop.locked).length)} />
              </div>
            </div>

            {draftPlan && !draftPlan.fitsWithinShift ? (
              <div className="mt-4 rounded-2xl border border-[#f3c6c6] bg-[#fff3f3] p-4 text-sm text-[#8d3535]">
                <p className="font-semibold">Projected return exceeds the required field-day cutoff.</p>
                <p className="mt-1">
                  First overtime stop:{" "}
                  {draftPlan.firstOvertimeStopIndex !== null
                    ? `Stop ${draftPlan.firstOvertimeStopIndex + 1}${draftPlan.firstOvertimeStopId ? ` (${draftPlan.orderedStops.find((stop) => stop.customerId === draftPlan.firstOvertimeStopId)?.customerName || draftPlan.firstOvertimeStopId})` : ""}`
                    : "Not identified"}
                  . Overtime: {draftPlan.overtimeMinutes} min.
                </p>
                {suggestedTrimStops.length > 0 ? (
                  <p className="mt-1">
                    Suggested trim from end: {suggestedTrimStops.map((stop) => `#${stop.stopOrder} ${stop.customerName}`).join(" • ")}
                  </p>
                ) : null}
                {overtimeApproved ? <p className="mt-2 font-medium text-[#8d3535]">Overtime approved for this local finalization session.</p> : null}
              </div>
            ) : null}

            {draftPlan?.lunchBlock ? (
              <div className="mt-4 rounded-2xl border border-[#f1ddad] bg-[#fff9eb] p-3 text-sm text-[#8a5a08]">
                Lunch block {formatDateTime(draftPlan.lunchBlock.startTime)} to {formatDateTime(draftPlan.lunchBlock.endTime)} ({draftPlan.lunchBlock.minutes} min)
              </div>
            ) : null}

            <div className="mt-5 rounded-[22px] border border-[#dbe8ef] bg-[#fbfdfe] p-4">
              <div className="flex flex-col gap-4">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setOvertimeApproved((current) => !current)}
                    disabled={busy !== null || !draftPlan || draftPlan.fitsWithinShift || previewNeedsRefresh}
                    className="rounded-2xl border border-[#d0dde5] bg-white px-4 py-3 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                  >
                    {overtimeApproved ? "Overtime Approved" : "Approve Overtime"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraftStop(draftStops[draftStops.length - 1]?.customerId || "")}
                    disabled={busy !== null || draftStops.length === 0}
                    className="rounded-2xl border border-[#d0dde5] bg-white px-4 py-3 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                  >
                    Remove Last Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => (selectedPreviewStop ? removeDraftStop(selectedPreviewStop.customerId) : undefined)}
                    disabled={busy !== null || !selectedPreviewStop}
                    className="rounded-2xl border border-[#d0dde5] bg-white px-4 py-3 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                  >
                    {selectedPreviewStop ? `Remove Selected Stop (#${selectedPreviewStop.stopOrder})` : "Remove Selected Stop"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void reoptimizeDraft(draftStops, draftSource || "pending", "Re-optimized current draft route.")}
                    disabled={busy !== null || draftStops.length === 0}
                    className="rounded-2xl border border-[#d0dde5] bg-white px-4 py-3 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                  >
                    {busy === "reoptimize" ? "Re-optimizing..." : "Re-Optimize Route"}
                  </button>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-[#d9e7ee] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Save Decision</p>
                    <p className="mt-1 text-lg font-semibold text-[#173543]">{!draftPlan ? "Route not ready" : saveBlocked ? "Save is blocked" : "Route can be saved"}</p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      {previewNeedsRefresh
                        ? "Manual order edits require re-optimization before save."
                        : saveBlockedByOvertime
                          ? "Overtime must be approved or the route must be reduced to fit within shift."
                          : "Preview is current and meets the current save rules."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveRoute()}
                    disabled={busy !== null || draftStops.length === 0 || !draftPlan || saveBlocked}
                    className={[
                      "rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-60",
                      saveBlocked ? "bg-[#9fb6c0]" : "bg-[#14b8a6] hover:opacity-95",
                    ].join(" ")}
                  >
                    {busy === "save" ? "Saving..." : "Save Route"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-[#dbe8ef] bg-[#fbfdfe] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Recent Saved Routes</p>
                <h4 className="mt-1 text-lg font-semibold text-[#173543]">Saved route runner handoff</h4>
                <p className="mt-1 text-sm text-[#5c7483]">This same itinerary structure becomes the next runner foundation. Saved routes stay available here for quick handoff.</p>
              </div>

              <div className="mt-4 space-y-3">
                {savedRoutesState.map((route) => (
                  <div key={route.id} className="rounded-2xl border border-[#dbe8ef] bg-white p-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#173543]">{route.name}</p>
                        <span className="rounded-full border border-[#d7e6ed] bg-[#fbfdfe] px-2.5 py-1 text-xs font-semibold text-[#496574]">{route.status}</span>
                      </div>
                      <p className="text-sm text-[#5c7483]">
                        {route.routeDate || "No date"} • {route.assignedUserLabel || "Unassigned rep"} • {route.stopCount} stops
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-[#5c7483]">
                          <span className="sr-only">Assign route</span>
                          <select
                            value={route.assignedUserId || ""}
                            onChange={(event) => void updateSavedRouteAssignment(route.id, event.target.value)}
                            disabled={staffRole !== "admin" || busy !== null || routeActionById[route.id] === "assign"}
                            className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#24404d] outline-none transition focus:border-[#14b8a6] disabled:opacity-60"
                          >
                            <option value="" disabled>
                              Assign rep
                            </option>
                            {routeRepOptions.map((option) => (
                              <option key={option.userId} value={option.userId}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/workspace/routes/run?routeId=${route.id}`} className="rounded-full bg-[#173543] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
                          Open Runner
                        </Link>
                        {staffRole === "admin" ? (
                          <button
                            type="button"
                            onClick={() => void deleteSavedRoute(route.id)}
                            disabled={busy !== null}
                            className="rounded-full border border-[#f2d1d1] bg-white px-3 py-1.5 text-sm font-semibold text-[#9a3d3d] transition hover:bg-[#fff7f7] disabled:opacity-60"
                          >
                            {busy === "delete_route" ? "Deleting..." : "Erase Route"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {savedRoutesState.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-white px-4 py-10 text-center text-sm text-[#5c7483]">
                    No saved routes yet.
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </section>

        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Route Itinerary</p>
              <h3 className="mt-1 text-lg font-semibold text-[#173543]">{draftStops.length > 0 ? "Primary route control surface" : "No stops yet"}</h3>
              <p className="mt-1 text-sm text-[#5c7483]">Reorder and remove here. Lunch and the final HQ return are separate itinerary blocks so this structure can carry forward into the route runner.</p>
            </div>
            {draftPlan ? (
              <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
                {draftPlan.provider === "google" ? "Google" : "Fallback"} • {draftPlan.orderedStops.length} stops
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-2.5">
            {draftStops.map((stop, index) => {
              const isFirstOvertimeStop =
                draftPlan?.firstOvertimeStopIndex === index || (draftPlan?.firstOvertimeStopId ? draftPlan.firstOvertimeStopId === stop.customerId : false);

              return (
                <div key={`${stop.customerId}-${stop.stopOrder}`}>
                  {draftPlan?.lunchBlock && index === lunchInsertIndex ? (
                    <div className="mb-2.5 rounded-[20px] border border-[#f1ddad] bg-[#fff9eb] px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="rounded-full border border-[#f1ddad] bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a5a08]">Lunch</p>
                            <span className="rounded-full border border-[#f1ddad] bg-[#fff3cf] px-2.5 py-1 text-xs font-semibold text-[#8a5a08]">{draftPlan.lunchBlock.minutes} min</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-[#6f4a0a]">
                            {formatDateTime(draftPlan.lunchBlock.startTime)} to {formatDateTime(draftPlan.lunchBlock.endTime)}
                          </p>
                        </div>
                        <p className="text-sm text-[#8a5a08]">Dedicated itinerary block for the mid-route break.</p>
                      </div>
                    </div>
                  ) : null}

                  <div
                    className={[
                      "rounded-[20px] border px-3 py-3",
                      isFirstOvertimeStop
                        ? "border-[#f3c6c6] bg-[#fff6f6]"
                        : stop.scheduleFlag === "tight"
                          ? "border-[#f2ddb0] bg-[#fffdf6]"
                          : "border-[#dbe8ef] bg-[#fbfdfe]",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#607b89]">Stop {index + 1}</p>
                            <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", scheduleFlagBadgeClass(stop.scheduleFlag)].join(" ")}>
                              {stop.scheduleFlag.replace("_", " ")}
                            </span>
                            <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", lockBadgeClass(stop.locked)].join(" ")}>
                              {stop.locked ? "Locked" : "Unlocked"}
                            </span>
                            {isFirstOvertimeStop ? (
                              <span className="rounded-full border border-[#f3c6c6] bg-[#fff1f1] px-2.5 py-1 text-xs font-semibold text-[#a33a3a]">First overtime stop</span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-semibold text-[#173543]">{stop.customerName}</p>
                          <div className="mt-2 grid gap-1 text-sm text-[#5c7483]">
                            <p>Arrive {formatDateTime(stop.plannedArrivalTime)} • Depart {formatDateTime(stop.plannedDepartureTime)}</p>
                            <p>Drive {stop.estimatedDriveMinutesFromPrevious} min • Visit {stop.estimatedVisitMinutes} min • Distance {(stop.legDistanceMeters / 1609.34).toFixed(1)} mi</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleStopLock(stop.customerId)}
                            className={[
                              "rounded-full border px-3 py-1.5 text-sm transition",
                              stop.locked
                                ? "border-[#d7d2f4] bg-[#f7f4ff] text-[#5f4aa5] hover:bg-[#f1ecff]"
                                : "border-[#d0dde5] bg-white text-[#42606f] hover:border-[#14b8a6] hover:text-[#0f766e]",
                            ].join(" ")}
                          >
                            {stop.locked ? "Unlock" : "Lock Stop"}
                          </button>
                          <button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60">
                            Up
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(index, 1)}
                            disabled={index === draftStops.length - 1}
                            className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                          >
                            Down
                          </button>
                          <button type="button" onClick={() => removeDraftStop(stop.customerId)} className="rounded-full border border-[#f2d1d1] bg-white px-3 py-1.5 text-sm text-[#9a3d3d] transition hover:bg-[#fff7f7]">
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {draftPlan && draftStops.length > 0 ? (
              <div className="rounded-[20px] border border-[#d9e7ee] bg-[linear-gradient(180deg,#f8fcfd_0%,#eef6f9_100%)] px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#607b89]">Return</p>
                      <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#355966]">HQ</span>
                    </div>
                    <p className="mt-1 font-semibold text-[#173543]">{JC_RAD_HQ.name}</p>
                    <p className="mt-2 text-sm text-[#5c7483]">
                      Final drive {draftPlan.returnDriveMinutes} min • ETA {formatDateTime(draftPlan.projectedReturnTime)}
                    </p>
                  </div>
                  <p className="text-sm text-[#5c7483]">Explicit return-to-origin block for runner compatibility.</p>
                </div>
              </div>
            ) : null}

            {draftStops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                Finalize a route to review the optimized stop order and schedule.
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
  disabled = false,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] disabled:opacity-60"
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#173543]">{value}</p>
    </div>
  );
}
