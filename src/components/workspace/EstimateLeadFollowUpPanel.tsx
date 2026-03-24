import Link from "next/link";
import { resolveEstimateCustomerFromFields } from "@/lib/estimate/customer";
import { createAdminClient } from "@/lib/supabase/admin";

type EstimateRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_account_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  packaging_review_pending: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type EstimateLeadFollowUpPanelProps = {
  title?: string;
  description?: string;
  limit?: number;
};

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

export default async function EstimateLeadFollowUpPanel({
  title = "Recent Estimates",
  description = "Latest estimate activity with direct account and lead follow-up.",
  limit = 6,
}: EstimateLeadFollowUpPanelProps) {
  const supabase = createAdminClient();
  const estimateRes = await supabase
    .from("estimates")
    .select("id, status, total, customer_account_id, customer_name, customer_email, packaging_review_pending, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (estimateRes.error) {
    throw new Error(estimateRes.error.message);
  }

  const recentEstimates = await Promise.all(
    ((estimateRes.data || []) as EstimateRow[]).map(async (row) => ({
      ...row,
      resolvedCustomer: await resolveEstimateCustomerFromFields(supabase, {
        customerAccountId: row.customer_account_id,
        customerEmail: row.customer_email,
        customerName: row.customer_name,
      }).catch(() => null),
    }))
  );

  return (
    <section className="rounded-[24px] border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Estimate Follow-Up</p>
          <h2 className="mt-1 text-lg font-semibold text-[#173543]">{title}</h2>
          <p className="mt-1 text-sm text-[#5b7382]">{description}</p>
        </div>
        <Link
          href="/estimate"
          className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
        >
          Open Estimator
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {recentEstimates.length === 0 ? (
          <p className="text-sm text-[#5b7382]">No estimates yet.</p>
        ) : (
          recentEstimates.map((row) => {
            const status = normalizeStatus(row.status) || "draft";
            const hasResolvedCustomer = Boolean(row.resolvedCustomer?.customerId);
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dbe9ef] bg-[#fbfdfe] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-semibold text-[#173543]">
                    {String(row.customer_name || row.customer_email || "Estimate")} • #{row.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-[#5b7382]">
                    {formatDate(row.updated_at || row.created_at)} • {formatMoney(row.total)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  <form action="/api/workspace/estimates/follow-up" method="POST">
                    <input type="hidden" name="estimate_id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-[#c7ddd7] bg-[#effcf9] px-2 py-1 text-xs font-semibold text-[#0f766e] hover:border-[#14b8a6]"
                    >
                      {hasResolvedCustomer ? "Open Account" : "Create Lead"}
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
