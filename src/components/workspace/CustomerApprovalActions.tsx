"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CustomerApprovalActionsProps = {
  customerId: string;
  approvalStatus: string;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

const ACTIONS = [
  { value: "approved", label: "Approve" },
  { value: "needs_review", label: "Needs Review" },
  { value: "follow_up", label: "Follow Up" },
  { value: "rejected", label: "Reject" },
  { value: "pending", label: "Reset Pending" },
] as const;

export default function CustomerApprovalActions({ customerId, approvalStatus }: CustomerApprovalActionsProps) {
  const router = useRouter();
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateApprovalStatus(nextStatus: string) {
    if (!customerId || nextStatus === approvalStatus) return;
    setBusyStatus(nextStatus);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/customers/${encodeURIComponent(customerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status: nextStatus }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        setError(String(json.error || `Approval update failed (${res.status})`));
        setBusyStatus(null);
        return;
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approval update failed");
      setBusyStatus(null);
      return;
    }
    setBusyStatus(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const selected = action.value === approvalStatus;
          const busy = busyStatus === action.value;
          return (
            <button
              key={action.value}
              type="button"
              onClick={() => void updateApprovalStatus(action.value)}
              disabled={Boolean(busyStatus) || selected}
              className={[
                "inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                selected
                  ? "border-[#14b8a6] bg-[#e9fbf9] text-[#0f766e]"
                  : "border-[#cfdce4] text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]",
                (Boolean(busyStatus) || selected) ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              {busy ? "Saving..." : action.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-[#991b1b]">{error}</p> : null}
    </div>
  );
}
