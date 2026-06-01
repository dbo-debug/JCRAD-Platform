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

function statusTone(value: string, packagingPending: boolean): string {
  if (packagingPending) return "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]";
  if (value === "converted") return "border-[#e8d7f7] bg-[#fcf3ff] text-[#6f32b5]";
  return "border-[#e5d8ef] bg-[#fcf7fd] text-[#4f6877]";
}

export default async function EstimateLeadFollowUpPanel({
  title = "Estimate Follow-Up Queue",
  description = "Latest estimate activity with direct account handoff and blocker visibility for packaging-related progression work.",
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
    <section className="rounded-[24px] border border-[#eadff1] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Estimate Follow-Up</p>
          <h2 className="mt-1 text-lg font-semibold text-[#173543]">{title}</h2>
          <p className="mt-1 text-sm text-[#5b7382]">{description}</p>
        </div>
        <Link
          href="/estimate"
          className="rounded-full border border-[#decfe8] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
        >
          Open Estimate Workspace
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
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#eadff1] bg-[#fffafd] px-3 py-3 text-sm"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7891a0]">
                    {row.packaging_review_pending ? "Estimate Blocked By Packaging" : "Estimate Needs Follow-Up"}
                  </p>
                  <p className="font-semibold text-[#173543]">
                    {String(row.customer_name || row.customer_email || "Estimate")} • #{row.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-[#5b7382]">
                    {formatDate(row.updated_at || row.created_at)} • {formatMoney(row.total)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={["rounded-full border px-2 py-0.5 text-xs font-semibold", statusTone(status, Boolean(row.packaging_review_pending))].join(" ")}>
                    {status}
                  </span>
                  {row.packaging_review_pending ? (
                    <Link
                      href="/admin/packaging/submissions"
                      className="rounded-full border border-[#f1ddad] bg-[#fff9eb] px-2 py-0.5 text-xs font-semibold text-[#8a5a08] transition hover:border-[#d4b366]"
                    >
                      Packaging blocker
                    </Link>
                  ) : null}
                  {hasResolvedCustomer ? (
                    <Link
                      href={`/workspace/customers/${encodeURIComponent(row.resolvedCustomer!.customerId)}`}
                      className="rounded-full border border-[#cfdce4] px-2 py-1 text-xs font-semibold text-[#294452] hover:border-[#8f52dc] hover:text-[#6f32b5]"
                    >
                      Open account
                    </Link>
                  ) : null}
                  <Link
                    href={`/estimate/${encodeURIComponent(row.id)}/print`}
                    className="rounded-full border border-[#cfdce4] px-2 py-1 text-xs font-semibold text-[#294452] hover:border-[#8f52dc] hover:text-[#6f32b5]"
                  >
                    Open estimate
                  </Link>
                  <form action="/api/workspace/estimates/follow-up" method="POST">
                    <input type="hidden" name="estimate_id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-[#c7ddd7] bg-[#fcf5ff] px-2 py-1 text-xs font-semibold text-[#6f32b5] hover:border-[#8f52dc]"
                    >
                      {hasResolvedCustomer ? "Refresh account follow-up" : "Create lead and follow-up"}
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
