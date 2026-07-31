import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { NAMELESS_WORKSPACE_KEY, OPPORTUNITY_STAGE_OPTIONS } from "@/lib/namelessWorkspace";
import { requireStaff } from "@/lib/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type DashboardQueryError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};
type DashboardQueryResult = {
  data: Row[] | null;
  error: DashboardQueryError | null;
};

const CUSTOMER_ACTIVITY_ID_CHUNK_SIZE = 100;

function logDashboardQueryError(label: string, table: string, error: DashboardQueryError) {
  console.error("[workspace/sales] dashboard query failed", {
    query_label: label,
    table_name: table,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

async function loadCustomerActivity(
  admin: ReturnType<typeof createAdminClient>,
  customerIds: string[],
): Promise<DashboardQueryResult> {
  const rows: Row[] = [];

  for (let offset = 0; offset < customerIds.length; offset += CUSTOMER_ACTIVITY_ID_CHUNK_SIZE) {
    const customerIdChunk = customerIds.slice(offset, offset + CUSTOMER_ACTIVITY_ID_CHUNK_SIZE);
    const result = await admin
      .from("customer_activity")
      .select("id, customer_id, activity_type, occurred_at, created_at")
      .in("customer_id", customerIdChunk)
      .limit(5000);

    if (result.error) {
      return { data: null, error: result.error as DashboardQueryError };
    }

    rows.push(...((result.data || []) as Row[]));
  }

  return { data: rows, error: null };
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function currency(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function labelize(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function NamelessSalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ commissionFrom?: string; commissionTo?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const admin = createAdminClient();
  const { customers } = await loadCustomerWorkspaceIndex();
  const customerIds = customers.map((customer) => customer.id);
  const querySpecs = [
    {
      label: "retail_opportunities",
      table: "retail_opportunities",
      run: async () => admin.from("retail_opportunities").select("*").eq("workspace_key", NAMELESS_WORKSPACE_KEY).limit(5000),
    },
    {
      label: "retail_samples",
      table: "retail_samples",
      run: async () => admin.from("retail_samples").select("*").eq("workspace_key", NAMELESS_WORKSPACE_KEY).limit(5000),
    },
    {
      label: "retail_sales_orders",
      table: "retail_sales_orders",
      run: async () => admin.from("retail_sales_orders").select("*").eq("workspace_key", NAMELESS_WORKSPACE_KEY).limit(5000),
    },
    {
      label: "customer_activity",
      table: "customer_activity",
      run: async () => loadCustomerActivity(admin, customerIds),
    },
    {
      label: "route_stop_sales_outcomes",
      table: "route_stop_sales_outcomes",
      run: async () => admin.from("route_stop_sales_outcomes").select("*").eq("workspace_key", NAMELESS_WORKSPACE_KEY).limit(5000),
    },
  ] as const;
  const queryResults = await Promise.all(
    querySpecs.map(async (query) => ({
      label: query.label,
      table: query.table,
      result: (await query.run()) as DashboardQueryResult,
    })),
  );

  const failedQueries = queryResults.filter(({ result }) => result.error);
  for (const { label, table, result } of failedQueries) {
    logDashboardQueryError(label, table, result.error as DashboardQueryError);
  }
  if (failedQueries.length > 0) {
    const failureSummary = failedQueries
      .map(({ label, result }) => `${label}: ${String(result.error?.message || "Unknown query error")}`)
      .join("; ");
    throw new Error(`Sales dashboard query failure — ${failureSummary}`);
  }

  const [
    { result: opportunitiesRes },
    { result: samplesRes },
    { result: ordersRes },
    { result: activitiesRes },
    { result: routeOutcomesRes },
  ] = queryResults;

  const opportunities = (opportunitiesRes.data || []) as Row[];
  const samples = (samplesRes.data || []) as Row[];
  const orders = (ordersRes.data || []) as Row[];
  const activities = (activitiesRes.data || []) as Row[];
  const routeOutcomes = (routeOutcomesRes.data || []) as Row[];
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const commissionFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(params.commissionFrom || ""))
    ? String(params.commissionFrom)
    : monthStart.toISOString().slice(0, 10);
  const commissionTo = /^\d{4}-\d{2}-\d{2}$/.test(String(params.commissionTo || ""))
    ? String(params.commissionTo)
    : new Date(monthEnd.getTime() - 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dueToday = customers.filter((customer) => {
    const due = Date.parse(String(customer.nextTaskDueAt || ""));
    return Number.isFinite(due) && due >= today.getTime() && due < tomorrow.getTime();
  }).length;
  const overdue = customers.reduce((sum, customer) => sum + customer.overdueTaskCount, 0);
  const meetingsThisWeek = activities.filter((activity) => {
    if (!String(activity.activity_type || "").includes("meeting")) return false;
    const occurred = Date.parse(String(activity.occurred_at || activity.created_at || ""));
    return Number.isFinite(occurred) && occurred >= today.getTime() && occurred < weekEnd.getTime();
  }).length;
  const samplesAwaitingFeedback = samples.filter((sample) =>
    ["pending", "no_response"].includes(String(sample.outcome || "pending"))
  ).length;
  const expectedOrderValue = opportunities
    .filter((opportunity) => !["lost", "not_qualified"].includes(String(opportunity.stage || "")))
    .reduce((sum, opportunity) => sum + number(opportunity.estimated_order_value), 0);
  const ownershipUnverified = customers.filter((customer) => {
    return customer.ownershipStatus === "unverified";
  }).length;
  const newAccounts = customers.filter((customer) => {
    const created = Date.parse(String(customer.createdAt || ""));
    return Number.isFinite(created) && created >= monthStart.getTime();
  }).length;
  const noRecentActivity = customers.filter((customer) => {
    const last = Date.parse(String(customer.lastActivityAt || customer.createdAt || ""));
    return !Number.isFinite(last) || last < thirtyDaysAgo.getTime();
  }).length;
  const ordersThisMonth = orders.filter((order) => {
    const orderDate = Date.parse(String(order.order_date || ""));
    return Number.isFinite(orderDate) && orderDate >= monthStart.getTime() && orderDate < monthEnd.getTime();
  });
  const estimatedCommission = ordersThisMonth.reduce((sum, order) => sum + number(order.estimated_commission), 0);
  const filteredCommissionOrders = orders.filter((order) => {
    const orderDate = String(order.order_date || "");
    return orderDate >= commissionFrom && orderDate <= commissionTo;
  });
  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const commissionByAccount = new Map<string, { customerId: string; name: string; sales: number; commission: number }>();
  for (const order of filteredCommissionOrders) {
    const customerId = String(order.customer_id || "");
    const current = commissionByAccount.get(customerId) || {
      customerId,
      name: customerNameById.get(customerId) || "Unknown account",
      sales: 0,
      commission: 0,
    };
    current.sales += number(order.commissionable_sales);
    current.commission += number(order.estimated_commission);
    commissionByAccount.set(customerId, current);
  }
  const reordersDue = opportunities.filter((opportunity) => String(opportunity.stage) === "reorder_due").length;

  const stageCounts = new Map<string, number>();
  for (const stage of OPPORTUNITY_STAGE_OPTIONS) stageCounts.set(stage, 0);
  for (const opportunity of opportunities) {
    const stage = String(opportunity.stage || "new_prospect");
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }

  const routeMetrics = {
    stops: routeOutcomes.length,
    completed: routeOutcomes.filter((row) => row.field_status === "visited").length,
    buyers: routeOutcomes.filter((row) => row.buyer_reached === true).length,
    samples: routeOutcomes.filter((row) => row.samples_delivered === true).length,
    followUps: routeOutcomes.filter((row) => row.follow_up_created === true).length,
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description="Today’s retail pipeline, field execution, order movement, and operational commission view."
      />

      <section aria-label="Sales work metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
        <DashboardCard label="Follow-ups due today" value={String(dueToday)} href="/workspace/customers?taskState=has_open_task&sort=activity_desc" />
        <DashboardCard label="Overdue follow-ups" value={String(overdue)} href="/workspace/customers?taskState=overdue_task&sort=activity_desc" tone="warn" />
        <DashboardCard label="Meetings this week" value={String(meetingsThisWeek)} href="/workspace/customers?stage=meeting_scheduled" />
        <DashboardCard label="Samples awaiting feedback" value={String(samplesAwaitingFeedback)} href="/workspace/customers?stage=awaiting_sample_feedback" />
        <DashboardCard label="Expected order value" value={currency(expectedOrderValue)} href="/workspace/customers?savedView=pipeline" />
        <DashboardCard label="Ownership verification" value={String(ownershipUnverified)} href="/workspace/customers?q=unverified" tone="warn" />
        <DashboardCard label="New accounts this month" value={String(newAccounts)} href="/workspace/customers?sort=activity_desc" />
        <DashboardCard label="No recent activity" value={String(noRecentActivity)} href="/workspace/customers?sort=activity_desc" tone="warn" />
        <DashboardCard label="Orders this month" value={String(ordersThisMonth.length)} href="/workspace/customers?orderState=has_orders" />
        <DashboardCard label="Estimated commission" value={currency(estimatedCommission)} href="/workspace/sales#commission" helper="Not guaranteed income" />
        <DashboardCard label="Reorders due" value={String(reordersDue)} href="/workspace/customers?stage=reorder_due" />
        <DashboardCard label="Route completion" value={`${routeMetrics.completed}/${routeMetrics.stops}`} href="/workspace/routes/run" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[24px] border border-[#d8e6ed] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#181817]">Opportunities by stage</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[...stageCounts.entries()].filter(([, count]) => count > 0).map(([stage, count]) => (
              <Link key={stage} href={`/workspace/customers?stage=${encodeURIComponent(stage)}`} className="flex min-h-11 items-center justify-between rounded-xl border border-[#d8e6ed] px-3 text-sm hover:border-[#405d6b]">
                <span>{labelize(stage)}</span><strong>{count}</strong>
              </Link>
            ))}
            {opportunities.length === 0 ? (
              <p className="rounded-lg bg-[var(--workspace-surface-muted)] p-4 text-sm text-[var(--workspace-muted)] sm:col-span-2">
                No opportunities yet. Qualify a retail account to begin the stage view.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#d8e6ed] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#181817]">Route performance</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniMetric label="Completed" value={routeMetrics.completed} />
            <MiniMetric label="Buyers reached" value={routeMetrics.buyers} />
            <MiniMetric label="Samples" value={routeMetrics.samples} />
            <MiniMetric label="Follow-ups" value={routeMetrics.followUps} />
          </div>
          <Link href="/workspace/routes/run" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#181817] px-5 text-sm font-semibold text-white">Open Route Runner</Link>
        </div>
      </section>

      <section id="commission" className="scroll-mt-24 rounded-[24px] border border-[#d8e6ed] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#181817]">Commission by date range</h2>
            <p className="mt-1 text-sm text-[#6d8593]">Operational estimates only; not guaranteed income.</p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[#6d8593]">From<input name="commissionFrom" type="date" defaultValue={commissionFrom} className="min-h-11 rounded-xl border border-[#d8e6ed] px-3 text-sm text-[#181817]" /></label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-[#6d8593]">To<input name="commissionTo" type="date" defaultValue={commissionTo} className="min-h-11 rounded-xl border border-[#d8e6ed] px-3 text-sm text-[#181817]" /></label>
            <button className="min-h-11 self-end rounded-full bg-[#181817] px-5 text-sm font-semibold text-white">Apply</button>
          </form>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[...commissionByAccount.values()].map((account) => (
            <Link key={account.customerId} href={`/workspace/customers/${account.customerId}#nameless-sales-workspace`} className="rounded-2xl border border-[#d8e6ed] bg-[#f7fbfc] p-4 hover:border-[#405d6b]">
              <p className="font-semibold text-[#181817]">{account.name}</p>
              <p className="mt-1 text-sm text-[#5c7483]">Commissionable {currency(account.sales)} • Estimated {currency(account.commission)}</p>
            </Link>
          ))}
          {commissionByAccount.size === 0 ? <p className="text-sm text-[#6d8593]">No orders in this date range.</p> : null}
        </div>
        {filteredCommissionOrders.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#6d8593]"><tr><th className="pb-2">Order</th><th className="pb-2">Account</th><th className="pb-2">Date</th><th className="pb-2">Commissionable</th><th className="pb-2">Rate</th><th className="pb-2">Estimated</th><th className="pb-2">Status</th></tr></thead>
              <tbody>
                {filteredCommissionOrders.map((order) => (
                  <tr key={String(order.id)} className="border-t border-[#e8eff3]">
                    <td className="py-3">{String(order.order_number || order.invoice_number || String(order.id).slice(0, 8))}</td>
                    <td className="py-3">{customerNameById.get(String(order.customer_id || "")) || "Unknown account"}</td>
                    <td className="py-3">{String(order.order_date || "")}</td>
                    <td className="py-3">{currency(number(order.commissionable_sales))}</td>
                    <td className="py-3">{(number(order.commission_rate) * 100).toFixed(2)}%</td>
                    <td className="py-3">{currency(number(order.estimated_commission))}</td>
                    <td className="py-3">{labelize(String(order.commission_status || "estimated"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DashboardCard({ label, value, href, tone = "default", helper }: { label: string; value: string; href: string; tone?: "default" | "warn"; helper?: string }) {
  return <Link href={href} className={["min-h-24 rounded-[var(--workspace-radius)] border p-3.5 shadow-sm transition hover:border-[var(--workspace-border-strong)] hover:bg-[var(--workspace-elevated)]", tone === "warn" ? "border-amber-200 bg-amber-50/70" : "border-[var(--workspace-border)] bg-white"].join(" ")}><p className="text-xs font-medium leading-4 text-[var(--workspace-muted)]">{label}</p><p className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-[var(--workspace-text)]">{value}</p>{helper ? <p className="mt-1 text-xs text-[var(--workspace-warning)]">{helper}</p> : null}</Link>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-[var(--workspace-surface-muted)] px-3 py-3 text-center"><p className="text-xl font-semibold text-[var(--workspace-text)]">{value}</p><p className="mt-1 text-xs text-[var(--workspace-muted)]">{label}</p></div>;
}
