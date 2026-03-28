"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { QueueMetaCard, QueuePurposePanel } from "@/components/admin/ops/QueuePrimitives";
type Submission = {
  id: string;
  estimate_id: string | null;
  category: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  status: string;
  review_notes: string | null;
  front_image_url: string | null;
  back_image_url: string | null;
  created_at: string;
  estimate_href: string | null;
  account_href: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

export default function PackagingSubmissionsAdminClient() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rows, setRows] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSubmissions(filter: string) {
    const res = await fetch(`/api/admin/packaging/submissions?status=${encodeURIComponent(filter)}`);
    const json = await res.json().catch(() => ({}));

    return { ok: res.ok, status: res.status, json };
  }

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);

    const { ok, status, json } = await loadSubmissions(statusFilter);

    if (!ok) {
      setError(json?.error || `Load failed (${status})`);
      setBusy(false);
      return;
    }

    setRows(json.submissions || []);
    setBusy(false);
  }, [statusFilter]);

  async function review(id: string, status: "approved" | "rejected", review_notes: string) {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/packaging/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, review_notes }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Update failed (${res.status})`);
      setBusy(false);
      return;
    }

    await refresh();
    setBusy(false);
  }

  useEffect(() => {
    let active = true;

    void loadSubmissions(statusFilter).then(({ ok, status, json }) => {
      if (!active) return;

      if (!ok) {
        setError(json?.error || `Load failed (${status})`);
        setRows([]);
        setBusy(false);
        return;
      }

      setError(null);
      setRows(json.submissions || []);
      setBusy(false);
    });

    return () => {
      active = false;
    };
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Packaging Review Queue"
        description="Review customer-supplied packaging that blocks estimate conversion and order progression until compliance is resolved."
      />

      <QueuePurposePanel>
        <p>
          Each submission here is operational packaging review work. Approve when the packaging is ready to unblock estimate and order progression, or reject with clear notes so the next fix is obvious.
        </p>
      </QueuePurposePanel>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setBusy(true);
            setStatusFilter(e.target.value);
          }}
          className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="all">all</option>
        </select>
        <button
          onClick={refresh}
          disabled={busy}
          className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-3 py-2 text-sm text-[#991b1b]">{error}</div>
      ) : null}

      <div className="grid gap-3">
        {rows.map((r) => (
          <SubmissionRow key={r.id} row={r} onReview={review} />
        ))}
        {rows.length === 0 && !busy ? (
          <div className="rounded-2xl border border-dashed border-[#d7e6ed] bg-[#f9fcfd] px-6 py-10 text-center text-sm text-[#5b7382]">
            No packaging review items match this queue state.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubmissionRow({ row, onReview }: { row: Submission; onReview: (id: string, status: "approved" | "rejected", notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(row.review_notes || "");
  const statusLabel = String(row.status || "pending").toLowerCase();
  const statusClass = statusLabel === "approved"
    ? "bg-[#eefaf8] text-[#0f766e] border-[#cde9e6]"
    : statusLabel === "rejected"
      ? "bg-[#fff4f4] text-[#991b1b] border-[#f3d2d2]"
      : "bg-[#fff9ed] text-[#8a5a08] border-[#f2ddba]";

  return (
    <div className="grid gap-2 rounded-xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7891a0]">Packaging Blocker</p>
          <strong className="text-[#173543]">{row.customer_name || "Unnamed"}</strong>
        </div>
        <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", statusClass].join(" ")}>
          {statusLabel}
        </span>
      </div>
      <div className="text-xs text-[#5b7382]">{row.customer_email} | {row.customer_phone || "No phone"} | Submitted {formatDate(row.created_at)}</div>
      <div className="rounded-xl border border-[#e2edf2] bg-[#f9fcfd] px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">Why This Matters</p>
        <p className="mt-1 text-sm text-[#2f4a59]">
          {statusLabel === "pending"
            ? "This packaging submission is still waiting on admin review and can block estimate-to-order progression."
            : statusLabel === "rejected"
              ? "This packaging work needs a clear correction path before the customer can move forward."
              : "This packaging review has been cleared and should no longer block readiness."}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <QueueMetaCard label="Category" value={row.category || "-"} />
        <QueueMetaCard label="Estimate" value={row.estimate_id || "-"} />
        <QueueMetaCard label="Submission Notes" value={row.notes || "-"} />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {row.front_image_url ? (
          <a href={row.front_image_url} target="_blank" rel="noreferrer" className="text-[#0f766e] underline underline-offset-4">
            Front Image
          </a>
        ) : null}
        {row.back_image_url ? (
          <a href={row.back_image_url} target="_blank" rel="noreferrer" className="text-[#0f766e] underline underline-offset-4">
            Back Image
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {row.account_href ? (
          <Link href={row.account_href} className="rounded-full border border-[#cfdce4] px-3 py-1.5 text-xs font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]">
            Open Account
          </Link>
        ) : null}
        {row.estimate_href ? (
          <Link href={row.estimate_href} className="rounded-full border border-[#cfdce4] px-3 py-1.5 text-xs font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]">
            Open Estimate
          </Link>
        ) : null}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Explain the approval or the exact fix needed next."
        rows={2}
        className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onReview(row.id, "approved", notes)}
          className="rounded-full bg-[#14b8a6] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-95"
        >
          Approve And Unblock
        </button>
        <button
          onClick={() => onReview(row.id, "rejected", notes)}
          className="rounded-full border border-[#f0c8c8] bg-[#fff4f4] px-4 py-2 text-xs font-semibold text-[#991b1b] transition hover:bg-[#ffecec]"
        >
          Reject With Fix Notes
        </button>
      </div>
    </div>
  );
}
