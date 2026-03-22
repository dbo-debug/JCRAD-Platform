const APPROVED_CUSTOMER_APPROVAL_STATUSES = new Set(["approved"]);
const FOLLOW_UP_CUSTOMER_APPROVAL_STATUSES = new Set(["needs_review", "follow_up", "rejected"]);
const ALLOWED_CUSTOMER_APPROVAL_STATUSES = new Set(["pending", "approved", "needs_review", "follow_up", "rejected"]);

export function normalizeCustomerApprovalStatus(value: unknown): string {
  const status = String(value || "").trim().toLowerCase();
  return ALLOWED_CUSTOMER_APPROVAL_STATUSES.has(status) ? status : "pending";
}

export function isApprovedCustomerApprovalStatus(value: unknown): boolean {
  return APPROVED_CUSTOMER_APPROVAL_STATUSES.has(normalizeCustomerApprovalStatus(value));
}

export function isFollowUpCustomerApprovalStatus(value: unknown): boolean {
  return FOLLOW_UP_CUSTOMER_APPROVAL_STATUSES.has(normalizeCustomerApprovalStatus(value));
}
