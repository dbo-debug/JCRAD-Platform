import { createAdminClient } from "@/lib/supabase/admin";

type GenericRow = Record<string, unknown>;

export type EmailCampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: "draft" | "sent" | "archived";
  batchLabel: string | null;
  territoryCode: string | null;
  routeDay: string | null;
  sentAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  createdByUserId: string;
  imageUrl: string | null;
  counts: {
    total: number;
    sent: number;
    failed: number;
    queued: number;
    skipped: number;
  };
};

export type EmailCampaignRecipientRecord = {
  id: string;
  campaignId: string;
  customerId: string | null;
  contactId: string | null;
  email: string;
  companyName: string | null;
  contactName: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  outboundEmailId: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string | null;
};

export type EmailCampaignDetail = {
  id: string;
  createdByUserId: string;
  name: string;
  subject: string;
  preheader: string | null;
  introText: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  primaryCtaLabel: string | null;
  primaryCtaUrl: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
  includeVapeComplianceFooter: boolean;
  batchLabel: string | null;
  territoryCode: string | null;
  routeDay: string | null;
  status: "draft" | "sent" | "archived";
  sentAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  recipients: EmailCampaignRecipientRecord[];
};

export type EmailRecipientOption = {
  key: string;
  customerId: string;
  contactId: string | null;
  email: string;
  companyName: string;
  contactName: string | null;
  source: "primary" | "contact";
};

