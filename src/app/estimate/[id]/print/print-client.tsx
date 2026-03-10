"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import EstimateLineCard from "@/components/estimate/EstimateLineCard";
import EstimatePrintStyles from "@/components/estimate/EstimatePrintStyles";
import Money from "@/components/estimate/Money";
import type { EstimateLine, EstimatePayload } from "@/components/estimate/types";

type EstimatePrintClientProps = {
  estimateId: string;
};

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

function normalizePackagingCategory(value: unknown): "vape" | "flower" | "pre_roll" | "concentrate" | "" {
  const raw = String(value || "").trim().toLowerCase().replace("-", "_");
  if (raw === "vape" || raw === "flower" || raw === "pre_roll" || raw === "concentrate") return raw;
  return "";
}

export default function EstimatePrintClient({ estimateId }: EstimatePrintClientProps) {
  const router = useRouter();
  const [resolvedEstimateId, setResolvedEstimateId] = useState(String(estimateId || "").trim());
  const [estimate, setEstimate] = useState<EstimatePayload | null>(null);
  const [lines, setLines] = useState<EstimateLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [missingId, setMissingId] = useState(false);

  const quoteDate = useMemo(() => {
    const source = estimate?.created_at || new Date().toISOString();
    const dt = new Date(source);
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }, [estimate?.created_at]);
  const preferredPackagingCategory = useMemo(() => {
    for (const line of lines) {
      if (String((line as any)?.packaging_mode || "").toLowerCase() !== "customer") continue;
      if (String((line as any)?.pre_roll_mode || "").trim()) return "pre_roll";
      const category = normalizePackagingCategory((line as any)?.offers?.products?.category);
      if (category) return category;
    }
    return "";
  }, [lines]);

  useEffect(() => {
    const idFromParams = String(estimateId || "").trim();
    if (idFromParams) {
      setResolvedEstimateId(idFromParams);
      setMissingId(false);
      return;
    }
    if (typeof window === "undefined") return;
    const stored = String(window.localStorage.getItem("jc_estimate_id") || "").trim();
    if (stored) {
      setResolvedEstimateId(stored);
      router.replace(`/estimate/${encodeURIComponent(stored)}/print`);
      return;
    }
    setResolvedEstimateId("");
    setMissingId(true);
    setBusy(false);
  }, [estimateId, router]);

  useEffect(() => {
    if (!resolvedEstimateId) return;
    let active = true;
    const run = async () => {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/estimate/get?id=${encodeURIComponent(resolvedEstimateId)}`);
      const json = (await parseJsonSafe(res)) as EstimateGetResponse;
      if (!active) return;
      if (!res.ok) {
        setError(json.error || `Load failed (${res.status})`);
        setBusy(false);
        return;
      }
      setEstimate(json.estimate || null);
      setLines(json.lines || []);
      setBusy(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, [resolvedEstimateId]);

  if (missingId) {
    return (
      <div className="estimate-page mx-auto max-w-3xl space-y-3 bg-white p-4">
        <div className="rounded-2xl border border-[#dbe6ed] bg-white p-5 text-center shadow-[0_16px_24px_-24px_rgba(16,24,40,0.45)]">
          <h1 className="text-xl font-semibold tracking-tight text-[#1a3240]">No estimate selected</h1>
          <p className="mt-1 text-sm text-[#607988]">Open an estimate from the menu first, then print to PDF.</p>
          <div className="mt-3">
            <Link href="/menu" className="inline-flex rounded-full bg-[#14b8a6] px-3 py-1.5 text-xs font-semibold text-white">
              Back to Menu
            </Link>
          </div>
        </div>
        <EstimatePrintStyles />
      </div>
    );
  }

  return (
    <div className="estimate-page mx-auto max-w-5xl space-y-3 bg-white p-3 md:p-4">
      <header className="estimate-break-avoid rounded-2xl border border-[#dbe6ed] bg-white p-4 shadow-[0_16px_24px_-24px_rgba(16,24,40,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/BLACK.png" alt="JC RAD" className="h-14 w-14 rounded-xl border border-[#dbe6ed] bg-white p-2" />
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5b7382]">Estimate Print View</div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1a3240]">JC RAD Estimate</h1>
              <div className="text-xs text-[#607988]">Estimate ID: {resolvedEstimateId}</div>
              <div className="text-xs text-[#607988]">
                Date: {quoteDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-[#14b8a6] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Print / Save as PDF
            </button>
            <Link href="/estimate" className="rounded-full border border-[#d2dfe7] px-3 py-1.5 text-xs font-semibold text-[#274555]">
              Back to Estimate
            </Link>
          </div>
        </div>
      </header>

      <div className="estimate-break-avoid rounded-2xl border border-[#e2ebf0] bg-[repeating-linear-gradient(135deg,#ffffff_0px,#ffffff_18px,#f6f9fb_18px,#f6f9fb_36px)] px-3 py-2">
        <div className="rounded-full border border-[#d4e3e3] bg-[#eef7f6] px-3 py-1 text-center text-[10px] font-medium tracking-[0.08em] text-[#0f766e]">
          ESTIMATE BREAKDOWN
        </div>
      </div>

      {busy ? <div className="text-xs text-[#607988]">Loading estimate…</div> : null}
      {error ? <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-3 py-1.5 text-xs text-[#991b1b]">{error}</div> : null}
      {estimate?.packaging_review_pending ? (
        <div className="rounded-xl border border-[#f2d58f] bg-[#fff8e7] px-3 py-1.5 text-xs font-medium text-[#9a6a15]">
          <p>Customer-supplied packaging selected. Packaging costs excluded. Packaging awaiting compliance review.</p>
          <Link
            href={
              preferredPackagingCategory
                ? `/dashboard/packaging?category=${encodeURIComponent(preferredPackagingCategory)}&returnTo=${encodeURIComponent(`/estimate/${resolvedEstimateId}/print`)}`
                : `/dashboard/packaging?returnTo=${encodeURIComponent(`/estimate/${resolvedEstimateId}/print`)}`
            }
            className="no-print mt-1 inline-flex text-xs font-semibold underline underline-offset-2"
          >
            Upload packaging files
          </Link>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <section className="space-y-2.5">
          {lines.map((line, index) => {
            const lineKey = String(line?.id || `line-${index}`);
            return <EstimateLineCard key={lineKey} lineKey={lineKey} line={line} expanded />;
          })}
        </section>
      ) : null}

      {estimate ? (
        <footer className="estimate-summary estimate-break-avoid ml-auto w-full max-w-[420px] rounded-2xl border border-[#dbe6ed] bg-white p-3 shadow-[0_16px_24px_-24px_rgba(16,24,40,0.45)]">
          <div className="space-y-1.5 text-xs text-[#4e6777] [font-variant-numeric:tabular-nums]">
            <div className="flex items-center justify-between"><span>Subtotal</span><Money value={estimate.subtotal} className="font-semibold text-[#1f3746]" /></div>
            <div className="flex items-center justify-between"><span>Adjustments</span><Money value={estimate.adjustments} className="font-semibold text-[#1f3746]" /></div>
            <div className="flex items-center justify-between border-t border-[#dbe6ed] pt-1.5 text-sm text-[#153346]"><span className="font-semibold">Total</span><Money value={estimate.total} className="text-base font-bold" /></div>
          </div>
        </footer>
      ) : null}

      <EstimatePrintStyles />
    </div>
  );
}
