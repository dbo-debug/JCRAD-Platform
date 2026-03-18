import Link from "next/link";
import type { ReactNode } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { getRouteEligibilityReason, isRouteEligibleCustomer } from "@/lib/routeEligibility";
import { loadSavedRoutes } from "@/lib/routeWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePackagingCategory, type PackagingCategory } from "@/lib/packaging/category";

export const dynamic = "force-dynamic";

type EstimateRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_name: string | null;
  customer_email: string | null;
  packaging_review_pending: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

type PackagingSubmissionRow = {
  id: string;
  estimate_id: string | null;
  category: string | null;
  status: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

type ProfileRow = Record<string, unknown>;
type PlatformEventRow = {
  id: string;
  event_type: string | null;
  user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type CustomerTaskRow = {
  id: string;
  customer_id: string | null;
  title: string | null;
  due_date: string | null;
  status: string | null;
};

const APPROVED_VERIFICATION_STATUSES = new Set(["approved", "verified"]);
const FOLLOW_UP_VERIFICATION_STATUSES = new Set(["rejected", "needs_review", "follow_up", "failed"]);
const CLOSED_ORDER_STATUSES = new Set(["fulfilled", "completed", "cancelled", "rejected", "closed"]);
const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);

const MODULE_CARDS = [
  {
    title: "Customers",
    description: "CRM records, segment builder, geocode cleanup, and pending-stop staging.",
    href: "/workspace/customers",
  },
  {
    title: "Routes",
    description: "Route command center, itinerary controls, and route runner handoff.",
    href: "/workspace/routes",
  },
  {
    title: "Tasks",
    description: "Follow-up workload across customers and field execution.",
    href: "/workspace/tasks",
  },
  {
    title: "Orders",
    description: "Order progression and approval tracking.",
    href: "/admin/orders",
  },
  {
    title: "Menu",
    description: "Live commercial menu and estimate entry path.",
    href: "/menu",
  },
  {
    title: "Packaging",
    description: "Packaging operations, reviews, and catalog maintenance.",
    href: "/admin/packaging",
  },
] as const;

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  return new Date(parsed).toLocaleDateString();
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "unknown time";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "unknown time";
  const diffMs = Date.now() - ms;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatMoney(value: number | null): string {
  if (!Number.isFinite(Number(value))) return "Pending total";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function getProfileVerificationStatus(row: ProfileRow): string {
  const explicit = normalizeStatus(row.verification_status);
  if (explicit) return explicit;
  if (row.verified === true || row.is_verified === true) return "verified";
  return "unverified";
}

function getProfileRole(row: ProfileRow): string {
  const role = normalizeStatus(row.role);
  return role || "customer";
}

function getProfileDisplayName(row: ProfileRow): string {
  const company = String(row.company_name || "").trim();
  const fullName = String(row.full_name || "").trim();
  const email = String(row.email || "").trim();
  return company || fullName || email || "Unnamed customer";
}

function getPendingOrderCount(rows: OrderRow[]): number {
  return rows.reduce((count, row) => {
    const status = normalizeStatus(row.status) || "pending";
    return CLOSED_ORDER_STATUSES.has(status) ? count : count + 1;
  }, 0);
}

function eventLabel(eventTypeRaw: string | null): string {
  const eventType = normalizeStatus(eventTypeRaw);
  if (eventType === "user_signup") return "User signup";
  if (eventType === "user_login") return "User login";
  if (eventType === "estimate_created") return "Estimate created";
  if (eventType === "estimate_line_added") return "Estimate line added";
  if (eventType === "estimate_add_line_failed") return "Estimate add-line failed";
  if (eventType === "order_requested") return "Order requested";
  return eventType || "Platform event";
}

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== "object") return "";
  const preferredKeys = ["estimate_id", "order_id", "offer_id", "mode", "line_count", "error"];
  const parts: string[] = [];
  for (const key of preferredKeys) {
    const value = metadata[key];
    if (value == null || value === "") continue;
    const display = String(value);
    parts.push(`${key}: ${display.length > 120 ? `${display.slice(0, 119)}…` : display}`);
  }
  return parts.join(" • ");
}

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();
  const referenceNow = Date.parse(new Date().toISOString());

  const [estimateRes, orderRes, submissionRes, profileRes, eventRes, routeStopQueueRes, taskRes, customerIndex, savedRoutes] = await Promise.all([
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
    supabase.from("profiles").select("*").limit(2000),
    supabase
      .from("platform_events")
      .select("id, event_type, user_email, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("route_stop_queue").select("id"),
    supabase
      .from("customer_tasks")
      .select("id, customer_id, title, due_date, status")
      .order("created_at", { ascending: false })
      .limit(2000),
    loadCustomerWorkspaceIndex(),
    loadSavedRoutes(),
  ]);

  const estimates = (estimateRes.data || []) as EstimateRow[];
  const orders = (orderRes.data || []) as OrderRow[];
  const submissions = (submissionRes.data || []) as PackagingSubmissionRow[];
  const profiles = (profileRes.data || []) as ProfileRow[];
  const platformEvents = (eventRes.data || []) as PlatformEventRow[];
  const customerTasks = (taskRes.data || []) as CustomerTaskRow[];
  const customers = customerIndex.customers;

  const routeReadyAccounts = customers.filter((customer) => isRouteEligibleCustomer(customer));
  const blockedByGeocode = customers.filter((customer) => getRouteEligibilityReason(customer) !== null);
  const pendingStopsCount = (routeStopQueueRes.data || []).length;
  const activeRoutes = savedRoutes.filter((route) => ["assigned", "in_progress"].includes(normalizeStatus(route.status)));
  const openTasks = customerTasks.filter((task) => !CLOSED_TASK_STATUSES.has(normalizeStatus(task.status)));
  const customersNeedingFollowUp = new Set(openTasks.map((task) => String(task.customer_id || "").trim()).filter(Boolean)).size;
  const overdueTaskCount = openTasks.filter((task) => {
    const due = Date.parse(String(task.due_date || ""));
    return Number.isFinite(due) && due < referenceNow;
  }).length;

  const draftEstimates = estimates.filter((row) => {
    const status = normalizeStatus(row.status);
    return !status || status === "draft";
  });
  const recentEstimates = estimates.slice(0, 6);

  const pendingOrdersCount = getPendingOrderCount(orders);

  const customerProfiles = profiles.filter((row) => {
    const role = getProfileRole(row);
    return role === "customer" || !role;
  });
  const approvedCustomers = customerProfiles.filter((row) =>
    APPROVED_VERIFICATION_STATUSES.has(getProfileVerificationStatus(row))
  );
  const followUpCustomers = customerProfiles.filter((row) =>
    FOLLOW_UP_VERIFICATION_STATUSES.has(getProfileVerificationStatus(row))
  );
  const pendingCustomers = customerProfiles.filter((row) => {
    const status = getProfileVerificationStatus(row);
    return !APPROVED_VERIFICATION_STATUSES.has(status);
  });

  const packagingPending = submissions.filter((row) => {
    const status = normalizeStatus(row.status);
    return !status || status === "pending";
  });
  const packagingApproved = submissions.filter((row) => normalizeStatus(row.status) === "approved");
  const packagingRejected = submissions.filter((row) => normalizeStatus(row.status) === "rejected");
  const recentPackagingSubmissions = submissions.slice(0, 6);

  const packagingByCategory = new Map<PackagingCategory, number>();
  for (const category of ["flower", "pre_roll", "vape", "concentrate"] as PackagingCategory[]) {
    packagingByCategory.set(category, 0);
  }
  for (const row of packagingPending) {
    const category = normalizePackagingCategory(row.category);
    if (!category) continue;
    packagingByCategory.set(category, Number(packagingByCategory.get(category) || 0) + 1);
  }

  const actionItems = [
    {
      label: "Pending route stops",
      count: pendingStopsCount,
      href: "/workspace/routes",
      tone: "neutral",
    },
    {
      label: "Accounts blocked by geocode",
      count: blockedByGeocode.length,
      href: "/workspace/customers",
      tone: "warn",
    },
    {
      label: "Packaging submissions need review",
      count: packagingPending.length,
      href: "/admin/packaging/submissions",
      tone: "warn",
    },
    {
      label: "Customers pending onboarding/compliance",
      count: pendingCustomers.length,
      href: "/admin/customers",
      tone: "warn",
    },
    {
      label: "Orders pending progression",
      count: pendingOrdersCount,
      href: "/admin/orders",
      tone: "neutral",
    },
    {
      label: "Customers needing follow-up tasks",
      count: customersNeedingFollowUp,
      href: "/workspace/tasks",
      tone: "neutral",
    },
  ] as const;

  const hasEstimateError = Boolean(estimateRes.error);
  const hasOrderError = Boolean(orderRes.error);
  const hasSubmissionError = Boolean(submissionRes.error);
  const hasProfileError = Boolean(profileRes.error);
  const hasEventError = Boolean(eventRes.error);
  const hasTaskError = Boolean(taskRes.error);
  const hasRouteQueueError = Boolean(routeStopQueueRes.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Command Center"
        description="Unified admin and operations dashboard for customers, routes, tasks, orders, menu, packaging, and route execution."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          label="Route-Ready Accounts"
          value={routeReadyAccounts.length}
          href="/workspace/customers"
          helper="Same eligibility rules as the planner"
        />
        <MetricCard
          label="Blocked By Geocode"
          value={blockedByGeocode.length}
          href="/workspace/customers"
          helper="Address, coord, or geocode issue"
        />
        <MetricCard
          label="Pending Stops"
          value={pendingStopsCount}
          href="/workspace/routes"
          helper="Queued for route planning"
        />
        <MetricCard
          label="Saved Routes"
          value={savedRoutes.length}
          href="/workspace/routes"
          helper={`${activeRoutes.length} active`}
        />
        <MetricCard
          label="Open Tasks"
          value={openTasks.length}
          href="/workspace/tasks"
          helper={`${overdueTaskCount} overdue`}
        />
        <MetricCard
          label="Draft Estimates"
          value={draftEstimates.length}
          href="/admin"
          helper="Status: draft or unset"
        />
        <MetricCard
          label="Pending Orders"
          value={pendingOrdersCount}
          href="/admin/orders"
          helper="Open order progression"
        />
        <MetricCard
          label="Pending Customers / Onboarding"
          value={pendingCustomers.length}
          href="/admin/customers"
          helper={`${approvedCustomers.length} approved`}
        />
        <MetricCard
          label="Packaging Review Queue"
          value={packagingPending.length}
          href="/admin/packaging/submissions"
          helper={`${packagingApproved.length} approved • ${packagingRejected.length} rejected`}
        />
      </section>

      {(hasEstimateError || hasOrderError || hasSubmissionError || hasProfileError || hasEventError || hasTaskError || hasRouteQueueError) ? (
        <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-4 py-3 text-sm text-[#991b1b]">
          Some dashboard data is unavailable right now. Refresh after backend sync.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Panel
            title="Unified Modules"
            description="Major platform modules now sit under one internal shell."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {MODULE_CARDS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="rounded-lg border border-[#dbe9ef] bg-white px-4 py-3 transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                >
                  <p className="font-semibold text-[#173543]">{card.title}</p>
                  <p className="mt-1 text-sm text-[#5b7382]">{card.description}</p>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel
            title="Action Items"
            description="Queues that need attention now."
            href="/workspace/routes"
            hrefLabel="Open operations"
          >
            <div className="space-y-2">
              {actionItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                >
                  <span className="text-[#2a4655]">{item.label}</span>
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      item.tone === "warn" ? "bg-[#fff3dd] text-[#8a5a08]" : "bg-[#eef7f6] text-[#0f766e]",
                    ].join(" ")}
                  >
                    {item.count}
                  </span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel
            title="Field Operations Summary"
            description="Current route planning and execution readiness."
            href="/workspace/routes"
            hrefLabel="Open routes"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">Route pipeline</p>
                <p className="mt-2 text-sm text-[#173543]">
                  {routeReadyAccounts.length} route-ready accounts • {pendingStopsCount} pending stops • {savedRoutes.length} saved routes
                </p>
              </div>
              <div className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">Active execution</p>
                <p className="mt-2 text-sm text-[#173543]">
                  {activeRoutes.length} active routes • {customersNeedingFollowUp} customers with open follow-up tasks
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {activeRoutes.slice(0, 4).map((route) => (
                <Link
                  key={route.id}
                  href={`/workspace/routes/run?routeId=${route.id}`}
                  className="flex items-center justify-between rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
                >
                  <div>
                    <p className="font-semibold text-[#173543]">{route.name}</p>
                    <p className="text-xs text-[#5b7382]">
                      {route.routeDate || "No date"} • {route.assignedUserLabel || "Unassigned rep"} • {route.stopCount} stops
                    </p>
                  </div>
                  <span className="rounded-full bg-[#eef7f6] px-2 py-0.5 text-xs font-semibold text-[#0f766e]">{route.status}</span>
                </Link>
              ))}
              {activeRoutes.length === 0 ? <p className="text-sm text-[#5b7382]">No active routes right now.</p> : null}
            </div>
          </Panel>

          <Panel
            title="Recent Estimates"
            description="Latest estimate activity and packaging lock state."
          >
            {recentEstimates.length === 0 ? (
              <p className="text-sm text-[#5b7382]">No estimates yet.</p>
            ) : (
              <div className="space-y-2">
                {recentEstimates.map((row) => {
                  const status = normalizeStatus(row.status) || "draft";
                  return (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-[#173543]">
                          {String(row.customer_name || row.customer_email || "Estimate")} • #{row.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-[#5b7382]">
                          {formatDate(row.updated_at || row.created_at)} • {formatMoney(row.total)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#f2f7fa] px-2 py-0.5 text-xs font-semibold text-[#4f6877]">
                          {status}
                        </span>
                        {row.packaging_review_pending ? (
                          <span className="rounded-full bg-[#fff3dd] px-2 py-0.5 text-xs font-semibold text-[#8a5a08]">
                            packaging pending
                          </span>
                        ) : null}
                        <Link
                          href={`/estimate/${encodeURIComponent(row.id)}/print`}
                          className="rounded-full border border-[#cfdce4] px-2 py-1 text-xs font-semibold text-[#294452] hover:border-[#14b8a6] hover:text-[#0f766e]"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <Panel
            title="Packaging Review Visibility"
            description="Customer packaging submissions by status and category."
            href="/admin/packaging/submissions"
            hrefLabel="Manage submissions"
          >
            <div className="grid grid-cols-3 gap-2">
              <StatusPill label="Pending" value={packagingPending.length} tone="warn" />
              <StatusPill label="Approved" value={packagingApproved.length} tone="ok" />
              <StatusPill label="Rejected" value={packagingRejected.length} tone="bad" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#5b7382]">
              <span>Flower: {packagingByCategory.get("flower") || 0}</span>
              <span>Pre-roll: {packagingByCategory.get("pre_roll") || 0}</span>
              <span>Vape: {packagingByCategory.get("vape") || 0}</span>
              <span>Concentrate: {packagingByCategory.get("concentrate") || 0}</span>
            </div>
            <div className="mt-3 space-y-2">
              {recentPackagingSubmissions.slice(0, 4).map((row) => (
                <div key={row.id} className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-[#173543]">{row.customer_name || row.customer_email || "Submission"}</p>
                  <p className="text-xs text-[#5b7382]">
                    {normalizePackagingCategory(row.category) || "unknown"} • {normalizeStatus(row.status) || "pending"} • {formatDate(row.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Customer Approval Visibility"
            description="Onboarding/compliance status using current profile verification model."
            href="/admin/customers"
            hrefLabel="Open customers"
          >
            <div className="grid grid-cols-3 gap-2">
              <StatusPill label="Pending" value={pendingCustomers.length} tone="warn" />
              <StatusPill label="Approved" value={approvedCustomers.length} tone="ok" />
              <StatusPill label="Follow-up" value={followUpCustomers.length} tone="bad" />
            </div>
            <div className="mt-3 space-y-2">
              {pendingCustomers.slice(0, 4).map((row, idx) => (
                <div key={`${String(row.id || idx)}`} className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-[#173543]">{getProfileDisplayName(row)}</p>
                  <p className="text-xs text-[#5b7382]">Status: {getProfileVerificationStatus(row)}</p>
                </div>
              ))}
              {pendingCustomers.length === 0 ? (
                <p className="text-sm text-[#5b7382]">No pending customer approvals.</p>
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Task Follow-Up Visibility"
            description="Open follow-up workload across customer accounts."
            href="/workspace/tasks"
            hrefLabel="Open tasks"
          >
            <div className="grid grid-cols-3 gap-2">
              <StatusPill label="Open" value={openTasks.length} tone="warn" />
              <StatusPill label="Overdue" value={overdueTaskCount} tone="bad" />
              <StatusPill label="Customers" value={customersNeedingFollowUp} tone="ok" />
            </div>
            <div className="mt-3 space-y-2">
              {openTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-[#173543]">{task.title || "Untitled task"}</p>
                  <p className="text-xs text-[#5b7382]">
                    {normalizeStatus(task.status) || "open"} • due {formatDate(task.due_date)}
                  </p>
                </div>
              ))}
              {openTasks.length === 0 ? <p className="text-sm text-[#5b7382]">No open customer tasks.</p> : null}
            </div>
          </Panel>

          <Panel
            title="Platform Activity"
            description="Recent tester activity and key flow events."
          >
            {platformEvents.length === 0 ? (
              <p className="text-sm text-[#5b7382]">No activity logged yet.</p>
            ) : (
              <div className="space-y-2">
                {platformEvents.map((row) => (
                  <div key={row.id} className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[#173543]">{eventLabel(row.event_type)}</p>
                      <span className="text-xs text-[#6d8593]">{formatRelativeTime(row.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#5b7382]">
                      {(row.user_email || "Unknown user")} • {formatDate(row.created_at)}
                    </p>
                    {metadataSummary(row.metadata) ? (
                      <p className="mt-1 text-xs text-[#4f6877]">{metadataSummary(row.metadata)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  href,
  helper,
}: {
  label: string;
  value: number;
  href: string;
  helper?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[#dbe9ef] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#14b8a6] hover:shadow-[0_12px_24px_-22px_rgba(16,24,40,0.45)]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[#6d8593]">{helper}</p> : null}
    </Link>
  );
}

function Panel({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[#5b7382]">{description}</p> : null}
        </div>
        {href && hrefLabel ? (
          <Link
            href={href}
            className="rounded-full border border-[#cfdce4] px-3 py-1 text-xs font-semibold text-[#2a4655] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warn" | "ok" | "bad";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#cde9e6] bg-[#eefaf8] text-[#0f766e]"
      : tone === "bad"
        ? "border-[#f3d2d2] bg-[#fff4f4] text-[#991b1b]"
        : "border-[#f2ddba] bg-[#fff9ed] text-[#8a5a08]";

  return (
    <div className={["rounded-lg border px-2 py-2 text-center", toneClass].join(" ")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
