import Link from "next/link";
import type { ReactNode } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePackagingCategory, type PackagingCategory } from "@/lib/packaging/category";

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

const APPROVED_VERIFICATION_STATUSES = new Set(["approved", "verified"]);
const FOLLOW_UP_VERIFICATION_STATUSES = new Set(["rejected", "needs_review", "follow_up", "failed"]);
const CLOSED_ORDER_STATUSES = new Set(["fulfilled", "completed", "cancelled", "rejected", "closed"]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  return new Date(parsed).toLocaleDateString();
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

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [estimateRes, orderRes, submissionRes, profileRes] = await Promise.all([
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
  ]);

  const estimates = (estimateRes.data || []) as EstimateRow[];
  const orders = (orderRes.data || []) as OrderRow[];
  const submissions = (submissionRes.data || []) as PackagingSubmissionRow[];
  const profiles = (profileRes.data || []) as ProfileRow[];

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
      label: "Draft estimates awaiting conversion",
      count: draftEstimates.length,
      href: "/admin",
      tone: "neutral",
    },
  ] as const;

  const hasEstimateError = Boolean(estimateRes.error);
  const hasOrderError = Boolean(orderRes.error);
  const hasSubmissionError = Boolean(submissionRes.error);
  const hasProfileError = Boolean(profileRes.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Operational control panel for estimates, packaging review, onboarding, and order progression."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      {(hasEstimateError || hasOrderError || hasSubmissionError || hasProfileError) ? (
        <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-4 py-3 text-sm text-[#991b1b]">
          Some dashboard data is unavailable right now. Refresh after backend sync.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Panel
            title="Action Items"
            description="Queues that need attention now."
            href="/admin/packaging/submissions"
            hrefLabel="Open review queues"
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
