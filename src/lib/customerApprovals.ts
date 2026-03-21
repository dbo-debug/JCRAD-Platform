import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";

type GenericRow = Record<string, unknown>;
type AuthUser = {
  id: string;
  email: string | null;
};

type ApprovalCandidateProfile = {
  id: string;
  email: string | null;
  companyName: string | null;
  role: string;
  verificationStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
};

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

const APPROVED_VERIFICATION_STATUSES = new Set(["approved", "verified"]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function deriveVerificationStatus(profile: GenericRow): string {
  const explicit = normalizeStatus(profile.verification_status);
  if (explicit) return explicit;
  if (profile.verified === true || profile.is_verified === true) return "verified";
  return "unverified";
}

function profileDisplayName(profile: ApprovalCandidateProfile): string | null {
  return firstText(profile.companyName, profile.email);
}

function isCustomerProfile(profile: ApprovalCandidateProfile): boolean {
  return !profile.role || profile.role === "customer";
}

function statusPriority(status: string): number {
  if (status === "rejected" || status === "failed") return 0;
  if (status === "needs_review" || status === "follow_up") return 1;
  if (status === "pending" || status === "submitted") return 2;
  if (status === "unverified") return 3;
  if (APPROVED_VERIFICATION_STATUSES.has(status)) return 9;
  return 4;
}

function choosePrimaryPendingProfile(profiles: ApprovalCandidateProfile[]): ApprovalCandidateProfile | null {
  const pending = profiles.filter((profile) => !APPROVED_VERIFICATION_STATUSES.has(profile.verificationStatus));
  if (pending.length === 0) return null;
  return [...pending].sort((left, right) => {
    const priorityDelta = statusPriority(left.verificationStatus) - statusPriority(right.verificationStatus);
    if (priorityDelta !== 0) return priorityDelta;

    const leftUpdated = Date.parse(String(left.updatedAt || left.createdAt || ""));
    const rightUpdated = Date.parse(String(right.updatedAt || right.createdAt || ""));
    return (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0);
  })[0] || null;
}

async function listAuthUsers(supabase: ReturnType<typeof createAdminClient>): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const chunk = (data?.users || []).map((user: { id?: string; email?: string | null }) => ({
      id: String(user.id || ""),
      email: firstText(user.email),
    }));
    users.push(...chunk);
    if (chunk.length < perPage) break;
    page += 1;
  }

  return users;
}

export async function loadCustomerApprovalQueue(): Promise<CustomerApprovalQueueItem[]> {
  const supabase = createAdminClient();
  const [{ customers }, authUsers, profilesRes] = await Promise.all([
    loadCustomerWorkspaceIndex(),
    listAuthUsers(supabase),
    supabase.from("profiles").select("id, role, company_name, verification_status, verified, is_verified, created_at, updated_at").limit(5000),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const authEmailById = new Map(authUsers.map((user) => [user.id, normalizeStatus(user.email)] as const));
  const profiles = ((profilesRes.data || []) as GenericRow[])
    .map((profile): ApprovalCandidateProfile => ({
      id: String(profile.id || "").trim(),
      email: firstText(authEmailById.get(String(profile.id || "").trim())),
      companyName: firstText(profile.company_name),
      role: normalizeStatus(profile.role),
      verificationStatus: deriveVerificationStatus(profile),
      createdAt: firstText(profile.created_at),
      updatedAt: firstText(profile.updated_at),
    }))
    .filter((profile) => Boolean(profile.id))
    .filter(isCustomerProfile);

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const profilesByEmail = new Map<string, ApprovalCandidateProfile[]>();
  for (const profile of profiles) {
    const email = normalizeStatus(profile.email);
    if (!email) continue;
    const existing = profilesByEmail.get(email) || [];
    existing.push(profile);
    profilesByEmail.set(email, existing);
  }

  const queue = customers
    .filter((customer) => !customer.archivedAt)
    .map((customer) => buildApprovalQueueItem(customer, profilesById, profilesByEmail))
    .filter((item): item is CustomerApprovalQueueItem => item !== null)
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.submittedAt || ""));
      const rightTime = Date.parse(String(right.submittedAt || ""));
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });

  return queue;
}

function buildApprovalQueueItem(
  customer: CustomerSummary,
  profilesById: Map<string, ApprovalCandidateProfile>,
  profilesByEmail: Map<string, ApprovalCandidateProfile[]>,
): CustomerApprovalQueueItem | null {
  const candidateProfiles = new Map<string, ApprovalCandidateProfile>();

  for (const member of customer.memberUsers) {
    const profile = profilesById.get(member.userId);
    if (profile) candidateProfiles.set(profile.id, profile);
  }

  const candidateEmails = [
    customer.primaryContactEmail,
    ...customer.primaryContacts.map((contact) => contact.email),
    ...customer.memberUsers.map((member) => member.email),
  ];

  for (const email of candidateEmails) {
    const matches = profilesByEmail.get(normalizeStatus(email)) || [];
    for (const profile of matches) candidateProfiles.set(profile.id, profile);
  }

  const matchedProfiles = Array.from(candidateProfiles.values());
  const primaryPendingProfile = choosePrimaryPendingProfile(matchedProfiles);
  if (!primaryPendingProfile) return null;

  const contactName =
    firstText(
      customer.primaryContacts[0]?.name,
      profileDisplayName(primaryPendingProfile),
      customer.memberUsers[0]?.fullName,
    );
  const contactEmail =
    firstText(
      customer.primaryContacts[0]?.email,
      primaryPendingProfile.email,
      customer.memberUsers[0]?.email,
      customer.primaryContactEmail,
    );
  const submittedAt = firstText(
    primaryPendingProfile.updatedAt,
    primaryPendingProfile.createdAt,
    customer.updatedAt,
    customer.createdAt,
  );
  const documentCount = customer.counts.documents;
  const readyState = documentCount > 0 ? "docs_linked" : "missing_docs";
  const readyLabel = documentCount > 0 ? `${documentCount} linked doc${documentCount === 1 ? "" : "s"}` : "No linked docs yet";
  const accountHref = `/workspace/customers/${customer.id}`;

  return {
    customerId: customer.id,
    companyName: customer.name,
    contactName,
    contactEmail,
    approvalStatus: primaryPendingProfile.verificationStatus,
    submittedAt,
    ownerName: customer.assignedSalesName,
    ownerEmail: customer.assignedSalesEmail,
    assignedRepName: customer.assignedRouteRepName,
    assignedRepEmail: customer.assignedRouteRepEmail,
    readyState,
    readyLabel,
    documentCount,
    reviewHref: `${accountHref}#customer-documents`,
    accountHref,
  };
}
