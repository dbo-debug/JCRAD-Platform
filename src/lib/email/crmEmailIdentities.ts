import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailConnectionStatus } from "@/lib/email/gmail";

export type CrmEmailIdentity = {
  id: string;
  email: string;
  displayName: string | null;
  useForCommunications: boolean;
  useForAutomations: boolean;
  provider: "gmail";
  gmailConnectionId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type IdentityRow = {
  id: string;
  email: string;
  display_name: string | null;
  use_for_communications: boolean;
  use_for_automations: boolean;
  provider: "gmail";
  gmail_connection_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

const IDENTITY_COLUMNS = [
  "id",
  "email",
  "display_name",
  "use_for_communications",
  "use_for_automations",
  "provider",
  "gmail_connection_id",
  "verified_at",
  "created_at",
  "updated_at",
].join(", ");

function toIdentity(row: IdentityRow): CrmEmailIdentity {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    useForCommunications: row.use_for_communications,
    useForAutomations: row.use_for_automations,
    provider: row.provider,
    gmailConnectionId: row.gmail_connection_id,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCrmEmailIdentities(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_email_identities")
    .select(IDENTITY_COLUMNS)
    .eq("user_id", userId)
    .order("use_for_communications", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data || []) as IdentityRow[]).map(toIdentity);
}

export async function upsertCrmEmailIdentity(args: {
  userId: string;
  email: string;
  displayName?: string | null;
  useForCommunications: boolean;
  useForAutomations: boolean;
  gmailConnectionId?: string | null;
  verifiedAt?: string | null;
}) {
  const admin = createAdminClient();
  const email = args.email.trim().toLowerCase();

  if (args.useForCommunications) {
    const { error } = await admin
      .from("crm_email_identities")
      .update({ use_for_communications: false, updated_at: new Date().toISOString() })
      .eq("user_id", args.userId)
      .neq("email", email);
    if (error) throw new Error(error.message);
  }

  const { data, error } = await admin
    .from("crm_email_identities")
    .upsert(
      {
        user_id: args.userId,
        email,
        display_name: args.displayName?.trim() || null,
        use_for_communications: args.useForCommunications,
        use_for_automations: args.useForAutomations,
        provider: "gmail",
        gmail_connection_id: args.gmailConnectionId || null,
        verified_at: args.verifiedAt || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,email" }
    )
    .select(IDENTITY_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toIdentity(data as IdentityRow);
}

export async function syncCrmEmailIdentityFromGmail(args: {
  userId: string;
  email: string;
  gmailConnectionId: string;
}) {
  try {
    await upsertCrmEmailIdentity({
      userId: args.userId,
      email: args.email,
      useForCommunications: true,
      useForAutomations: false,
      gmailConnectionId: args.gmailConnectionId,
      verifiedAt: new Date().toISOString(),
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to sync CRM email identity",
    };
  }
}

export async function getCrmCommunicationsEmailStatus(userId: string) {
  const [gmailStatus, identities] = await Promise.all([
    getGmailConnectionStatus(userId),
    listCrmEmailIdentities(userId),
  ]);

  if (!gmailStatus.ok) return gmailStatus;

  const communicationsIdentity = identities.find((identity) => identity.useForCommunications) || null;
  if (!communicationsIdentity) {
    return {
      ok: false as const,
      error: "Insert a CRM communication email before sending.",
      code: "missing_identity" as const,
    };
  }

  if (communicationsIdentity.email.toLowerCase() !== gmailStatus.connection.gmailEmail.toLowerCase()) {
    return {
      ok: false as const,
      error: `Authorize the Google mailbox for ${communicationsIdentity.email} before sending.`,
      code: "identity_mismatch" as const,
    };
  }

  return {
    ok: true as const,
    connection: gmailStatus.connection,
    identity: communicationsIdentity,
  };
}

export async function getCrmAutomationEmailIdentities(userId: string) {
  const communicationsStatus = await getCrmCommunicationsEmailStatus(userId);
  if (!communicationsStatus.ok) return [];

  const identities = await listCrmEmailIdentities(userId);
  return identities.filter(
    (identity) =>
      identity.useForAutomations &&
      Boolean(identity.verifiedAt) &&
      identity.email.toLowerCase() === communicationsStatus.connection.gmailEmail.toLowerCase()
  );
}
