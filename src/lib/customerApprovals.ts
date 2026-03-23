import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { isApprovedCustomerApprovalStatus, isFollowUpCustomerApprovalStatus, normalizeCustomerApprovalStatus } from "@/lib/customerApproval";

export type CustomerApprovalQueueItem = {
  customerId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  approvalStatus: string;
  submittedAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  assignedRepName: string | null;
  assignedRepEmail: string | null;
  readyState: "docs_linked" | "missing_docs";
  readyLabel: string;
  documentCount: number;
  linkedDocuments: Array<{
    id: string;
    title: string;
    documentType: string;
    href: string | null;
    createdAt: string | null;
  }>;
  reviewHref: string;
  accountHref: string;
};

export type CustomerApprovalQueueStats = {
  totalCustomers: number;
  rawPending: number;
  rawApproved: number;
  rawFollowUp: number;
  candidateCount: number;
  queueCount: number;
};

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function buildApprovalQueueItem(customer: CustomerSummary): CustomerApprovalQueueItem {
  const documentCount = customer.counts.documents;
  const readyState = documentCount > 0 ? "docs_linked" : "missing_docs";
  const readyLabel = documentCount > 0 ? `${documentCount} linked doc${documentCount === 1 ? "" : "s"}` : "No linked docs yet";
  const accountHref = `/workspace/customers/${customer.id}`;
  const linkedDocuments = customer.linkedDocuments.slice(0, 3).map((document) => {
    const directHref = firstText(document.file_url, document.public_url, document.url);

    return {
      id: document.id,
      title: firstText(document.title, document.file_name, document.name) || `Document ${document.id.slice(0, 8)}`,
      documentType: firstText(document.document_type, document.kind) || "Document",
      href: directHref,
      createdAt: document.updatedAt || document.createdAt,
    };
  });

  return {
    customerId: customer.id,
    companyName: customer.name,
    contactName: firstText(
      customer.primaryContacts[0]?.name,
      customer.memberUsers[0]?.fullName,
    ),
    contactEmail: firstText(
      customer.primaryContacts[0]?.email,
      customer.memberUsers[0]?.email,
      customer.primaryContactEmail,
    ),
    approvalStatus: customer.approvalStatus,
    submittedAt: firstText(customer.updatedAt, customer.createdAt),
    ownerName: customer.assignedSalesName,
    ownerEmail: customer.assignedSalesEmail,
    assignedRepName: customer.assignedRouteRepName,
    assignedRepEmail: customer.assignedRouteRepEmail,
    readyState,
    readyLabel,
    documentCount,
    linkedDocuments,
    reviewHref: documentCount > 0 ? `${accountHref}#customer-documents` : accountHref,
    accountHref,
  };
}

export function isCustomerApprovalCandidate(customer: CustomerSummary): boolean {
  if (customer.archivedAt) return false;
  if (customer.counts.documents > 0) return true;
  return isFollowUpCustomerApprovalStatus(customer.approvalStatus);
}

export function summarizeCustomerApprovalQueue(rows: Array<{ approvalStatus: string }>) {
  return rows.reduce(
    (counts, row) => {
      const status = normalizeCustomerApprovalStatus(row.approvalStatus);
      if (isFollowUpCustomerApprovalStatus(status)) {
        counts.followUp += 1;
      } else {
        counts.pending += 1;
      }
      return counts;
    },
    { pending: 0, followUp: 0 },
  );
}

export async function loadCustomerApprovalQueue(): Promise<CustomerApprovalQueueItem[]> {
  const { customers } = await loadCustomerWorkspaceIndex();
  const rawPending = customers.filter((customer) => normalizeCustomerApprovalStatus(customer.approvalStatus) === "pending").length;
  const rawApproved = customers.filter((customer) => isApprovedCustomerApprovalStatus(customer.approvalStatus)).length;
  const rawFollowUp = customers.filter((customer) => isFollowUpCustomerApprovalStatus(customer.approvalStatus)).length;
  const approvalCandidates = customers.filter(isCustomerApprovalCandidate);
  const queue = approvalCandidates
    .filter((customer) => !isApprovedCustomerApprovalStatus(customer.approvalStatus))
    .map(buildApprovalQueueItem)
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.submittedAt || ""));
      const rightTime = Date.parse(String(right.submittedAt || ""));
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });

  console.log("[customerApprovals] queue_metrics", {
    total_customers_loaded: customers.length,
    raw_pending_by_approval_status: rawPending,
    raw_approved_by_approval_status: rawApproved,
    raw_follow_up_by_approval_status: rawFollowUp,
    approval_candidates_after_filter: approvalCandidates.length,
    queue_items_returned: queue.length,
  } satisfies Record<string, number>);

  return queue;
}
