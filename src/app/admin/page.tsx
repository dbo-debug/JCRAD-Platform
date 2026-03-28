import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import {
  DashboardPanel,
  PlatformActivityList,
  QueueActionRow,
  QueueSnapshotCard,
  ShortcutRail,
  StatusPill,
  SummaryBox,
  WorkflowCard,
} from "@/components/admin/dashboard/DashboardPrimitives";
import EstimateLeadFollowUpPanel from "@/components/workspace/EstimateLeadFollowUpPanel";
import { loadCustomerApprovalQueue, summarizeCustomerApprovalQueue } from "@/lib/customerApprovals";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import {
  buildAdminDashboardViewModel,
  type CustomerTaskRow,
  type EstimateRow,
  type OrderRow,
  type PackagingSubmissionRow,
  type PlatformEventRow,
} from "@/lib/adminDashboard";
import { requireStaff } from "@/lib/requireStaff";
import { loadSavedRoutes } from "@/lib/routeWorkspace";
import { loadScopedCustomerTasks } from "@/lib/taskWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const supabase = createAdminClient();
  const referenceNow = Date.parse(new Date().toISOString());

  const [
    estimateRes,
    orderRes,
    submissionRes,
    eventRes,
    routeStopQueueRes,
    taskRows,
    customerIndex,
    savedRoutes,
    approvalQueue,
  ] = await Promise.all([
    supabase
      .from("estimates")
      .select("id, status, total, customer_name, customer_email, packaging_review_pending, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("orders")
      .select("id, status, total, customer_name, customer_email, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("packaging_submissions")
      .select("id, estimate_id, category, status, customer_name, customer_email, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("platform_events")
      .select("id, event_type, user_email, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("route_stop_queue").select("id"),
    loadScopedCustomerTasks({ staff, limit: 2000 }),
    loadCustomerWorkspaceIndex(),
    loadSavedRoutes(staff),
    isAdmin ? loadCustomerApprovalQueue() : Promise.resolve([]),
  ]);

  const approvalStatusCounts = summarizeCustomerApprovalQueue(approvalQueue);
  const dashboard = buildAdminDashboardViewModel({
    staff,
    referenceNow,
    estimates: (estimateRes.data || []) as EstimateRow[],
    orders: (orderRes.data || []) as OrderRow[],
    submissions: (submissionRes.data || []) as PackagingSubmissionRow[],
    platformEvents: (eventRes.data || []) as PlatformEventRow[],
    pendingStopsCount: (routeStopQueueRes.data || []).length,
    customerTasks: taskRows as CustomerTaskRow[],
    customers: customerIndex.customers,
    savedRoutes,
    approvalQueue,
    approvalStatusCounts: {
      pending: approvalStatusCounts.pending,
      docsLinked: approvalQueue.filter((item) => item.readyState === "docs_linked").length,
      followUp: approvalStatusCounts.followUp,
    },
  });

  const hasEstimateError = Boolean(estimateRes.error);
  const hasOrderError = Boolean(orderRes.error);
  const hasSubmissionError = Boolean(submissionRes.error);
  const hasEventError = Boolean(eventRes.error);
  const hasTaskError = false;
  const hasRouteQueueError = Boolean(routeStopQueueRes.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isAdmin ? "Command Center" : "My Day"}
        description={
          isAdmin
            ? "Intervene, unblock, monitor team load, then drop into the right tool."
            : "Do the next follow-up, then route work, then watch account movement."
        }
      />

      {(hasEstimateError || hasOrderError || hasSubmissionError || hasEventError || hasTaskError || hasRouteQueueError) ? (
        <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-4 py-3 text-sm text-[#991b1b]">
          Some dashboard data is unavailable right now. Refresh after backend sync.
        </div>
      ) : null}

      {isAdmin && dashboard.admin ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {dashboard.admin.workflowCards.map((card) => (
              <WorkflowCard key={card.title} {...card} />
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-5">
            <div className="space-y-4 xl:col-span-3">
              <DashboardPanel
                title="Intervene here first"
                description="These are the queues where one admin decision can unblock a lot of downstream work."
              >
                <div className="space-y-2">
                  {dashboard.admin.actionItems.map((item) => (
                    <QueueActionRow key={item.title} item={item} />
                  ))}
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Unblock blocked work"
                description="Route-adjacent accounts that cannot move until cleanup happens."
                href={dashboard.admin.hrefs.blockedCleanup}
                hrefLabel="Open blocked accounts"
              >
                <div className="grid gap-2 md:grid-cols-2">
                  {dashboard.blockedCustomers.map((customer) => (
                    <Link
                      key={customer.id}
                      href={customer.href}
                      className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                    >
                      <p className="font-semibold text-[#173543]">{customer.name}</p>
                      <p className="text-xs text-[#5b7382]">{customer.detail}</p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{customer.ctaLabel}</p>
                    </Link>
                  ))}
                  {dashboard.blockedCustomers.length === 0 ? <p className="text-sm text-[#5b7382]">No blocked route accounts right now.</p> : null}
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Monitor team load"
                description="Use this view to decide where routes and follow-up pressure need intervention next."
                href={dashboard.admin.hrefs.teamWorkload}
                hrefLabel="Open team workload"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryBox
                    label="Routes this week"
                    value={`${dashboard.counts.routesThisWeek} scheduled`}
                    detail={`${dashboard.counts.activeRoutes} active • ${dashboard.counts.unassignedRoutes} still unassigned`}
                  />
                  <SummaryBox
                    label="Follow-up pressure"
                    value={`${dashboard.counts.openTasks} open tasks`}
                    detail={`${dashboard.counts.overdueTasks} overdue • ${dashboard.counts.customersNeedingFollowUp} customers affected`}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.activeRoutes.map((route) => (
                    <Link
                      key={route.id}
                      href={route.href}
                      className="flex items-center justify-between rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                    >
                      <div>
                        <p className="font-semibold text-[#173543]">{route.name}</p>
                        <p className="text-xs text-[#5b7382]">{route.detail}</p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{route.ctaLabel}</p>
                      </div>
                      <span className="rounded-full bg-[#eef7f6] px-2 py-0.5 text-xs font-semibold text-[#0f766e]">{route.status}</span>
                    </Link>
                  ))}
                  {dashboard.activeRoutes.length === 0 ? <p className="text-sm text-[#5b7382]">No active routes right now.</p> : null}
                </div>
              </DashboardPanel>

              <EstimateLeadFollowUpPanel description="Latest estimate activity feeding the next follow-up and funnel pressure." />
            </div>

            <div className="space-y-4 xl:col-span-2">
              <DashboardPanel
                title="Clear bottlenecks next"
                description="Business queues waiting on admin review or decision."
              >
                <div className="space-y-3">
                  {dashboard.admin.bottleneckSnapshots.map((item) => (
                    <QueueSnapshotCard key={item.title} item={item} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatusPill label="Pending" value={dashboard.counts.packagingPending} tone="warn" />
                  <StatusPill label="Docs Linked" value={dashboard.counts.approvalDocsLinked} tone="ok" />
                  <StatusPill label="Follow-up" value={approvalStatusCounts.followUp} tone="bad" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#5b7382]">
                  <span>Flower: {dashboard.packagingByCategory.get("flower") || 0}</span>
                  <span>Pre-roll: {dashboard.packagingByCategory.get("pre_roll") || 0}</span>
                  <span>Vape: {dashboard.packagingByCategory.get("vape") || 0}</span>
                  <span>Concentrate: {dashboard.packagingByCategory.get("concentrate") || 0}</span>
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Tools after triage"
                description="Shortcuts stay available, but only after the operational queues."
              >
                <ShortcutRail cards={dashboard.shortcuts} />
              </DashboardPanel>
            </div>
          </section>

          <DashboardPanel
            title="Platform activity"
            description="Recent platform events remain visible, but below the operational workflows."
          >
            <PlatformActivityList events={dashboard.platformActivityItems} />
          </DashboardPanel>
        </>
      ) : null}

      {!isAdmin && dashboard.sales ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.sales.workflowCards.map((card) => (
              <WorkflowCard key={card.title} {...card} />
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-5">
            <div className="space-y-4 xl:col-span-3">
              <DashboardPanel
                title="Do this now"
                description="Work the day in order: overdue follow-up first, then assigned follow-up, then route work."
              >
                <div className="space-y-2">
                  {dashboard.sales.actionItems.map((item) => (
                    <QueueActionRow key={item.title} item={item} />
                  ))}
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Assigned follow-up queue"
                description="The follow-up work already assigned to you and the accounts it is affecting."
                href={dashboard.sales.hrefs.assignedTasks}
                hrefLabel="Open assigned tasks"
              >
                <div className="grid grid-cols-3 gap-2">
                  <StatusPill label="Assigned" value={dashboard.counts.openTasks} tone="warn" />
                  <Link href={dashboard.sales.hrefs.overdueTasks} className="block">
                    <StatusPill label="Overdue" value={dashboard.counts.overdueTasks} tone="bad" />
                  </Link>
                  <StatusPill label="Accounts" value={dashboard.counts.customersNeedingFollowUp} tone="ok" />
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.openTaskItems.map((task) => (
                    <Link
                      key={task.id}
                      href={task.href}
                      className="block rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                    >
                      <p className="font-semibold text-[#173543]">{task.title}</p>
                      <p className="text-xs text-[#5b7382]">{task.detail}</p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{task.ctaLabel}</p>
                    </Link>
                  ))}
                  {dashboard.openTaskItems.length === 0 ? <p className="text-sm text-[#5b7382]">No assigned tasks right now.</p> : null}
                </div>
              </DashboardPanel>

              <EstimateLeadFollowUpPanel description="Estimate movement that is most likely to create your next follow-up calls." />
            </div>

            <div className="space-y-4 xl:col-span-2">
              <DashboardPanel
                title="Then work your route"
                description="Route execution sits behind follow-up, but should be ready when you get there."
                href={dashboard.sales.hrefs.routeQueue}
                hrefLabel="Open route handoff"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryBox
                    label="In your scope"
                    value={`${dashboard.counts.activeRoutes} active`}
                    detail={`${dashboard.counts.pendingStops} pending stops • route handoff stays focused on the next route`}
                  />
                  <SummaryBox
                    label="Next route handoff"
                    value={dashboard.counts.activeRoutes > 0 ? "Route runner ready" : "Routes workspace"}
                    detail={dashboard.counts.activeRoutes > 0 ? "Launch directly into execution when a route is ready." : "Use the routes workspace when there is no next route yet."}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.activeRoutes.map((route) => (
                    <Link
                      key={route.id}
                      href={route.href}
                      className="flex items-center justify-between rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                    >
                      <div>
                        <p className="font-semibold text-[#173543]">{route.name}</p>
                        <p className="text-xs text-[#5b7382]">{route.detail}</p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{route.ctaLabel}</p>
                      </div>
                      <span className="rounded-full bg-[#eef7f6] px-2 py-0.5 text-xs font-semibold text-[#0f766e]">{route.status}</span>
                    </Link>
                  ))}
                  {dashboard.activeRoutes.length === 0 ? <p className="text-sm text-[#5b7382]">No routes are currently in your scope.</p> : null}
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Then watch account movement"
                description="After follow-up and route work, this is the watchlist that can create the next action."
                href={dashboard.sales.hrefs.customerWatchlist}
                hrefLabel="Open account watchlist"
              >
                <div className="space-y-2">
                  {dashboard.accountActivityItems.map((customer) => (
                    <Link
                      key={customer.id}
                      href={customer.href}
                      className="block rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                    >
                      <p className="font-semibold text-[#173543]">{customer.name}</p>
                      <p className="text-xs text-[#5b7382]">{customer.detail}</p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{customer.ctaLabel}</p>
                    </Link>
                  ))}
                  {dashboard.accountActivityItems.length === 0 ? <p className="text-sm text-[#5b7382]">No assigned account activity right now.</p> : null}
                </div>
                <div className="mt-4 border-t border-[#dbe9ef] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">Order watch</p>
                  <div className="mt-2 space-y-2">
                    {dashboard.recentPendingOrders.map((order) => (
                      <Link
                        key={order.id}
                        href={order.href}
                        className="block rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                      >
                        <p className="font-semibold text-[#173543]">{order.name}</p>
                        <p className="text-xs text-[#5b7382]">{order.detail}</p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{order.ctaLabel}</p>
                      </Link>
                    ))}
                    {dashboard.recentPendingOrders.length === 0 ? <p className="text-sm text-[#5b7382]">No open order activity right now.</p> : null}
                  </div>
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Quick actions"
                description="Keep the tools close, but after the work queues."
              >
                <ShortcutRail cards={dashboard.shortcuts} />
              </DashboardPanel>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
