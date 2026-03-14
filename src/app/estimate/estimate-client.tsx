"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EstimateLineCard from "@/components/estimate/EstimateLineCard";
import EstimatePrintStyles from "@/components/estimate/EstimatePrintStyles";
import Money from "@/components/estimate/Money";
import type { EstimateLine, EstimatePayload } from "@/components/estimate/types";

const ESTIMATE_KEY = "jc_estimate_id";

function getEstimateId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ESTIMATE_KEY) || "";
}

function normalizePackagingCategory(value: unknown): "vape" | "flower" | "pre_roll" | "concentrate" | "" {
  const raw = String(value || "").trim().toLowerCase().replace("-", "_");
  if (raw === "vape" || raw === "flower" || raw === "pre_roll" || raw === "concentrate") return raw;
  return "";
}

async function parseJsonSafe(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

type EstimateGetResponse = {
  error?: string;
  estimate?: EstimatePayload | null;
  lines?: EstimateLine[];
};

type ConfirmOrderResponse = {
  error?: string;
  order_id?: string;
};

export default function EstimateClient() {
  const [estimateId, setEstimateId] = useState("");
  const [estimate, setEstimate] = useState<EstimatePayload | null>(null);
  const [lines, setLines] = useState<EstimateLine[]>([]);
  const [expandedByLineKey, setExpandedByLineKey] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const quoteDate = useMemo(() => {
    const source = estimate?.created_at || new Date().toISOString();
    const dt = new Date(source);
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }, [estimate?.created_at]);
  const safeEstimateId = String(estimateId || "").trim();
  const packagingReviewBlocked = Boolean(estimate?.packaging_review_pending);
  const preferredPackagingCategory = useMemo(() => {
    for (const line of lines) {
      if (String((line as any)?.packaging_mode || "").toLowerCase() !== "customer") continue;
      if (String((line as any)?.pre_roll_mode || "").trim()) return "pre_roll";
      const category = normalizePackagingCategory((line as any)?.offers?.products?.category);
      if (category) return category;
    }
    return "";
  }, [lines]);

  function buildLineKey(line: EstimateLine, index: number): string {
    return String(line?.id || `line-${index}`);
  }

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimate/get?id=${encodeURIComponent(id)}`);
      const json = (await parseJsonSafe(res)) as EstimateGetResponse;
      if (!res.ok) {
        setError(json.error || `Load failed (${res.status})`);
        setBusy(false);
        return;
      }
      const nextLines = json.lines || [];
      setEstimate(json.estimate || null);
      setLines(nextLines);
      const expandByDefault = nextLines.length <= 1;
      const nextExpanded: Record<string, boolean> = {};
      nextLines.forEach((line, index) => {
        nextExpanded[buildLineKey(line, index)] = expandByDefault;
      });
      setExpandedByLineKey(nextExpanded);
      setBusy(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
      setBusy(false);
    }
  }, []);

  async function confirmOrder() {
    if (!safeEstimateId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/order/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimate_id: safeEstimateId }),
    });
    const json = (await parseJsonSafe(res)) as ConfirmOrderResponse;
    if (!res.ok) {
      setError(json.error || `Request failed (${res.status}). Admin login may be required.`);
      setBusy(false);
      return;
    }
    setOrderId(String(json.order_id || "") || null);
    setBusy(false);
  }

  async function removeLine(lineId: string) {
    if (!safeEstimateId || !lineId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/estimate/remove-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimate_id: safeEstimateId, line_id: lineId }),
    });
    const json = (await parseJsonSafe(res)) as { error?: string };
    if (!res.ok) {
      setError(json.error || `Remove failed (${res.status})`);
      setBusy(false);
      return;
    }
    await load(safeEstimateId);
    setBusy(false);
  }

  useEffect(() => {
    const id = String(getEstimateId() || "").trim();
    setEstimateId(id);
    if (id) void load(id);
  }, [load]);

  if (!safeEstimateId) {
    return (
      <div className="estimate-page mx-auto max-w-6xl space-y-3 rounded-2xl border border-[#dbe5ec] bg-white p-4 shadow-[0_20px_32px_-28px_rgba(16,24,40,0.55)]">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a3240]">JC RAD Estimate</h1>
        <p className="text-sm text-[#607988]">No active estimate found. Add a line from the menu first.</p>
        <Link href="/menu" className="inline-flex rounded-full border border-[#d2dfe7] px-3 py-1.5 text-xs font-semibold text-[#274555]">
          Go to Menu
        </Link>
        <EstimatePrintStyles />
      </div>
    );
  }

  if (orderId) {
    return (
      <div className="estimate-page mx-auto max-w-6xl space-y-3 rounded-2xl border border-[#dbe5ec] bg-white p-4 shadow-[0_20px_32px_-28px_rgba(16,24,40,0.55)]">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a3240]">JC RAD Estimate</h1>
        <p className="text-sm text-[#607988]">Order request submitted.</p>
        <p className="text-sm text-[#1a3240]">Order ID: <strong>{orderId}</strong></p>
        <div className="no-print flex flex-wrap gap-2">
          <Link
            href={`/estimate/${encodeURIComponent(safeEstimateId)}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#14b8a6] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Print / Save as PDF
          </Link>
          <Link href="/menu" className="rounded-full border border-[#d2dfe7] px-3 py-1.5 text-xs font-semibold text-[#274555]">
            Back to Menu
          </Link>
        </div>
        <EstimatePrintStyles />
      </div>
    );
  }

  return (
    <div className="estimate-page mx-auto max-w-6xl space-y-3 rounded-2xl border border-[#dbe5ec] bg-white p-3.5 shadow-[0_20px_32px_-28px_rgba(16,24,40,0.55)] md:p-4">
      <header className="rounded-2xl border border-[#dce7ee] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfc_100%)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/BLACK.png" alt="JC RAD" className="h-16 w-16 rounded-xl border border-[#dbe6ed] bg-white p-2" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5b7382]">Estimate</div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1a3240]">JC RAD Estimate</h1>
              <div className="text-xs text-[#607988]">Estimate ID: {safeEstimateId}</div>
              <div className="text-xs text-[#607988]">
                Date: {quoteDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Link
              href={`/estimate/${encodeURIComponent(safeEstimateId)}/print`}
              className="rounded-full bg-[#14b8a6] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95"
            >
              Send Estimate PDF
            </Link>
            <button
              onClick={() => load(safeEstimateId)}
              disabled={busy}
              className="rounded-full border border-[#d2dfe7] px-3 py-1.5 text-xs font-semibold text-[#274555] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-[#e2ebf0] bg-[repeating-linear-gradient(135deg,#ffffff_0px,#ffffff_18px,#f6f9fb_18px,#f6f9fb_36px)] px-3 py-2 shadow-[0_14px_30px_-26px_rgba(16,24,40,0.4)]">
        <div className="rounded-full border border-[#d4e3e3] bg-[#eef7f6] px-3 py-1 text-center text-[10px] font-medium tracking-[0.08em] text-[#0f766e]">
          WHOLESALE ESTIMATE • BULK + COPACK • COMPLIANCE-FIRST
        </div>
      </div>

      {estimate?.packaging_review_pending ? (
        <div className="rounded-xl border border-[#f2d58f] bg-[#fff8e7] px-3 py-1.5 text-xs font-medium text-[#9a6a15]">
          <p>Customer-supplied packaging selected. Packaging costs excluded. Packaging awaiting compliance review.</p>
          <Link
            href={
              preferredPackagingCategory
                ? `/dashboard/packaging?category=${encodeURIComponent(preferredPackagingCategory)}&returnTo=%2Festimate`
                : "/dashboard/packaging?returnTo=%2Festimate"
            }
            className="mt-1 inline-flex text-xs font-semibold underline underline-offset-2"
          >
            Upload packaging files
          </Link>
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-3 py-1.5 text-xs text-[#991b1b]">{error}</div> : null}

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d5e2ea] bg-[#fbfdfe] p-6 text-center text-sm text-[#607988]">
          No line items yet.
        </div>
      ) : (
        <section className="space-y-2.5">
          {lines.map((line, index) => {
            const lineKey = buildLineKey(line, index);
            const expanded = expandedByLineKey[lineKey] ?? lines.length <= 1;
            return (
              <EstimateLineCard
                key={lineKey}
                lineKey={lineKey}
                line={line}
                expanded={expanded}
                onToggle={() =>
                  setExpandedByLineKey((prev) => ({
                    ...prev,
                    [lineKey]: !expanded,
                  }))
                }
                busy={busy}
                onRemove={(lineId) => void removeLine(lineId)}
              />
            );
          })}
        </section>
      )}

      <footer className="estimate-summary ml-auto w-full max-w-[420px] rounded-2xl border border-[#dbe6ed] bg-white p-3 shadow-[0_16px_24px_-24px_rgba(16,24,40,0.5)]">
        <div className="space-y-1.5 text-xs text-[#4e6777] [font-variant-numeric:tabular-nums]">
          <div className="flex items-center justify-between"><span>Subtotal</span><Money value={estimate?.subtotal} className="font-semibold text-[#1f3746]" /></div>
          <div className="flex items-center justify-between"><span>Adjustments</span><Money value={estimate?.adjustments} className="font-semibold text-[#1f3746]" /></div>
          <div className="flex items-center justify-between border-t border-[#dbe6ed] pt-1.5 text-sm text-[#153346]"><span className="font-semibold">Total</span><Money value={estimate?.total} className="text-base font-bold" /></div>
        </div>
        <div className="no-print mt-3 flex flex-wrap gap-2">
          <button
            onClick={confirmOrder}
            disabled={busy || lines.length === 0 || packagingReviewBlocked}
            title={packagingReviewBlocked ? "Packaging approval is required before requesting an order." : undefined}
            className="rounded-full border border-[#cfdce4] px-3 py-1.5 text-xs font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? "Working..." : "Request Order"}
          </button>
          <Link href="/menu" className="rounded-full border border-[#d2dfe7] px-3 py-1.5 text-xs font-semibold text-[#274555]">
            Menu
          </Link>
        </div>
      </footer>

      <EstimatePrintStyles />
    </div>
  );
}
