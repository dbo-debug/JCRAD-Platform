"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function buildBatchStatusMessage(json: Record<string, unknown>, mode: "default" | "retry_failed") {
  const reasonCounts = (json.reason_counts && typeof json.reason_counts === "object" ? json.reason_counts : {}) as Record<string, unknown>;
  const sampleErrors = Array.isArray(json.sample_errors) ? json.sample_errors.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3) : [];
  const detailBits = [
    Number(json.needs_review || 0) > 0 ? `needs review ${Number(json.needs_review || 0)}` : null,
    Number(reasonCounts.unsupported_provider || 0) > 0 ? `unsupported provider ${Number(reasonCounts.unsupported_provider || 0)}` : null,
    Number(reasonCounts.transport_failed || 0) > 0 ? `transport ${Number(reasonCounts.transport_failed || 0)}` : null,
    Number(reasonCounts.no_match || 0) > 0 ? `no match ${Number(reasonCounts.no_match || 0)}` : null,
    Number(reasonCounts.multiple_matches || 0) > 0 ? `multiple matches ${Number(reasonCounts.multiple_matches || 0)}` : null,
    Number(reasonCounts.invalid_coordinates || 0) > 0 ? `invalid coords ${Number(reasonCounts.invalid_coordinates || 0)}` : null,
  ].filter(Boolean);

  return `${
    mode === "retry_failed" ? "Retried failed records" : "Processed next unprocessed records"
  }: attempted ${Number(json.attempted || 0)} • geocoded ${Number(json.geocoded || 0)} • needs review ${Number(json.needs_review || 0)} • failed ${Number(
    json.failed || 0
  )} • missing ${Number(json.missing_address || 0)}${
    detailBits.length > 0 ? ` • ${detailBits.join(" • ")}` : ""
  }${sampleErrors.length > 0 ? ` • sample: ${sampleErrors.join(" | ")}` : ""}`;
}

export default function CustomerGeocodeBatchButton() {
  const router = useRouter();
  const [busyMode, setBusyMode] = useState<"default" | "retry_failed" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function runBatch(mode: "default" | "retry_failed") {
    setBusyMode(mode);
    setStatus(null);

    try {
      const res = await fetch("/api/admin/customers/geocode-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, mode }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Batch geocode failed (${res.status})`));

      setStatus(buildBatchStatusMessage(json, mode));
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Batch geocode failed");
    } finally {
      setBusyMode(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void runBatch("default")}
        disabled={busyMode !== null}
        className="inline-flex rounded-full border border-[#b9d5df] bg-white px-4 py-2 text-sm font-semibold text-[#21414d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
      >
        {busyMode === "default" ? "Geocoding..." : "Geocode Next 20"}
      </button>
      <button
        type="button"
        onClick={() => void runBatch("retry_failed")}
        disabled={busyMode !== null}
        className="inline-flex rounded-full border border-[#b9d5df] bg-white px-4 py-2 text-sm font-semibold text-[#21414d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
      >
        {busyMode === "retry_failed" ? "Retrying..." : "Retry Failed 20"}
      </button>
      {status ? <p className="text-xs text-[#5b7382]">{status}</p> : null}
    </div>
  );
}
