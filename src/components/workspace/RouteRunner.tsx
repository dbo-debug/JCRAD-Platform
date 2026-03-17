"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { RouteRepOption } from "@/lib/routeWorkspace";
import {
  formatDate,
  formatDateTime,
  getRouteSearchText,
  normalizeMailtoHref,
  normalizeTelHref,
  normalizeText,
  priorityChipClass,
  sortCustomersForRoute,
  titleCase,
  visitStatusChipClass,
} from "@/components/workspace/routeUtils";

type RouteRunnerProps = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
  currentUserId: string;
  focusCustomerId?: string;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function getCurrentRouteDay() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
}

export default function RouteRunner({ customers, routeRepOptions, currentUserId, focusCustomerId }: RouteRunnerProps) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [routeDayFilter, setRouteDayFilter] = useState(getCurrentRouteDay());
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [visitStatusFilter, setVisitStatusFilter] = useState("all");
  const deferredSearch = useDeferredValue(search);

  const routeDays = Array.from(new Set(customers.map((customer) => String(customer.routeDay || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const territories = Array.from(new Set(customers.map((customer) => String(customer.territoryCode || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const visitStatuses = Array.from(new Set(customers.map((customer) => String(customer.visitStatus || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const visibleCustomers = [...customers]
    .filter((customer) => {
      if (focusCustomerId && customer.id !== focusCustomerId) return false;
      const query = normalizeText(deferredSearch);
      if (query && !getRouteSearchText(customer).includes(query)) return false;
      if (scope === "mine" && customer.assignedRouteRepUserId !== currentUserId) return false;
      if (routeDayFilter !== "all" && normalizeText(customer.routeDay) !== normalizeText(routeDayFilter)) return false;
      if (territoryFilter !== "all" && normalizeText(customer.territoryCode) !== normalizeText(territoryFilter)) return false;
      if (visitStatusFilter !== "all" && normalizeText(customer.visitStatus) !== normalizeText(visitStatusFilter)) return false;
      return true;
    })
    .sort(sortCustomersForRoute);

  const currentRepLabel = routeRepOptions.find((option) => option.userId === currentUserId)?.label || "Current rep";

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[780px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Route Runner</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Compact stop cards for calls, visits, notes, and next-step capture in the field</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">
              Default scope is your assigned route work for today. Each stop supports fast visit marking, visit logging, and follow-up task creation without leaving the runner.
            </p>
          </div>
          <div className="rounded-2xl border border-[#dbe8ef] bg-white/85 p-4 text-sm text-[#506877] shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Scoped Rep</p>
            <p className="mt-1 text-lg font-semibold text-[#173543]">{currentRepLabel}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Visible Stops</p>
            <p className="mt-1 text-2xl font-semibold text-[#173543]">{visibleCustomers.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.9fr))]">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Search stops</span>
            <input
              value={search}
              onChange={(event) => startTransition(() => setSearch(event.target.value))}
              placeholder="Search account, contact, phone, email"
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
          </label>

          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Scope</span>
            <select
              value={scope}
              onChange={(event) => startTransition(() => setScope(event.target.value as "mine" | "all"))}
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            >
              <option value="mine">Assigned to me</option>
              <option value="all">All reps</option>
            </select>
          </label>

          <SelectFilter label="Route Day" value={routeDayFilter} onChange={setRouteDayFilter} options={routeDays} />
          <SelectFilter label="Territory" value={territoryFilter} onChange={setTerritoryFilter} options={territories} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SelectFilter label="Visit Status" value={visitStatusFilter} onChange={setVisitStatusFilter} options={visitStatuses} />
          <Link
            href="/workspace/routes"
            className="ml-auto inline-flex rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Back to Planner
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        {visibleCustomers.map((customer) => (
          <RouteStopCard key={customer.id} customer={customer} />
        ))}

        {visibleCustomers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-6 text-sm text-[#5d7685]">
            No route stops match the current runner filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
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
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function RouteStopCard({ customer }: { customer: CustomerSummary }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"visit" | "log" | "task" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visitStatus, setVisitStatus] = useState(customer.visitStatus || "visited");
  const [nextVisitDueAt, setNextVisitDueAt] = useState(customer.nextVisitDueAt ? String(customer.nextVisitDueAt).slice(0, 10) : "");
  const [visitNotes, setVisitNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  const primaryContact = customer.primaryContacts[0] || null;
  const emailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
  const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);

  async function runAction(action: "visit" | "log", summary: string) {
    setBusyAction(action);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/workspace/customers/${customer.id}/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mark_visited: action === "visit",
          activity_type: action === "visit" ? "visit_completed" : "visit_logged",
          summary,
          notes: visitNotes || null,
          visit_status: visitStatus || null,
          next_visit_due_at: nextVisitDueAt || null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      setStatusMessage(action === "visit" ? "Visit recorded." : "Visit activity logged.");
      setVisitNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function createFollowUpTask() {
    if (!taskTitle.trim()) {
      setError("Enter a follow-up title first.");
      return;
    }

    setBusyAction("task");
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/workspace/customers/${customer.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          due_date: taskDueDate || null,
          assigned_user_id: customer.assignedRouteRepUserId || null,
          priority: customer.routePriority,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      setTaskTitle("");
      setTaskDueDate("");
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
            {titleCase(customer.routeDay, "No route day")} • Territory {customer.territoryCode || "Unassigned"} • Rep {customer.assignedRouteRepName || "Unassigned"}
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <RunnerInfo title="Primary Contact" lines={[primaryContact?.name || "No primary contact", primaryContact?.phone || customer.mainPhone || "No phone", primaryContact?.email || customer.primaryContactEmail || "No email"]} />
            <RunnerInfo title="Visit Window" lines={[`Next due ${formatDate(customer.nextVisitDueAt)}`, `Last visit ${formatDateTime(customer.lastVisitAt)}`]} />
            <RunnerInfo title="Routing" lines={[customer.latitude !== null && customer.longitude !== null ? `Geo ${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}` : "No coordinates yet", customer.status ? `Account ${titleCase(customer.status)}` : null]} />
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
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span>Status after stop</span>
              <select
                value={visitStatus}
                onChange={(event) => setVisitStatus(event.target.value)}
                className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#173543]"
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
                className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#173543]"
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
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#173543]"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction("visit", `Visited ${customer.name}`)}
              disabled={busyAction !== null}
              className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busyAction === "visit" ? "Saving..." : "Mark visited"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("log", `Logged visit update for ${customer.name}`)}
              disabled={busyAction !== null}
              className="rounded-full border border-[#cfdde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] disabled:opacity-60"
            >
              {busyAction === "log" ? "Saving..." : "Log visit activity"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-4">
          <h3 className="text-sm font-semibold text-[#173543]">Follow-up Task</h3>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Task title</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Send quote recap, call back, collect info"
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#173543]"
            />
          </label>
          <label className="mt-3 grid gap-1 text-sm text-[#4b6676]">
            <span>Due date</span>
            <input
              type="date"
              value={taskDueDate}
              onChange={(event) => setTaskDueDate(event.target.value)}
              className="rounded-xl border border-[#cedde6] bg-white px-3 py-2 text-sm text-[#173543]"
            />
          </label>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void createFollowUpTask()}
              disabled={busyAction !== null}
              className="rounded-full border border-[#cfdde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] disabled:opacity-60"
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
