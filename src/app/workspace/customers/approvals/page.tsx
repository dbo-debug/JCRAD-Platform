import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerApprovalActions from "@/components/workspace/CustomerApprovalActions";
import { loadCustomerApprovalQueue, type CustomerApprovalQueueItem } from "@/lib/customerApprovals";
import { isFollowUpCustomerApprovalStatus, normalizeCustomerApprovalStatus } from "@/lib/customerApproval";
import { requireStaff } from "@/lib/requireStaff";

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

function formatStatusLabel(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "Pending";
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusTone(value: string): "warn" | "bad" | "neutral" {
  const status = normalizeCustomerApprovalStatus(value);
  if (status === "rejected" || status === "needs_review" || status === "follow_up") return "bad";
  return "warn";
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "warn" | "bad" | "neutral" | "ok";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "bad"
        ? "border-[#f3d2d2] bg-[#fff4f4] text-[#991b1b]"
        : tone === "warn"
          ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
          : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";
  return <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}>{label}</span>;
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}

function ApprovalCard({ item }: { item: CustomerApprovalQueueItem }) {
  return (
    <article className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold text-[#173543]">{item.companyName}</h2>
            <p className="text-sm text-[#4a6575]">
              {item.contactName || "No contact mapped"}
              {item.contactEmail ? ` • ${item.contactEmail}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip label={formatStatusLabel(item.approvalStatus)} tone={statusTone(item.approvalStatus)} />
            <StatusChip label={item.readyLabel} tone={item.readyState === "docs_linked" ? "ok" : "neutral"} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CustomerApprovalActions customerId={item.customerId} approvalStatus={item.approvalStatus} />
          <Link
            href={item.reviewHref}
            className="inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Review Onboarding Docs
          </Link>
          <Link
            href={item.accountHref}
            className="inline-flex rounded-full border border-[#cfdce4] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Open Account
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QueueMeta label="Approval Status" value={formatStatusLabel(item.approvalStatus)} />
        <QueueMeta label="Submitted" value={formatDate(item.submittedAt)} />
        <QueueMeta label="Owner" value={item.ownerName || "Unassigned"} helper={item.ownerEmail || undefined} />
        <QueueMeta label="Assigned Rep" value={item.assignedRepName || "Unassigned"} helper={item.assignedRepEmail || undefined} />
      </div>

      <div className="mt-4 rounded-xl border border-[#e2edf2] bg-[#f9fcfd] px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">Linked Docs</p>
        {item.linkedDocuments.length > 0 ? (
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {item.linkedDocuments.map((doc) => {
              const content = (
                <>
                  <p className="text-sm font-semibold text-[#173543]">{doc.title}</p>
                  <p className="mt-1 text-xs text-[#5b7382]">
                    {doc.documentType} • {formatDate(doc.createdAt)}
                  </p>
                </>
              );

              return doc.href ? (
                <Link key={doc.id} href={doc.href} target="_blank" className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5 transition hover:border-[#14b8a6]">
                  {content}
                </Link>
              ) : (
                <div key={doc.id} className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5">
                  {content}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#5b7382]">No linked docs yet.</p>
        )}
      </div>
    </article>
  );
}

function QueueMeta({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-[#e2edf2] bg-[#f9fcfd] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#173543]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[#5b7382]">{helper}</p> : null}
    </div>
  );
}

export default async function WorkspaceCustomerApprovalsPage() {
  await requireStaff();
  const queue = await loadCustomerApprovalQueue();
  const docsLinkedCount = queue.filter((item) => item.readyState === "docs_linked").length;
  const followUpCount = queue.filter((item) => isFollowUpCustomerApprovalStatus(item.approvalStatus)).length;

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Customer Approvals"
        description="Dedicated onboarding approval queue using customer approval status and linked account documents."
        action={
          <Link
            href="/admin"
            className="inline-flex rounded-full border border-[#cfdde5] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Back to Command Center
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <QueueMetric label="Pending Customer Approvals" value={queue.length} />
        <QueueMetric label="With Linked Docs" value={docsLinkedCount} />
        <QueueMetric label="Needs Follow-Up" value={followUpCount} />
      </section>

      <section className="space-y-3">
        {queue.map((item) => (
          <ApprovalCard key={item.customerId} item={item} />
        ))}
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d7e6ed] bg-[#f9fcfd] px-6 py-10 text-center text-sm text-[#5b7382]">
            No customers are currently waiting for onboarding approval.
          </div>
        ) : null}
      </section>
    </div>
  );
}
