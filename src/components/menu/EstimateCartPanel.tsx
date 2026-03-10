import Link from "next/link";
import { type EstimateCartLine } from "@/components/menu/types";

type EstimateCartPanelProps = {
  lines: EstimateCartLine[];
  total: number;
  onRemoveLine: (lineId: string) => Promise<void>;
  removingLineId?: string | null;
  onSendEstimatePdf: () => void;
  onRequestOrder: () => void;
  requestOrderLocked: boolean;
  requestOrderLockReason?: string;
  complianceIncomplete: boolean;
  complianceHref: string;
  hasCustomerPackaging: boolean;
  packagingReviewPending: boolean;
  packagingUploadHref: string;
};

function asMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shouldShowExpectedRange(line: EstimateCartLine): boolean {
  if (line.mode === "bulk") return false;
  if (!line.expectedRangeLabel) return false;
  const text = `${String(line.title || "")} ${String(line.notes || "")}`.toLowerCase();
  if (!String(line.offerId || "").trim()) return false;
  if (/heat\s*shrink/.test(text)) return false;
  return true;
}

export default function EstimateCartPanel({
  lines,
  total,
  onRemoveLine,
  removingLineId,
  onSendEstimatePdf,
  onRequestOrder,
  requestOrderLocked,
  requestOrderLockReason,
  complianceIncomplete,
  complianceHref,
  hasCustomerPackaging,
  packagingReviewPending,
  packagingUploadHref,
}: EstimateCartPanelProps) {
  function modeSummary(line: EstimateCartLine): string {
    const modeLabel = line.mode === "pre_roll" ? "Pre-roll" : line.mode === "copack" ? "Copack" : "Bulk";
    const parts = [modeLabel];
    if ((line.mode === "copack" || line.mode === "pre_roll") && line.units && line.unitSize) {
      parts.push(`${line.units} units @ ${line.unitSize}`);
    }
    if (line.packagingMode) {
      parts.push(`Packaging: ${line.packagingMode === "customer" ? "Customer" : "JC RAD"}`);
    }
    return parts.join("; ");
  }

  return (
    <aside className="space-y-4 rounded-2xl border border-[#dce6eb] bg-white p-4 shadow-[0_16px_30px_-24px_rgba(16,24,40,0.45)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2d4452]">Estimate Cart</h2>
        <span className="rounded-full border border-[#d4e0e8] px-2 py-0.5 text-xs text-[#577184]">{lines.length}</span>
      </div>

      <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
        {lines.length === 0 ? (
          <p className="text-sm text-[#657f8f]">No line items yet. Add products from the catalog.</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="rounded-xl border border-[#dbe6ed] bg-[#fbfdfe] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-[#223640]">{line.title}</div>
                <button
                  type="button"
                  onClick={() => void onRemoveLine(line.id)}
                  disabled={removingLineId === line.id}
                  className="rounded-full border border-[#d9c5c5] px-2 py-0.5 text-[11px] font-semibold text-[#8a2c2c] transition hover:border-[#8a2c2c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removingLineId === line.id ? "Removing..." : "Remove"}
                </button>
              </div>
              <div className="mt-1 text-xs text-[#6a8392]">
                {line.quantityLabel}
              </div>
              <div className="mt-1 text-xs text-[#6a8392]">
                {modeSummary(line)}
              </div>
              {line.startingWeightLabel ? (
                <div className="mt-1 text-xs text-[#6a8392]">{line.startingWeightLabel}</div>
              ) : null}
              {shouldShowExpectedRange(line) ? (
                <div className="mt-1 text-xs text-[#6a8392]">{line.expectedRangeLabel}</div>
              ) : null}
              {(line.mode === "copack" || line.mode === "pre_roll") ? (
                <div className="mt-1 text-xs text-[#6a8392]">Stickers: 3 per finished unit (auto-included)</div>
              ) : null}
              <div className="mt-1 text-xs text-[#365160]">
                {line.lineTotal == null ? "Pricing pending" : asMoney(line.lineTotal)}
              </div>
              {String(line.notes || "").includes("Packaging Review Pending") || line.packagingSubmissionId ? (
                <div className="mt-1 inline-flex rounded-full border border-[#f2d58f] bg-[#fff8e7] px-2 py-0.5 text-[11px] font-medium text-[#9a6a15]">
                  Customer packaging line
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {hasCustomerPackaging && packagingReviewPending ? (
        <div className="rounded-xl border border-[#f2d58f] bg-[#fff8e7] px-3 py-2 text-xs font-medium text-[#9a6a15]">
          <p>Customer-supplied packaging selected. Packaging costs excluded. Packaging awaiting compliance review.</p>
          <Link href={packagingUploadHref} className="mt-1 inline-flex text-xs font-semibold underline underline-offset-2">
            Upload packaging files
          </Link>
        </div>
      ) : null}
      {hasCustomerPackaging && !packagingReviewPending ? (
        <div className="rounded-xl border border-[#cde9e6] bg-[#eefaf8] px-3 py-2 text-xs font-medium text-[#0f766e]">
          <p>Customer packaging is approved for required categories.</p>
          <Link href={packagingUploadHref} className="mt-1 inline-flex text-xs font-semibold underline underline-offset-2">
            Manage packaging submission
          </Link>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#dce6ec] bg-[#f7fcfb] p-3">
        <div className="flex items-center justify-between text-sm text-[#4f6877]">
          <span>Total estimate</span>
          <strong className="text-base text-[#134e4a]">{asMoney(total)}</strong>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onSendEstimatePdf}
          disabled={lines.length === 0}
          className="w-full rounded-full bg-[#14b8a6] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send Estimate PDF
        </button>
        <button
          type="button"
          onClick={onRequestOrder}
          title={requestOrderLocked ? requestOrderLockReason || "Complete compliance first." : undefined}
          disabled={requestOrderLocked || lines.length === 0}
          className="w-full rounded-full border border-[#cfdce4] px-3 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Request Order
        </button>
      </div>

      {complianceIncomplete ? (
        <div className="rounded-xl border border-[#fde7bb] bg-[#fff9ed] p-3 text-sm text-[#9a6a15]">
          <p className="font-medium">To place an order we need: License, 8300, W9, Seller&apos;s Permit</p>
          <Link href={complianceHref} className="mt-2 inline-flex text-xs font-semibold underline">
            Complete Compliance
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
