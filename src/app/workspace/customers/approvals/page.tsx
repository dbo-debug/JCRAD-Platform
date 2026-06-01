import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { QueueMetaCard, QueueMetricCard, QueuePurposePanel, QueueStatusChip } from "@/components/admin/ops/QueuePrimitives";
import CustomerApprovalActions from "@/components/workspace/CustomerApprovalActions";
import { loadCustomerApprovalQueue, type CustomerApprovalQueueItem } from "@/lib/customerApprovals";
import { isFollowUpCustomerApprovalStatus, normalizeCustomerApprovalStatus } from "@/lib/customerApproval";
import { requireAdmin } from "@/lib/requireAdmin";

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

function ApprovalCard({ item }: { item: CustomerApprovalQueueItem }) {
  return (
    <article className="rounded-2xl border border-[#eadff1] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7891a0]">Approval Blocker</p>
            <h2 className="text-lg font-semibold text-[#173543]">{item.companyName}</h2>
            <p className="text-sm text-[#4a6575]">
              {item.contactName || "No contact mapped"}
              {item.contactEmail ? ` • ${item.contactEmail}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QueueStatusChip label={formatStatusLabel(item.approvalStatus)} tone={statusTone(item.approvalStatus)} />
            <QueueStatusChip label={item.readyLabel} tone={item.readyState === "docs_linked" ? "ok" : "neutral"} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CustomerApprovalActions customerId={item.customerId} approvalStatus={item.approvalStatus} />
          <Link
            href={item.reviewHref}
            className="inline-flex rounded-full bg-[#8f52dc] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Review Approval Blockers
          </Link>
          <Link
            href={item.accountHref}
            className="inline-flex rounded-full border border-[#cfdce4] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
          >
            Open Account
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#e2edf2] bg-[#fdf8fd] px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">Why It Is Here</p>
        <p className="mt-1 text-sm text-[#2f4a59]">
          {item.readyState === "missing_docs"
            ? "This account is still blocked on linked onboarding documents before approval can move forward."
            : isFollowUpCustomerApprovalStatus(item.approvalStatus)
              ? "This account needs admin follow-up before approval can be cleared and handed back to the account workflow."
              : "This account has approval materials linked and is waiting on the admin decision that unblocks progression."}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QueueMetaCard label="Approval Status" value={formatStatusLabel(item.approvalStatus)} />
        <QueueMetaCard label="Submitted" value={formatDate(item.submittedAt)} />
        <QueueMetaCard label="Owner" value={item.ownerName || "Unassigned"} helper={item.ownerEmail || undefined} />
        <QueueMetaCard label="Assigned Rep" value={item.assignedRepName || "Unassigned"} helper={item.assignedRepEmail || undefined} />
      </div>

      <div className="mt-4 rounded-xl border border-[#e2edf2] bg-[#fdf8fd] px-3 py-3">
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
                <Link key={doc.id} href={doc.href} target="_blank" className="rounded-xl border border-[#eadff1] bg-white px-3 py-2.5 transition hover:border-[#8f52dc]">
                  {content}
                </Link>
              ) : (
                <div key={doc.id} className="rounded-xl border border-[#eadff1] bg-white px-3 py-2.5">
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

export default async function WorkspaceCustomerApprovalsPage() {
  await requireAdmin();
  const queue = await loadCustomerApprovalQueue();
  const docsLinkedCount = queue.filter((item) => item.readyState === "docs_linked").length;
  const followUpCount = queue.filter((item) => isFollowUpCustomerApprovalStatus(item.approvalStatus)).length;

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Customer Approval Queue"
        description="Operational onboarding review queue for accounts that are waiting on admin approval, missing documents, or follow-up before they can progress."
        action={
          <Link
            href="/admin"
            className="inline-flex rounded-full border border-[#ddcfe8] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
          >
            Back to Command Center
          </Link>
        }
      />

      <QueuePurposePanel>
        <p>
          Use this queue to clear onboarding blockers, confirm linked documents, and hand the account back into the operating workflow once approval is ready.
        </p>
      </QueuePurposePanel>

      <section className="grid gap-4 sm:grid-cols-3">
        <QueueMetricCard label="Pending Customer Approvals" value={queue.length} />
        <QueueMetricCard label="With Linked Docs" value={docsLinkedCount} />
        <QueueMetricCard label="Needs Follow-Up" value={followUpCount} />
      </section>

      <section className="space-y-3">
        {queue.map((item) => (
          <ApprovalCard key={item.customerId} item={item} />
        ))}
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e5d8ef] bg-[#fdf8fd] px-6 py-10 text-center text-sm text-[#5b7382]">
            No customers are currently waiting for onboarding approval.
          </div>
        ) : null}
      </section>
    </div>
  );
}
