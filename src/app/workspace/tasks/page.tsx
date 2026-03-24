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

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tasks"
        description="Unified follow-up queue across customer accounts, route work, and sales operations."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open Tasks" value={openTasks.length} href="/workspace/tasks?view=open" active={view === "open"} />
        <MetricCard label="Overdue" value={overdueTasks.length} href="/workspace/tasks?view=overdue" active={view === "overdue"} />
        <MetricCard label="Completed" value={completedTasks.length} href="/workspace/tasks?view=completed" active={view === "completed"} />
      </section>

      <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Task Queue</p>
            <h2 className="mt-1 text-lg font-semibold text-[#173543]">{staff.role === "admin" ? "All customer tasks" : "My assigned customer tasks"}</h2>
          </div>
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">{visibleTasks.length} in view</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TaskViewChip href="/workspace/tasks?view=open" label="Open" count={openTasks.length} active={view === "open"} />
          <TaskViewChip href="/workspace/tasks?view=overdue" label="Overdue" count={overdueTasks.length} active={view === "overdue"} />
          <TaskViewChip href="/workspace/tasks?view=upcoming" label="Upcoming" count={upcomingTasks.length} active={view === "upcoming"} />
          <TaskViewChip href="/workspace/tasks?view=completed" label="Completed" count={completedTasks.length} active={view === "completed"} />
        </div>

        <div className="mt-4 space-y-3">
          {visibleTasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#173543]">{task.title || "Untitled task"}</p>
                    <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#496574]">
                      {titleCase(task.status, "Open")}
                    </span>
                    <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#496574]">
                      Priority {task.priority ?? "None"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#5c7483]">
                    Due {formatDate(task.due_date)} • Customer {task.customer?.name || "Unknown customer"} • Territory {task.customer?.territoryCode || "Unassigned"}
                  </p>
                  {view !== "completed" && isOverdue(task.due_date, referenceNow) && !CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task.status)) ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a3d3d]">Overdue</p>
                  ) : null}
                </div>
                {task.customer ? (
                  <Link
                    href={`/workspace/customers/${task.customer.id}`}
                    className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                  >
                    Open Customer
                  </Link>
                ) : null}
              </div>
            </div>
          ))}

          {visibleTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
              No customer tasks found for the {view} view.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function isOverdue(value: string | null, referenceNow: number) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) && parsed < referenceNow;
}

function MetricCard({ label, value, href, active }: { label: string; value: number; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-xl border bg-white p-4 shadow-sm transition hover:border-[#14b8a6]",
        active ? "border-[#14b8a6]" : "border-[#dbe9ef]",
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
    </Link>
  );
}

function TaskViewChip({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
        active ? "border-[#14b8a6] bg-[#effcf9] text-[#0f766e]" : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877] hover:border-[#14b8a6]",
      ].join(" ")}
    >
      {label} ({count})
    </Link>
  );
}
