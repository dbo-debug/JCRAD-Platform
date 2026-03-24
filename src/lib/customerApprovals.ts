import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { isApprovedCustomerApprovalStatus, isFollowUpCustomerApprovalStatus, normalizeCustomerApprovalStatus } from "@/lib/customerApproval";
import { isPublicStorageBucket } from "@/lib/storageBuckets";

const APPROVAL_DOCUMENT_TYPES = new Set([
  "cannabis_license",
  "license",
  "sellers_permit",
  "seller_permit",
  "w9",
  "irs_form_8300",
  "8300",
]);

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

async function resolveDocumentHref(
  admin: ReturnType<typeof createAdminClient>,
  document: Record<string, unknown>
): Promise<string | null> {
  const bucket = firstText(document.bucket);
  const objectPath = firstText(document.object_path);
  if (bucket && objectPath) {
    if (isPublicStorageBucket(bucket)) {
      const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
      return String(data?.publicUrl || "").trim() || null;
    }

    const { data, error } = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 60 * 24);
    if (!error) {
      return String(data?.signedUrl || "").trim() || null;
    }
  }

  return firstText(document.file_url, document.public_url, document.url);
}

function isApprovalDocument(document: Record<string, unknown>): boolean {
  const type = String(document.document_type || document.kind || "").trim().toLowerCase();
  return APPROVAL_DOCUMENT_TYPES.has(type);
}

function getApprovalDocuments(customer: CustomerSummary) {
  return customer.linkedDocuments.filter((document) => isApprovalDocument(document as Record<string, unknown>));
}

async function buildApprovalQueueItem(
  admin: ReturnType<typeof createAdminClient>,
  customer: CustomerSummary
): Promise<CustomerApprovalQueueItem> {
  const approvalDocuments = getApprovalDocuments(customer);
  const documentCount = approvalDocuments.length;
  const readyState = documentCount > 0 ? "docs_linked" : "missing_docs";
  const readyLabel = documentCount > 0 ? `${documentCount} linked doc${documentCount === 1 ? "" : "s"}` : "No linked docs yet";
  const accountHref = `/workspace/customers/${customer.id}`;
  const linkedDocuments = await Promise.all(approvalDocuments.slice(0, 3).map(async (document) => {
    const directHref = await resolveDocumentHref(admin, document as Record<string, unknown>);

    return {
      id: document.id,
      title: firstText(document.title, document.file_name, document.name) || `Document ${document.id.slice(0, 8)}`,
      documentType: firstText(document.document_type, document.kind) || "Document",
      href: directHref,
      createdAt: document.updatedAt || document.createdAt,
    };
  }));

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
  if (isApprovedCustomerApprovalStatus(customer.approvalStatus)) return false;
  return getApprovalDocuments(customer).length > 0;
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
  const admin = createAdminClient();
  const { customers } = await loadCustomerWorkspaceIndex();
  const rawPending = customers.filter((customer) => normalizeCustomerApprovalStatus(customer.approvalStatus) === "pending").length;
  const rawApproved = customers.filter((customer) => isApprovedCustomerApprovalStatus(customer.approvalStatus)).length;
  const rawFollowUp = customers.filter((customer) => isFollowUpCustomerApprovalStatus(customer.approvalStatus)).length;
  const approvalCandidates = customers.filter(isCustomerApprovalCandidate);
  const queue = approvalCandidates
    .filter((customer) => !isApprovedCustomerApprovalStatus(customer.approvalStatus));
  const items = await Promise.all(queue.map((customer) => buildApprovalQueueItem(admin, customer)));
  const sortedItems = items.sort((left, right) => {
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
    queue_items_returned: items.length,
  } satisfies Record<string, number>);

  return sortedItems;
}
