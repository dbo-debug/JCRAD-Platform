import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { titleCase } from "@/components/workspace/routeUtils";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { requireStaff } from "@/lib/requireStaff";
import {
  filterTasksByView,
  loadScopedCustomerTasks,
  resolveTaskView,
  CLOSED_TASK_STATUSES,
  normalizeTaskStatus,
  type TaskViewKey,
} from "@/lib/taskWorkspace";

export const dynamic = "force-dynamic";

type TaskWithCustomer = Awaited<ReturnType<typeof loadScopedCustomerTasks>>[number] & {
  customer: Awaited<ReturnType<typeof loadCustomerWorkspaceIndex>>["customers"][number] | null;
};

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "No due date";
  return new Date(parsed).toLocaleDateString();
}

function formatRelativeTime(value: string | null) {
  if (!value) return "unknown";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "unknown";
  const diffMs = Date.now() - ms;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function isOverdue(value: string | null, referenceNow: number) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) && parsed < referenceNow;
}

function getPriorityLabel(priority: number | null) {
  if (priority === null) return "Priority none";
  if (priority >= 8) return `Priority ${priority} • high`;
  if (priority >= 5) return `Priority ${priority} • medium`;
  return `Priority ${priority} • low`;
}

function getTaskRowTone(task: TaskWithCustomer, referenceNow: number, view: TaskViewKey) {
  if (view === "completed") return "completed";
  if (isOverdue(task.due_date, referenceNow) && !CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task.status))) return "overdue";
  return "active";
}

function getTaskPrimaryCta(task: TaskWithCustomer, referenceNow: number) {
  if (!task.customer) return null;
  if (isOverdue(task.due_date, referenceNow)) {
    return {
      label: "Open overdue account",
      href: `/workspace/customers/${task.customer.id}`,
    };
  }
  return {
    label: "Open customer",
    href: `/workspace/customers/${task.customer.id}`,
  };
}