export type EmailWorkspaceData = {
  campaigns: EmailCampaignSummary[];
  selectedCampaign: EmailCampaignDetail | null;
  recipientOptions: EmailRecipientOption[];
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function buildCampaignSummary(row: GenericRow, recipientRows: GenericRow[]): EmailCampaignSummary {
  const counts = {
    total: recipientRows.length,
    sent: recipientRows.filter((recipient) => String(recipient.status || "") === "sent").length,
    failed: recipientRows.filter((recipient) => String(recipient.status || "") === "failed").length,
    queued: recipientRows.filter((recipient) => String(recipient.status || "") === "queued").length,
    skipped: recipientRows.filter((recipient) => String(recipient.status || "") === "skipped").length,
  };

  return {
    id: String(row.id || ""),
    name: asText(row.name) || "Untitled campaign",
    subject: asText(row.subject) || "",
    status: (asText(row.status) || "draft") as EmailCampaignSummary["status"],
    batchLabel: asText(row.batch_label),
    territoryCode: asText(row.territory_code),
    routeDay: asText(row.route_day),
    sentAt: asText(row.sent_at),
    updatedAt: asText(row.updated_at),
    createdAt: asText(row.created_at),
    createdByUserId: asText(row.created_by_user_id) || "",
    imageUrl: asText(row.image_url),
    counts,
  };
}

function buildRecipientRecord(row: GenericRow): EmailCampaignRecipientRecord {
  return {
    id: String(row.id || ""),
    campaignId: String(row.campaign_id || ""),
    customerId: asText(row.customer_id),
    contactId: asText(row.contact_id),
    email: asText(row.email) || "",
    companyName: asText(row.company_name),
    contactName: asText(row.contact_name),
    status: (asText(row.status) || "queued") as EmailCampaignRecipientRecord["status"],
    outboundEmailId: asText(row.outbound_email_id),
    providerMessageId: asText(row.provider_message_id),
    providerThreadId: asText(row.provider_thread_id),
    errorMessage: asText(row.error_message),
    sentAt: asText(row.sent_at),
    createdAt: asText(row.created_at),
  };
}

function buildCampaignDetail(row: GenericRow, recipientRows: GenericRow[]): EmailCampaignDetail {
  return {
    id: String(row.id || ""),
    createdByUserId: asText(row.created_by_user_id) || "",
    name: asText(row.name) || "Untitled campaign",
    subject: asText(row.subject) || "",
    preheader: asText(row.preheader),
    introText: asText(row.intro_text),
    imagePath: asText(row.image_path),
    imageUrl: asText(row.image_url),
    imageAltText: asText(row.image_alt_text),
    primaryCtaLabel: asText(row.primary_cta_label),
    primaryCtaUrl: asText(row.primary_cta_url),
    secondaryCtaLabel: asText(row.secondary_cta_label),
    secondaryCtaUrl: asText(row.secondary_cta_url),
    includeVapeComplianceFooter: row.include_vape_compliance_footer === true,
    batchLabel: asText(row.batch_label),
    territoryCode: asText(row.territory_code),
    routeDay: asText(row.route_day),
    status: (asText(row.status) || "draft") as EmailCampaignDetail["status"],
    sentAt: asText(row.sent_at),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
    recipients: recipientRows.map(buildRecipientRecord),
  };
}

function buildRecipientOptions(customers: GenericRow[], contacts: GenericRow[]) {
  const customerNameById = new Map(
    customers.map((customer) => [String(customer.id || ""), asText(customer.company_name) || "Unnamed customer"] as const)
  );
  const options: EmailRecipientOption[] = [];
  const seenEmails = new Set<string>();

  for (const customer of customers) {
    const customerId = String(customer.id || "").trim();
    const archivedAt = asText(customer.archived_at);
    const email = asText(customer.primary_contact_email)?.toLowerCase() || null;
    if (!customerId || archivedAt || !isValidEmail(email) || seenEmails.has(email!)) continue;

    seenEmails.add(email!);
    options.push({
      key: `primary:${customerId}:${email}`,
      customerId,
      contactId: null,
      email: email!,
      companyName: asText(customer.company_name) || "Unnamed customer",
      contactName: asText(customer.primary_contact_name),
      source: "primary",
    });
  }

  for (const contact of contacts) {
    const customerId = String(contact.customer_id || "").trim();
    const email = asText(contact.email)?.toLowerCase() || null;
    if (!customerId || !isValidEmail(email) || seenEmails.has(email!)) continue;
    seenEmails.add(email!);
    options.push({
      key: `contact:${String(contact.id || "")}:${email}`,
      customerId,
      contactId: asText(contact.id),
      email: email!,
      companyName: customerNameById.get(customerId) || "Unnamed customer",
      contactName: asText(contact.name),
      source: "contact",
    });
  }

  return options.sort((left, right) => {
    const companyCompare = left.companyName.localeCompare(right.companyName);
    if (companyCompare !== 0) return companyCompare;
    return left.email.localeCompare(right.email);
  });
}

export async function loadEmailWorkspaceData(args: {
  staffUserId: string;
  staffRole: "admin" | "sales";
  selectedCampaignId?: string | null;
}): Promise<EmailWorkspaceData> {
  const admin = createAdminClient();
  let campaignQuery = admin
    .from("email_campaigns")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(40);

  if (args.staffRole !== "admin") {
    campaignQuery = campaignQuery.eq("created_by_user_id", args.staffUserId);
  }

  const [campaignsRes, customersRes, contactsRes] = await Promise.all([
    campaignQuery,
    admin.from("customers").select("id, company_name, primary_contact_email, primary_contact_name, archived_at").order("company_name", { ascending: true }).limit(5000),
    admin.from("customer_contacts").select("id, customer_id, name, email, is_primary").order("name", { ascending: true }).limit(5000),
  ]);

  if (campaignsRes.error) throw new Error(campaignsRes.error.message);
  if (customersRes.error) throw new Error(customersRes.error.message);
  if (contactsRes.error) throw new Error(contactsRes.error.message);

  const campaignRows = (campaignsRes.data || []) as GenericRow[];
  const visibleCampaignIds = campaignRows.map((row) => String(row.id || "")).filter(Boolean);

  let recipientRows: GenericRow[] = [];
  if (visibleCampaignIds.length > 0) {
    const recipientsRes = await admin
      .from("email_campaign_recipients")
      .select("*")
      .in("campaign_id", visibleCampaignIds)
      .order("created_at", { ascending: true });
    if (recipientsRes.error) throw new Error(recipientsRes.error.message);
    recipientRows = (recipientsRes.data || []) as GenericRow[];
  }

  const selectedCampaignRow =
    (args.selectedCampaignId
      ? campaignRows.find((row) => String(row.id || "") === args.selectedCampaignId)
      : campaignRows[0]) || null;

  const campaigns = campaignRows.map((row) =>
    buildCampaignSummary(
      row,
      recipientRows.filter((recipient) => String(recipient.campaign_id || "") === String(row.id || ""))
    )
  );

  return {
    campaigns,
    selectedCampaign: selectedCampaignRow
      ? buildCampaignDetail(
          selectedCampaignRow,
          recipientRows.filter((recipient) => String(recipient.campaign_id || "") === String(selectedCampaignRow.id || ""))
        )
      : null,
    recipientOptions: buildRecipientOptions(
      (customersRes.data || []) as GenericRow[],
      (contactsRes.data || []) as GenericRow[]
    ),
  };
}
