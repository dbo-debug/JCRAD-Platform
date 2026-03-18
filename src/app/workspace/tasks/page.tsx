import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { titleCase } from "@/components/workspace/routeUtils";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { requireStaff } from "@/lib/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  customer_id: string | null;
  title: string | null;
  due_date: string | null;
  assigned_user_id: string | null;
  status: string | null;
  priority: number | null;
  created_at: string | null;
  completed_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "No due date";
  return new Date(parsed).toLocaleDateString();
}

function normalizeStatus(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);

export default async function WorkspaceTasksPage() {
  const staff = await requireStaff();
  const supabase = createAdminClient();
  const referenceNow = Date.parse(new Date().toISOString());
  const [{ customers }, taskRes] = await Promise.all([
    loadCustomerWorkspaceIndex(),
    supabase
      .from("customer_tasks")
      .select("id, customer_id, title, due_date, assigned_user_id, status, priority, created_at, completed_at")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (taskRes.error) {
    throw new Error(taskRes.error.message);
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const tasks = ((taskRes.data || []) as TaskRow[])
    .filter((task) => (staff.role === "admin" ? true : String(task.assigned_user_id || "").trim() === staff.userId))
    .map((task) => ({
      ...task,
      customer: customerById.get(String(task.customer_id || "").trim()) || null,
    }));

  const openTasks = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(normalizeStatus(task.status)));
  const overdueTasks = openTasks.filter((task) => {
    const due = Date.parse(String(task.due_date || ""));
    return Number.isFinite(due) && due < referenceNow;
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tasks"
        description="Unified follow-up queue across customer accounts, route work, and sales operations."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open Tasks" value={openTasks.length} />
        <MetricCard label="Overdue" value={overdueTasks.length} />
        <MetricCard label="Completed" value={tasks.length - openTasks.length} />
      </section>

      <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Task Queue</p>
            <h2 className="mt-1 text-lg font-semibold text-[#173543]">{staff.role === "admin" ? "All customer tasks" : "My assigned customer tasks"}</h2>
          </div>
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">{tasks.length} total</span>
        </div>

        <div className="mt-4 space-y-3">
          {tasks.map((task) => (
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

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
              No customer tasks found for this view.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}
