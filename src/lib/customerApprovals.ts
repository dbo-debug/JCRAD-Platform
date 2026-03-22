import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { isApprovedCustomerApprovalStatus, isFollowUpCustomerApprovalStatus } from "@/lib/customerApproval";

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
  reviewHref: string;
  accountHref: string;
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
    reviewHref: documentCount > 0 ? `${accountHref}#customer-documents` : accountHref,
    accountHref,
  };
}

export function isCustomerApprovalCandidate(customer: CustomerSummary): boolean {
  if (customer.archivedAt) return false;
  if (customer.counts.documents > 0) return true;
  if (customer.counts.orders > 0) return true;
  if (customer.memberUsers.length > 0) return true;
  if (isApprovedCustomerApprovalStatus(customer.approvalStatus)) return true;
  if (isFollowUpCustomerApprovalStatus(customer.approvalStatus)) return true;
  return false;
}

export async function loadCustomerApprovalQueue(): Promise<CustomerApprovalQueueItem[]> {
  const { customers } = await loadCustomerWorkspaceIndex();

  return customers
    .filter(isCustomerApprovalCandidate)
    .filter((customer) => !isApprovedCustomerApprovalStatus(customer.approvalStatus))
    .map(buildApprovalQueueItem)
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.submittedAt || ""));
      const rightTime = Date.parse(String(right.submittedAt || ""));
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
}
