import { normalizeCustomerApprovalStatus } from "@/lib/customerApproval";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type GenericProfile = Record<string, unknown> | null;
type GenericRow = Record<string, unknown>;

export type UserProfileResult = {
  user: Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"] | null;
  profile: GenericProfile;
  verificationStatus: string;
};

function deriveVerificationStatus(profile: GenericProfile): string {
  return normalizeCustomerApprovalStatus(profile?.approval_status);
}

async function loadCustomerApprovalStatus(userId: string, email: string | null): Promise<string> {
  const admin = createAdminClient();
  const membershipRes = await admin
    .from("customer_users")
    .select("customer_id, is_primary")
    .eq("user_id", userId);

  if (membershipRes.error) {
    throw new Error(membershipRes.error.message);
  }

  const membershipIds = (membershipRes.data || [])
    .map((row: GenericRow) => String(row.customer_id || "").trim())
    .filter(Boolean);

  const normalizedEmail = String(email || "").trim().toLowerCase();
  let fallbackIds: string[] = [];

  if (normalizedEmail) {
    const [customerRes, contactRes] = await Promise.all([
      admin.from("customers").select("id").ilike("primary_contact_email", normalizedEmail),
      admin.from("customer_contacts").select("customer_id").ilike("email", normalizedEmail),
    ]);

    if (customerRes.error) throw new Error(customerRes.error.message);
    if (contactRes.error) throw new Error(contactRes.error.message);

    fallbackIds = [
      ...(customerRes.data || []).map((row: GenericRow) => String(row.id || "").trim()),
      ...(contactRes.data || []).map((row: GenericRow) => String(row.customer_id || "").trim()),
    ].filter(Boolean);
  }

  const customerIds = Array.from(new Set([...membershipIds, ...fallbackIds]));
  if (customerIds.length === 0) return "pending";

  const { data, error } = await admin
    .from("customers")
    .select("id, approval_status, archived_at, record_kind")
    .in("id", customerIds);

  if (error) throw new Error(error.message);

  const customers = ((data || []) as Array<Record<string, unknown>>).filter((row) => {
    const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
    return (!recordKind || recordKind === "customer") && !row.archived_at;
  });
  if (customers.length === 0) return "pending";

  const membershipCustomer = customers.find((row) => membershipIds.includes(String(row.id || "").trim()));
  return normalizeCustomerApprovalStatus((membershipCustomer || customers[0])?.approval_status);
}

export async function getUserAndProfile(): Promise<UserProfileResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (!user) {
    return { user: null, profile: null, verificationStatus: "unverified" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let approvalStatus = "pending";
  try {
    approvalStatus = await loadCustomerApprovalStatus(user.id, user.email || null);
  } catch {
    approvalStatus = "pending";
  }

  return {
    user,
    profile: (profile as GenericProfile) ?? null,
    verificationStatus: deriveVerificationStatus({
      ...(profile as GenericProfile || {}),
      approval_status: approvalStatus,
    }),
  };
}
