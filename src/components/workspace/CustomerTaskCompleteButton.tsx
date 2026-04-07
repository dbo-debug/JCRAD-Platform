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
  const [busy, setBusy] = useState(false);

  async function handleComplete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/customers/${encodeURIComponent(customerId)}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          status: "completed",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json.error || `Complete failed (${res.status})`));
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to complete task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleComplete()}
      disabled={busy}
      className="rounded-full border border-[#bde8e4] bg-[#effcf9] px-3 py-1.5 text-sm font-semibold text-[#0f766e] transition hover:border-[#14b8a6] hover:text-[#0c6f66] disabled:opacity-60"
    >
      {busy ? "Completing..." : "Complete"}
    </button>
  );
}
