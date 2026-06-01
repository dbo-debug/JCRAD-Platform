"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CustomerTaskCompleteButton({
  customerId,
  taskId,
}: {
  customerId: string;
  taskId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleComplete(completionNote?: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/customers/${encodeURIComponent(customerId)}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          status: "completed",
          completion_note: completionNote || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json.error || `Complete failed (${res.status})`));
      }
      setExpanded(false);
      setNote("");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to complete task.");
    } finally {
      setBusy(false);
    }
  }

  if (expanded) {
    return (
      <div className="w-full rounded-2xl border border-[#eadff1] bg-[#fdf8fd] p-3">
        <p className="text-sm font-semibold text-[#173543]">Complete task</p>
        <p className="mt-1 text-xs text-[#5d7685]">Add a short outcome note if you want it captured in the account timeline.</p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Spoke with Tony, asked me to send pricing"
          className="mt-3 w-full rounded-lg border border-[#ddcfe9] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
        />
        {error ? <p className="mt-2 text-sm text-[#991b1b]">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleComplete(note)}
            disabled={busy || !note.trim()}
            className="rounded-full border border-[#e8d7f7] bg-[#fcf5ff] px-3 py-1.5 text-sm font-semibold text-[#6f32b5] transition hover:border-[#8f52dc] hover:text-[#0c6f66] disabled:opacity-60"
          >
            {busy ? "Completing..." : "Complete & Save Note"}
          </button>
          <button
            type="button"
            onClick={() => void handleComplete(null)}
            disabled={busy}
            className="rounded-full border border-[#decfe8] bg-white px-3 py-1.5 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5] disabled:opacity-60"
          >
            Complete Without Note
          </button>
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setNote("");
              setError(null);
            }}
            disabled={busy}
            className="rounded-full border border-[#decfe8] bg-white px-3 py-1.5 text-sm font-semibold text-[#5d7685] transition hover:border-[#c3d5df] hover:text-[#24404d] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setExpanded(true);
        setError(null);
      }}
      disabled={busy}
      className="rounded-full border border-[#e8d7f7] bg-[#fcf5ff] px-3 py-1.5 text-sm font-semibold text-[#6f32b5] transition hover:border-[#8f52dc] hover:text-[#0c6f66] disabled:opacity-60"
    >
      Complete
    </button>
  );
}
