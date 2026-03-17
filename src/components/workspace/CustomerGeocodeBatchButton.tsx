"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function CustomerGeocodeBatchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function runBatch() {
    setBusy(true);
    setStatus(null);

    try {
      const res = await fetch("/api/admin/customers/geocode-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Batch geocode failed (${res.status})`));

      setStatus(
        `Attempted ${Number(json.attempted || 0)} • geocoded ${Number(json.geocoded || 0)} • failed ${Number(json.failed || 0)} • missing ${Number(
          json.missing_address || 0
        )}`
      );
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Batch geocode failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void runBatch()}
        disabled={busy}
        className="inline-flex rounded-full border border-[#b9d5df] bg-white px-4 py-2 text-sm font-semibold text-[#21414d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
      >
        {busy ? "Geocoding..." : "Batch Geocode Missing Coords"}
      </button>
      {status ? <p className="text-xs text-[#5b7382]">{status}</p> : null}
    </div>
  );
}
