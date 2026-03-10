"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

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
};

export default function PackagingSubmissionsAdminClient() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rows, setRows] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/admin/packaging/submissions?status=${encodeURIComponent(statusFilter)}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Load failed (${res.status})`);
      setBusy(false);
      return;
    }

    setRows(json.submissions || []);
    setBusy(false);
  }

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
    void refresh();
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Packaging Submissions"
        description="Review customer packaging artwork and approve/reject for estimate/order readiness."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
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
        <strong className="text-[#173543]">{row.customer_name || "Unnamed"}</strong>
        <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", statusClass].join(" ")}>
          {statusLabel}
        </span>
      </div>
      <div className="text-xs text-[#5b7382]">{row.customer_email} | {row.customer_phone || "No phone"}</div>
      <div className="text-sm text-[#2f4a59]">Category: {row.category || "-"}</div>
      <div className="text-sm text-[#2f4a59]">Estimate: {row.estimate_id || "-"}</div>
      <div className="text-sm text-[#2f4a59]">Notes: {row.notes || "-"}</div>

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

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="review notes"
        rows={2}
        className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onReview(row.id, "approved", notes)}
          className="rounded-full bg-[#14b8a6] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-95"
        >
          Approve
        </button>
        <button
          onClick={() => onReview(row.id, "rejected", notes)}
          className="rounded-full border border-[#f0c8c8] bg-[#fff4f4] px-4 py-2 text-xs font-semibold text-[#991b1b] transition hover:bg-[#ffecec]"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
