import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { QueueMetaCard, QueueMetricCard, QueuePurposePanel, QueueStatusChip } from "@/components/admin/ops/QueuePrimitives";
import { loadOrderQueue } from "@/lib/ordersQueue";
import { requireAdmin } from "@/lib/requireAdmin";

function normalizeStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function formatStatus(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "Pending";
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

function formatMoney(value: number | null): string {
  if (!Number.isFinite(Number(value))) return "Pending total";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function statusTone(status: string): "warn" | "ok" | "neutral" {
  const normalized = normalizeStatus(status);
  if (normalized === "confirmed" || normalized === "submitted") return "warn";
  if (normalized === "approved" || normalized === "production") return "ok";
  return "neutral";
}

export default async function AdminOrdersPage() {
  await requireAdmin();
  const { rows, warning } = await loadOrderQueue();
  const openOrders = rows.filter((row) => {
    const status = normalizeStatus(row.status);
    return status !== "approved" && status !== "production" && status !== "completed";
  });
  const readyForOps = rows.filter((row) => {
    const status = normalizeStatus(row.status);
    return status === "approved" || status === "production";
  });

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Order Progress Queue"
        description="Business-ops queue for order requests that need progression, approval visibility, or handoff back into the linked account workflow."
      />

      <QueuePurposePanel>
        <p>
          Orders here are not just records. They represent customer work waiting on internal progression, approval visibility, or the next operational handoff.
        </p>
      </QueuePurposePanel>

      {warning ? (
        <div className="rounded-xl border border-[#f1ddad] bg-[#fff9eb] px-4 py-3 text-sm text-[#8a5a08]">
          {warning}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <QueueMetricCard label="Open Order Requests" value={openOrders.length} />
        <QueueMetricCard label="Ready For Ops" value={readyForOps.length} />
        <QueueMetricCard label="Total Recent Orders" value={rows.length} />
      </section>

      <section className="space-y-3">
        {rows.map((row) => {
          const linkedCustomerId = row.customer_account_id || row.customer_id;
          const accountHref = linkedCustomerId ? `/workspace/customers/${encodeURIComponent(linkedCustomerId)}` : null;
          const estimateHref = row.estimate_id ? `/estimate/${encodeURIComponent(row.estimate_id)}/print` : null;
          const isOpen = openOrders.some((entry) => entry.id === row.id);

          return (
            <article key={row.id} className="rounded-2xl border border-[#eadff1] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7891a0]">
                      {isOpen ? "Order Needs Progression" : "Operational Order Record"}
                    </p>
                    <h2 className="text-lg font-semibold text-[#173543]">{row.customer_name || row.customer_email || "Order"}</h2>
                    <p className="text-sm text-[#4a6575]">Order #{row.id.slice(0, 8)} • Created {formatDate(row.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <QueueStatusChip label={formatStatus(row.status)} tone={statusTone(row.status || "")} />
                    {row.estimate_id ? <QueueStatusChip label={`Estimate ${row.estimate_id.slice(0, 8)}`} tone="neutral" /> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {accountHref ? (
                    <Link href={accountHref} className="inline-flex rounded-full bg-[#8f52dc] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95">
                      Open Account
                    </Link>
                  ) : null}
                  {estimateHref ? (
                    <Link href={estimateHref} className="inline-flex rounded-full border border-[#cfdce4] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5]">
                      Open Estimate Context
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[#e2edf2] bg-[#fdf8fd] px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">Why It Is Here</p>
                <p className="mt-1 text-sm text-[#2f4a59]">
                  {isOpen
                    ? "This order is still waiting on internal progression. Review the linked account and estimate context to determine the next business action."
                    : "This order has already moved deeper into ops, but it still belongs to the same customer workflow and may need account-side coordination."}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <QueueMetaCard label="Customer" value={row.customer_name || row.customer_email || "Unknown"} />
                <QueueMetaCard label="Status" value={formatStatus(row.status)} />
                <QueueMetaCard label="Total" value={formatMoney(row.total)} />
                <QueueMetaCard label="Estimate Link" value={row.estimate_id ? `#${row.estimate_id.slice(0, 8)}` : "Not linked"} />
              </div>
            </article>
          );
        })}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e5d8ef] bg-[#fdf8fd] px-6 py-10 text-center text-sm text-[#5b7382]">
            No recent orders are waiting in the queue.
          </div>
        ) : null}
      </section>
    </div>
  );
}
