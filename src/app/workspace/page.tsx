import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EstimateLeadFollowUpPanel from "@/components/workspace/EstimateLeadFollowUpPanel";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { requireStaff } from "@/lib/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  assigned_user_id: string | null;
  status: string | null;
};

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);

export default async function WorkspaceDashboardPage() {
  const staff = await requireStaff();
  const supabase = createAdminClient();
  const [{ customers }, taskRes] = await Promise.all([
    loadCustomerWorkspaceIndex(),
    supabase
      .from("customer_tasks")
      .select("id, assigned_user_id, status")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (taskRes.error) {
    throw new Error(taskRes.error.message);
  }

  const scopedTasks = ((taskRes.data || []) as TaskRow[]).filter((task) =>
    staff.role === "admin" ? true : String(task.assigned_user_id || "").trim() === staff.userId
  );
  const openTasks = scopedTasks.filter((task) => !CLOSED_TASK_STATUSES.has(normalizeStatus(task.status)));
  const hotLeads = customers.filter((customer) => customer.isHotLead);
  const unassignedAccounts = customers.filter((customer) => !customer.assignedSalesUserId);

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title={staff.role === "admin" ? "Command Center" : "Sales Dashboard"}
        description="Internal staff dashboard for CRM follow-up, estimate conversion, and task visibility."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/workspace/customers"
              className="inline-flex rounded-full border border-[#cfdde5] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
            >
              Open Customers
            </Link>
            <Link
              href="/workspace/tasks"
              className="inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Open Tasks
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Customer Accounts" value={customers.length} />
        <MetricCard label="Hot Leads" value={hotLeads.length} />
        <MetricCard label={staff.role === "admin" ? "Open Tasks" : "My Open Tasks"} value={openTasks.length} />
        <MetricCard label="Unassigned Accounts" value={unassignedAccounts.length} />
      </section>

      <EstimateLeadFollowUpPanel
        title="Recent Estimate Leads"
        description="Self-service estimates that need account linkage or staff follow-up."
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[#d7e6ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_30px_rgba(16,42,67,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#617d8c]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}