export default async function WorkspaceTasksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const referenceNow = Date.parse(new Date().toISOString());
  const [{ customers }, taskRows] = await Promise.all([
    loadCustomerWorkspaceIndex(),
    loadScopedCustomerTasks({ staff, limit: 500 }),
  ]);

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const view = resolveTaskView(asQueryValue(params?.view), staff.role);
  const tasks: TaskWithCustomer[] = taskRows.map((task) => ({
    ...task,
    customer: customerById.get(String(task.customer_id || "").trim()) || null,
  }));

  const openTasks = filterTasksByView({ tasks, view: "open", referenceNow });
  const overdueTasks = filterTasksByView({ tasks, view: "overdue", referenceNow });
  const upcomingTasks = filterTasksByView({ tasks, view: "upcoming", referenceNow });
  const completedTasks = filterTasksByView({ tasks, view: "completed", referenceNow });
  const visibleTasks = filterTasksByView({ tasks, view, referenceNow });
  const affectedCustomerCount = new Set(openTasks.map((task) => String(task.customer_id || "").trim()).filter(Boolean)).size;
  const recentCompletedCount = completedTasks.filter((task) => {
    const completedAt = Date.parse(String(task.completed_at || ""));
    return Number.isFinite(completedAt) && completedAt >= referenceNow - 7 * 24 * 60 * 60 * 1000;
  }).length;

  const queueSummary =
    view === "overdue"
      ? {
          eyebrow: "Needs Attention Now",
          title: "Overdue follow-up queue",
          description: `${visibleTasks.length} overdue tasks are affecting customer response time right now.`,
        }
      : view === "open"
        ? {
            eyebrow: "Active Queue",
            title: staff.role === "admin" ? "Open follow-up across the team" : "My active follow-up queue",
            description: `${visibleTasks.length} open tasks are currently in play across ${affectedCustomerCount} customer accounts.`,
          }
        : view === "upcoming"
          ? {
              eyebrow: "Scheduled Next",
              title: "Upcoming follow-up queue",
              description: `${visibleTasks.length} tasks are scheduled next so you can work ahead before they become overdue.`,
            }
          : {
              eyebrow: "Recently Done",
              title: "Completed follow-up",
              description: `${recentCompletedCount} tasks were completed in the last 7 days.`,
            };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tasks"
        description={
          staff.role === "admin"
            ? "Monitor follow-up load across customer accounts, scan urgency, and jump into the account that needs the next decision."
            : "Personal daily workbench for overdue follow-up, active customer touches, and scheduled next steps."
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <QueueCard
          label="Needs Attention Now"
          title="Overdue"
          value={overdueTasks.length}
          href="/workspace/tasks?view=overdue"
          helper="Work this first"
          active={view === "overdue"}
          tone="warn"
        />
        <QueueCard
          label="Active Queue"
          title="Open"
          value={openTasks.length}
          href="/workspace/tasks?view=open"
          helper={staff.role === "admin" ? `${affectedCustomerCount} accounts impacted` : "My current work"}
          active={view === "open"}
        />
        <QueueCard
          label="Scheduled Next"
          title="Upcoming"
          value={upcomingTasks.length}
          href="/workspace/tasks?view=upcoming"
          helper="What is due next"
          active={view === "upcoming"}
        />
        <QueueCard
          label="Recently Done"
          title="Completed"
          value={completedTasks.length}
          href="/workspace/tasks?view=completed"
          helper={`${recentCompletedCount} done in 7d`}
          active={view === "completed"}
        />
      </section>

      <section className="rounded-[24px] border border-[#deded8] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[760px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">{queueSummary.eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold text-[#181817]">{queueSummary.title}</h2>
            <p className="mt-1 text-sm text-[#5c7483]">{queueSummary.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#f1ddad] bg-[#fff9eb] px-3 py-1.5 text-sm text-[#8a5b00]">{overdueTasks.length} overdue</span>
            <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4f6877]">{openTasks.length} open</span>
            <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4f6877]">{completedTasks.length} completed</span>
            {staff.role === "admin" ? (
              <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4f6877]">{affectedCustomerCount} customers affected</span>
            ) : (
              <span className="rounded-full border border-[#deded8] bg-[#f7f7f4] px-3 py-1.5 text-sm text-[#4f6877]">Assigned to me only</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TaskViewChip href="/workspace/tasks?view=overdue" label="Overdue" count={overdueTasks.length} active={view === "overdue"} tone="warn" />
          <TaskViewChip href="/workspace/tasks?view=open" label="Open" count={openTasks.length} active={view === "open"} />
          <TaskViewChip href="/workspace/tasks?view=upcoming" label="Upcoming" count={upcomingTasks.length} active={view === "upcoming"} />
          <TaskViewChip href="/workspace/tasks?view=completed" label="Completed" count={completedTasks.length} active={view === "completed"} />
        </div>
      </section>

      <section className="space-y-3">
        {visibleTasks.map((task) => {
          const tone = getTaskRowTone(task, referenceNow, view);
          const primaryCta = getTaskPrimaryCta(task, referenceNow);

          return (
            <article
              key={task.id}
              className={[
                "rounded-[24px] border p-4 shadow-sm",
                tone === "overdue"
                  ? "border-[#f1d6d3] bg-[#fff7f6]"
                  : tone === "completed"
                    ? "border-[#dce7ed] bg-[#f7f7f4]"
                    : "border-[#deded8] bg-white",
              ].join(" ")}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
                        tone === "overdue"
                          ? "border-[#f1d6d3] bg-[#fff1ef] text-[#a0443f]"
                          : tone === "completed"
                            ? "border-[#d8e4ea] bg-white text-[#5d7583]"
                            : "border-[#deded8] bg-[#f7f7f4] text-[#496574]",
                      ].join(" ")}
                    >
                      {tone === "overdue" ? "Needs attention now" : tone === "completed" ? "Completed" : "Active follow-up"}
                    </span>
                    <span className="rounded-full border border-[#deded8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#496574]">
                      {titleCase(task.status, "Open")}
                    </span>
                    <span className="rounded-full border border-[#deded8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#496574]">
                      {getPriorityLabel(task.priority)}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-semibold text-[#181817]">{task.title || "Untitled task"}</h3>
                  <p className="mt-1 text-sm text-[#5c7483]">
                    {task.customer?.name || "Unknown customer"} • Territory {task.customer?.territoryCode || "Unassigned"} • Due {formatDate(task.due_date)}
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <InfoBlock
                      label="Account"
                      value={task.customer?.name || "Customer not linked"}
                      detail={task.customer ? `${task.customer.city || "No city"} • ${task.customer.assignedSalesName || "Owner unassigned"}` : "Open the task source and relink if needed"}
                    />
                    <InfoBlock
                      label="Urgency"
                      value={
                        tone === "overdue"
                          ? "Overdue now"
                          : view === "upcoming"
                            ? "Scheduled next"
                            : view === "completed"
                              ? "Recently done"
                              : "Active follow-up"
                      }
                      detail={
                        tone === "completed"
                          ? `Completed ${formatRelativeTime(task.completed_at)}`
                          : `Created ${formatRelativeTime(task.created_at)}`
                      }
                    />
                    <InfoBlock
                      label="Next Click"
                      value={primaryCta ? primaryCta.label : "Inspect customer link"}
                      detail={task.customer ? "Open the customer account to continue the workflow." : "This task is missing a usable customer link."}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {primaryCta ? (
                    <Link
                      href={primaryCta.href}
                      className={[
                        "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                        tone === "overdue"
                          ? "bg-[#181817] text-white hover:bg-[#0f2a35]"
                          : "border border-[#deded8] bg-white text-[#42606f] hover:border-[#1b1b1a] hover:text-[#1b1b1a]",
                      ].join(" ")}
                    >
                      {primaryCta.label}
                    </Link>
                  ) : null}
                  {task.customer ? (
                    <Link
                      href={`/workspace/customers/${task.customer.id}#customer-tasks`}
                      className="rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#1b1b1a] hover:text-[#1b1b1a]"
                    >
                      Open task context
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {visibleTasks.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#deded8] bg-[#fafaf8] px-4 py-12 text-center">
            <p className="text-lg font-semibold text-[#181817]">No follow-up tasks in this queue.</p>
            <p className="mt-2 text-sm text-[#5c7483]">
              {view === "overdue"
                ? "Nothing is overdue right now. Switch to open or upcoming to keep the queue moving."
                : view === "completed"
                  ? "No recently completed tasks were found in this view."
                  : "Switch views to scan another part of the follow-up queue."}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function QueueCard({
  label,
  title,
  value,
  href,
  helper,
  active,
  tone = "default",
}: {
  label: string;
  title: string;
  value: number;
  href: string;
  helper: string;
  active?: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-xl border p-4 shadow-sm transition hover:border-[#1b1b1a]",
        active
          ? "border-[#1b1b1a] bg-[#f7f7f4]"
          : tone === "warn"
            ? "border-[#f1ddad] bg-[#fff9eb]"
            : "border-[#deded8] bg-white",
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#181817]">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-[#181817]">{value}</p>
      <p className="mt-2 text-sm text-[#5c7483]">{helper}</p>
    </Link>
  );
}

function TaskViewChip({
  href,
  label,
  count,
  active,
  tone = "default",
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
        active
          ? "border-[#1b1b1a] bg-[#f7f7f4] text-[#1b1b1a]"
          : tone === "warn"
            ? "border-[#f1ddad] bg-[#fff9eb] text-[#8a5b00] hover:border-[#1b1b1a]"
            : "border-[#deded8] bg-[#f7f7f4] text-[#4f6877] hover:border-[#1b1b1a]",
      ].join(" ")}
    >
      {label} ({count})
    </Link>
  );
}

function InfoBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#e3edf2] bg-[#f7f7f4] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a909d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#294653]">{value}</p>
      <p className="mt-1 text-xs text-[#7a909d]">{detail}</p>
    </div>
  );
}
