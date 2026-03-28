"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SavedRouteDetail, SavedRouteStop } from "@/lib/routeWorkspace";
import { syncGeneratedRouteName } from "@/lib/routeNames";
import { parseBusinessDateTime } from "@/lib/businessTime";
import {
  formatDateTime,
  normalizeMailtoHref,
  normalizeTelHref,
  priorityChipClass,
  titleCase,
  VISIT_OUTCOMES,
  visitStatusChipClass,
} from "@/components/workspace/routeUtils";

type SavedRouteRunnerProps = {
  route: SavedRouteDetail;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function addDaysDateValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toMs(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDelta(minutes: number) {
  if (Math.abs(minutes) <= 5) return "On time";
  return minutes > 0 ? `${minutes} min behind` : `${Math.abs(minutes)} min ahead`;
}

function routeProgressTone(deltaMinutes: number) {
  if (Math.abs(deltaMinutes) <= 5) return "text-[#16624b]";
  return deltaMinutes > 0 ? "text-[#9a3d3d]" : "text-[#285ea8]";
}

function getScheduledStartMs(route: SavedRouteDetail) {
  if (!route.routeDate || !route.plannedStartTime) return null;
  const scheduledStart = parseBusinessDateTime({
    routeDate: route.routeDate,
    time: route.plannedStartTime,
  });
  const scheduledStartMs = scheduledStart.getTime();
  return Number.isFinite(scheduledStartMs) ? scheduledStartMs : null;
}

function getPlannedReturnMs(route: SavedRouteDetail, scheduledStartMs: number | null) {
  if (scheduledStartMs !== null && Number.isFinite(route.estimatedTotalMinutes || NaN)) {
    return scheduledStartMs + Math.max(0, route.estimatedTotalMinutes || 0) * 60 * 1000;
  }
  return toMs(route.estimatedReturnTime);
}

function buildRouteProgress(route: SavedRouteDetail) {
  const visitedStops = route.stops.filter((stop) => stop.stopStatus === "visited");
  const now = Date.now();
  const status = String(route.status || "").toLowerCase();
  const routeNotStarted = status === "draft" || status === "assigned";
  const nextPendingStop = route.stops.find((stop) => stop.stopStatus !== "visited" && stop.stopStatus !== "skipped") || null;
  const lastCompletedAt =
    visitedStops
      .map((stop) => toMs(stop.customer.lastVisitAt))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] || null;
  const scheduledStartMs = getScheduledStartMs(route);

  const baselineMs = lastCompletedAt || (routeNotStarted && scheduledStartMs !== null ? scheduledStartMs : now);
  const remainingStops = route.stops.filter((stop) => stop.stopStatus !== "visited" && stop.stopStatus !== "skipped");
  const remainingVisitMinutes = remainingStops.reduce((sum, stop) => sum + (stop.estimatedVisitMinutes || 0), 0);
  const routeStopDriveMinutes = route.stops.reduce((sum, stop) => sum + (stop.estimatedDriveMinutesFromPrevious || 0), 0);
  const returnDriveMinutes = Math.max(0, (route.estimatedDriveMinutes || 0) - routeStopDriveMinutes);
  const remainingDriveMinutes = remainingStops.reduce((sum, stop) => sum + (stop.estimatedDriveMinutesFromPrevious || 0), 0);
  const projectedFinishMs = baselineMs + (remainingVisitMinutes + remainingDriveMinutes) * 60 * 1000;
  const projectedReturnMs = projectedFinishMs + returnDriveMinutes * 60 * 1000;
  const plannedReturnMs = getPlannedReturnMs(route, scheduledStartMs);
  const progressDeltaMinutes =
    plannedReturnMs && routeNotStarted && scheduledStartMs !== null && now < scheduledStartMs
      ? 0
      : plannedReturnMs
        ? Math.round((projectedReturnMs - plannedReturnMs) / 60000)
        : 0;
  const nextStopDeltaMinutes = nextPendingStop?.plannedArrivalTime ? Math.round((now - Date.parse(nextPendingStop.plannedArrivalTime)) / 60000) : 0;

  return {
    visitedCount: visitedStops.length,
    remainingCount: remainingStops.length,
    plannedReturnTime: plannedReturnMs ? new Date(plannedReturnMs).toISOString() : null,
    projectedFinishTime: new Date(projectedFinishMs).toISOString(),
    projectedReturnTime: new Date(projectedReturnMs).toISOString(),
    progressDeltaMinutes,
    nextStopDeltaMinutes,
  };
}

export default function SavedRouteRunner({ route }: SavedRouteRunnerProps) {
  const router = useRouter();
  const progress = useMemo(() => buildRouteProgress(route), [route]);
  const routeTitle = route.routeDate
    ? syncGeneratedRouteName({
        name: route.name,
        territoryCode: route.territoryCode,
        routeDate: route.routeDate,
      }) || route.name
    : route.name;
  const [routeStatus, setRouteStatus] = useState(route.status || "draft");
  const [routeBusy, setRouteBusy] = useState<"start" | "complete" | null>(null);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);

  async function updateRouteStatus(nextStatus: "in_progress" | "completed") {
    setRouteBusy(nextStatus === "in_progress" ? "start" : "complete");
    setRouteMessage(null);

    try {
      const res = await fetch("/api/workspace/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: route.id,
          status: nextStatus,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setRouteStatus(nextStatus);
      setRouteMessage(nextStatus === "in_progress" ? "Route started." : "Route marked completed.");
      router.refresh();
    } catch (error) {
      setRouteMessage(error instanceof Error ? error.message : "Route update failed");
    } finally {
      setRouteBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[760px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Saved Route Runner</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#173543]">{routeTitle}</h2>
            <p className="mt-2 text-sm text-[#5c7483]">
              {route.routeDate || "No date"} • {route.assignedUserLabel || "Unassigned rep"} • {route.stops.length} stops • {routeStatus}
            </p>
            <p className="mt-1 text-sm text-[#5c7483]">
              Origin {route.originName} • {route.originAddress}
            </p>
            {route.notes ? <p className="mt-2 text-sm text-[#5c7483]">{route.notes}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {routeStatus !== "in_progress" && routeStatus !== "completed" ? (
                <button
                  type="button"
                  onClick={() => void updateRouteStatus("in_progress")}
                  disabled={routeBusy !== null}
                  className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
                >
                  {routeBusy === "start" ? "Starting..." : "Start Route"}
                </button>
              ) : null}
              {routeStatus === "in_progress" ? (
                <button
                  type="button"
                  onClick={() => void updateRouteStatus("completed")}
                  disabled={routeBusy !== null}
                  className="rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                >
                  {routeBusy === "complete" ? "Completing..." : "Complete Route"}
                </button>
              ) : null}
            </div>
            {routeMessage ? <p className="mt-2 text-sm text-[#4f6877]">{routeMessage}</p> : null}
          </div>
          <div className="grid w-full gap-2 rounded-2xl border border-[#dbe8ef] bg-white/90 p-4 text-sm text-[#506877] shadow-sm sm:max-w-[360px]">
            <MetricLine label="Start Time" value={route.plannedStartTime || "Not set"} />
            <MetricLine label="Drive Minutes" value={String(route.estimatedDriveMinutes || 0)} />
            <MetricLine label="Visit Minutes" value={String(route.estimatedVisitMinutes || 0)} />
            <MetricLine label="Lunch Minutes" value={String(route.lunchMinutes || 0)} />
            <MetricLine label="Planned Return" value={progress.plannedReturnTime ? formatDateTime(progress.plannedReturnTime) : "Not set"} />
            <MetricLine label="Projected Finish" value={formatDateTime(progress.projectedFinishTime)} />
            <MetricLine label="Projected Return" value={formatDateTime(progress.projectedReturnTime)} />
            <MetricLine label="Visited / Remaining" value={`${progress.visitedCount} / ${progress.remainingCount}`} />
            <div className={["text-sm font-semibold", routeProgressTone(progress.progressDeltaMinutes)].join(" ")}>
              Route status: {formatDelta(progress.progressDeltaMinutes)}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {route.stops.map((stop) => (
          <SavedRouteStopCard key={stop.id} stop={stop} />
        ))}
      </section>
    </div>
  );
}

function SavedRouteStopCard({ stop }: { stop: SavedRouteStop }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"visit" | "log" | "task" | "outcome" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visitStatus, setVisitStatus] = useState(stop.customer.visitStatus || "visited");
  const [nextVisitDueAt, setNextVisitDueAt] = useState(stop.customer.nextVisitDueAt ? String(stop.customer.nextVisitDueAt).slice(0, 10) : "");
  const [visitNotes, setVisitNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [autoCreateTask, setAutoCreateTask] = useState(false);

  const customer = stop.customer;
  const primaryContact = customer.primaryContacts[0] || null;
  const emailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
  const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);
  const actualVisitMs = toMs(customer.lastVisitAt);
  const plannedArrivalMs = toMs(stop.plannedArrivalTime);
  const stopDeltaMinutes = actualVisitMs !== null && plannedArrivalMs !== null ? Math.round((actualVisitMs - plannedArrivalMs) / 60000) : null;

  async function updateRouteStop(stopStatus: "visited" | "skipped" | "ready") {
    const res = await fetch(`/api/workspace/routes/stops/${stop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stop_status: stopStatus,
        notes: visitNotes || null,
      }),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
  }

  async function submitVisit(payload: Record<string, unknown>, successMessage: string, nextStopStatus: "visited" | "ready") {
    const res = await fetch(`/api/workspace/customers/${customer.id}/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
    await updateRouteStop(nextStopStatus);
    setStatusMessage(successMessage);
    setVisitNotes("");
    router.refresh();
  }

  async function submitTask(taskOverrides?: { title?: string; dueDate?: string | null }) {
    const title = String(taskOverrides?.title || taskTitle).trim();
    if (!title) throw new Error("Enter a follow-up title first.");

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
        action === "visit" ? "Visit recorded." : "Visit activity logged.",
        action === "visit" ? "visited" : "ready"
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
        `${outcome.label} recorded.`,
        outcome.key === "no_answer" || outcome.key === "unavailable" ? "ready" : "visited"
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

  async function markSkipped() {
    setBusyAction("visit");
    setError(null);
    setStatusMessage(null);

    try {
      await updateRouteStop("skipped");
      setStatusMessage("Stop marked skipped.");
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
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#496574]">Stop {stop.stopOrder}</span>
            <Link href={`/workspace/customers/${customer.id}`} className="text-lg font-semibold text-[#173543] transition hover:text-[#0f766e]">
              {customer.name}
            </Link>
            <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", visitStatusChipClass(customer.visitStatus)].join(" ")}>
              {titleCase(customer.visitStatus, "No visit status")}
            </span>
            <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", priorityChipClass(customer.routePriority)].join(" ")}>
              Priority {customer.routePriority ?? "None"}
            </span>
            <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#496574]">{titleCase(stop.stopStatus)}</span>
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
              title="Planned Timing"
              lines={[
                `Arrive ${formatDateTime(stop.plannedArrivalTime)}`,
                `Depart ${formatDateTime(stop.plannedDepartureTime)}`,
                `Drive ${stop.estimatedDriveMinutesFromPrevious ?? 0} min • Visit ${stop.estimatedVisitMinutes ?? 30} min`,
              ]}
            />
            <RunnerInfo
              title="Actual vs Plan"
              lines={[
                `Actual ${formatDateTime(customer.lastVisitAt)}`,
                stopDeltaMinutes === null ? "No actual timestamp yet" : formatDelta(stopDeltaMinutes),
                customer.latitude !== null && customer.longitude !== null ? `Geo ${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}` : "No coordinates yet",
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:w-[240px] lg:flex-none lg:justify-end">
          <Link href={`/workspace/customers/${customer.id}`} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]">
            Open account
          </Link>
          {phoneHref ? (
            <a href={phoneHref} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]">
              Call contact
            </a>
          ) : null}
          {emailHref ? (
            <a href={emailHref} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]">
              Email contact
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-4">
          <h3 className="text-sm font-semibold text-[#173543]">Visit Actions</h3>
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
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span>Status after stop</span>
              <select
                value={visitStatus}
                onChange={(event) => setVisitStatus(event.target.value)}
                className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
              >
                <option value="visited">Visited</option>
                <option value="due">Due</option>
                <option value="needs_follow_up">Needs Follow-Up</option>
                <option value="no_answer">No Answer</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span>Next visit due</span>
              <input
                type="date"
                value={nextVisitDueAt}
                onChange={(event) => setNextVisitDueAt(event.target.value)}
                className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
              />
            </label>
          </div>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Visit notes</span>
            <textarea
              value={visitNotes}
              onChange={(event) => setVisitNotes(event.target.value)}
              rows={3}
              placeholder="Quick notes from the stop"
              className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void runAction("visit", `Completed visit at ${customer.name}`)} disabled={busyAction !== null} className="rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busyAction === "visit" ? "Saving..." : "Mark Visited"}
            </button>
            <button type="button" onClick={() => void runAction("log", `Logged route activity at ${customer.name}`)} disabled={busyAction !== null} className="rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#42606f] disabled:opacity-60">
              Log Activity
            </button>
            <button type="button" onClick={() => void markSkipped()} disabled={busyAction !== null} className="rounded-full border border-[#f2d1d1] bg-white px-4 py-2 text-sm font-semibold text-[#9a3d3d] disabled:opacity-60">
              Skip Stop
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-4">
          <h3 className="text-sm font-semibold text-[#173543]">Follow-Up Task</h3>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-[#4b6676]">
            <input type="checkbox" checked={autoCreateTask} onChange={(event) => setAutoCreateTask(event.target.checked)} className="h-4 w-4 accent-[#14b8a6]" />
            Auto-create a task after outcome
          </label>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Task title</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder={`Follow up with ${customer.name}`}
              className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
            />
          </label>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Due date</span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(event) => setTaskDueDate(event.target.value)}
              className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
            />
          </label>
          <button type="button" onClick={() => void createFollowUpTask()} disabled={busyAction !== null} className="mt-3 rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#42606f] disabled:opacity-60">
            {busyAction === "task" ? "Saving..." : "Create Task"}
          </button>
          {statusMessage ? <p className="mt-3 text-sm text-[#35505d]">{statusMessage}</p> : null}
          {error ? <p className="mt-2 text-sm text-[#9a3d3d]">{error}</p> : null}
        </section>
      </div>
    </article>
  );
}

function RunnerInfo({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-[#dbe8ef] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#56717f]">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
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
