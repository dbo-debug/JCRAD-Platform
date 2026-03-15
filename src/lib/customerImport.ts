import { createAdminClient } from "@/lib/supabase/admin";
import { getSheetValues } from "@/lib/googleSheets";

type GenericRow = Record<string, unknown>;

export type ImportFieldKey =
  | "store_name"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "area_zone"
  | "license_number"
  | "phone"
  | "website"
  | "credit_rating"
  | "buyer_name"
  | "buyer_title"
  | "email"
  | "house_brand"
  | "tier"
  | "assigned_to"
  | "status"
  | "last_contact_date"
  | "next_follow_up_date"
  | "notes";

export type ImportMapping = Record<ImportFieldKey, string | null>;

type StaffUser = {
  userId: string;
  role: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
};

type ContactSnapshot = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
};

type CustomerSnapshot = {
  id: string;
  isPreviewOnly: boolean;
  companyName: string | null;
  primaryContactEmail: string | null;
  assignedSalesUserId: string | null;
  fields: GenericRow;
  contacts: ContactSnapshot[];
};

type ParsedRow = {
  rowNumber: number;
  source: Record<string, string>;
  storeName: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  areaZone: string | null;
  licenseNumber: string | null;
  mainPhone: string | null;
  website: string | null;
  creditRating: string | null;
  buyerName: string | null;
  buyerTitle: string | null;
  rawEmailCell: string | null;
  emails: string[];
  primaryEmail: string | null;
  secondaryEmails: string[];
  houseBrand: boolean | null;
  tier: string | null;
  assignedTo: string | null;
  status: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  notes: string | null;
  warnings: string[];
};

type MatchResult =
  | { kind: "new"; customerId: string }
  | { kind: "matched"; customerId: string; via: "company" | "email" }
  | { kind: "ambiguous"; reasons: string[] }
  | { kind: "invalid"; reasons: string[] };

export type PreviewRow = {
  rowNumber: number;
  classification: "new_customer" | "update_customer" | "new_contact_on_existing_customer" | "ambiguous_match" | "invalid_row";
  companyName: string | null;
  assignmentStatus: "resolved" | "ambiguous" | "unresolved" | "empty";
  assignmentLabel: string | null;
  assignmentUserId: string | null;
  matchStatus: "new" | "matched" | "ambiguous" | "invalid";
  matchVia: "company" | "email" | null;
  customerId: string | null;
  parsedEmails: string[];
  proposedCustomerFields: Record<string, unknown>;
  proposedContacts: Array<Record<string, unknown>>;
  warnings: string[];
};

export type PreviewResponse = {
  spreadsheetId: string;
  tabName: string;
  headers: string[];
  mapping: ImportMapping;
  summary: Record<string, number>;
  rows: PreviewRow[];
};

const FIELD_LABELS: Array<{ key: ImportFieldKey; label: string; aliases: string[] }> = [
  { key: "store_name", label: "Store Name", aliases: ["store name", "account name", "customer name"] },
  { key: "address", label: "Address", aliases: ["address", "street", "street address"] },
  { key: "city", label: "City", aliases: ["city"] },
  { key: "state", label: "State", aliases: ["state"] },
  { key: "zip", label: "Zip", aliases: ["zip", "zip code", "postal code"] },
  { key: "area_zone", label: "Area / Zone", aliases: ["area / zone", "area", "zone"] },
  { key: "license_number", label: "License Number", aliases: ["license number", "license"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number"] },
  { key: "website", label: "Website", aliases: ["website", "web site", "url"] },
  { key: "credit_rating", label: "Credit Rating", aliases: ["credit rating"] },
  { key: "buyer_name", label: "Buyer Name", aliases: ["buyer name", "contact name"] },
  { key: "buyer_title", label: "Buyer Title", aliases: ["buyer title", "title"] },
  { key: "email", label: "Email", aliases: ["email", "buyer email", "contact email"] },
  { key: "house_brand", label: "House Brand?", aliases: ["house brand?", "house brand"] },
  { key: "tier", label: "Tier", aliases: ["tier"] },
  { key: "assigned_to", label: "Assigned To", aliases: ["assigned to", "owner", "rep"] },
  { key: "status", label: "Status", aliases: ["status"] },
  { key: "last_contact_date", label: "Last Contact Date", aliases: ["last contact date", "last contact"] },
  { key: "next_follow_up_date", label: "Next Follow-Up Date", aliases: ["next follow-up date", "next follow up date", "next follow-up"] },
  { key: "notes", label: "Notes", aliases: ["notes", "comments"] },
];

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
}

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeDate(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeWebsite(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function normalizeBool(value: unknown): boolean | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseEmails(raw: string | null) {
  if (!raw) return { primaryEmail: null, secondaryEmails: [] as string[], warnings: [] as string[] };

  const warnings: string[] = [];
  const normalized = raw.replace(/\s+or\s+/gi, ";").replace(/\n/g, ";").replace(/\//g, ";");
  const tokens = normalized.split(/[;,]+/).map((token) => token.trim()).filter(Boolean);
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (/(ask for|old|buyer changed|cc|call|text)/i.test(token) && !isEmail(lower)) {
      warnings.push(`Ignored note-like email token: ${token}`);
      continue;
    }
    if (!isEmail(lower)) {
      warnings.push(`Ignored invalid email token: ${token}`);
      continue;
    }
    if (!seen.has(lower)) {
      seen.add(lower);
      emails.push(lower);
    }
  }

  return {
    primaryEmail: emails[0] || null,
    secondaryEmails: emails.slice(1),
    warnings,
  };
}

function getFieldLabels() {
  return FIELD_LABELS.map(({ key, label }) => ({ key, label }));
}

export function buildDefaultImportMapping(headers: string[]): ImportMapping {
  const mapping = Object.fromEntries(FIELD_LABELS.map((field) => [field.key, null])) as ImportMapping;
  const normalizedHeaders = new Map(headers.map((header) => [normalizeText(header), header] as const));

  for (const field of FIELD_LABELS) {
    for (const alias of field.aliases) {
      const match = normalizedHeaders.get(alias);
      if (match) {
        mapping[field.key] = match;
        break;
      }
    }
  }

  return mapping;
}

function getCell(source: Record<string, string>, header: string | null) {
  if (!header) return null;
  return asText(source[header]);
}

function rowToObject(headers: string[], row: string[]) {
  const out: Record<string, string> = {};
  headers.forEach((header, index) => {
    out[header] = String(row[index] || "").trim();
  });
  return out;
}

function parseRow(rowNumber: number, source: Record<string, string>, mapping: ImportMapping): ParsedRow {
  const rawEmailCell = getCell(source, mapping.email);
  const emailParse = parseEmails(rawEmailCell);
  const warnings = [...emailParse.warnings];
  const storeName = getCell(source, mapping.store_name);
  if (!storeName) warnings.push("Missing Store Name.");

  return {
    rowNumber,
    source,
    storeName,
    address1: getCell(source, mapping.address),
    city: getCell(source, mapping.city),
    state: getCell(source, mapping.state),
    postalCode: getCell(source, mapping.zip),
    areaZone: getCell(source, mapping.area_zone),
    licenseNumber: getCell(source, mapping.license_number),
    mainPhone: getCell(source, mapping.phone),
    website: normalizeWebsite(getCell(source, mapping.website)),
    creditRating: getCell(source, mapping.credit_rating),
    buyerName: getCell(source, mapping.buyer_name),
    buyerTitle: getCell(source, mapping.buyer_title),
    rawEmailCell,
    emails: [emailParse.primaryEmail, ...emailParse.secondaryEmails].filter(Boolean) as string[],
    primaryEmail: emailParse.primaryEmail,
    secondaryEmails: emailParse.secondaryEmails,
    houseBrand: normalizeBool(getCell(source, mapping.house_brand)),
    tier: getCell(source, mapping.tier),
    assignedTo: getCell(source, mapping.assigned_to),
    status: getCell(source, mapping.status),
    lastContactDate: normalizeDate(getCell(source, mapping.last_contact_date)),
    nextFollowUpDate: normalizeDate(getCell(source, mapping.next_follow_up_date)),
    notes: getCell(source, mapping.notes),
    warnings,
  };
}

async function loadStaffUsers() {
  const supabase = createAdminClient();
  const profilesRes = await supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const authUsers: StaffUser[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const profileById = new Map(((profilesRes.data || []) as GenericRow[]).map((row) => [String(row.id || ""), row] as const));
    for (const user of users) {
      const profile = profileById.get(String(user.id || ""));
      if (!profile) continue;
      authUsers.push({
        userId: String(user.id || ""),
        role: String(profile.role || ""),
        email: asText(user.email),
        fullName: asText((user.user_metadata as Record<string, unknown> | undefined)?.full_name || (user.user_metadata as Record<string, unknown> | undefined)?.name),
        companyName: asText(profile.company_name),
      });
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return authUsers;
}

async function loadCustomerState() {
  const supabase = createAdminClient();
  const [customersRes, contactsRes] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("customer_contacts").select("*"),
  ]);
  if (customersRes.error) throw new Error(customersRes.error.message);
  if (contactsRes.error) throw new Error(contactsRes.error.message);

  const customerById = new Map<string, CustomerSnapshot>();
  for (const row of (customersRes.data || []) as GenericRow[]) {
    const id = String(row.id || "");
    customerById.set(id, {
      id,
      isPreviewOnly: false,
      companyName: asText(row.company_name),
      primaryContactEmail: asText(row.primary_contact_email),
      assignedSalesUserId: asText(row.assigned_sales_user_id),
      fields: row,
      contacts: [],
    });
  }
  for (const row of (contactsRes.data || []) as GenericRow[]) {
    const customerId = String(row.customer_id || "");
    const target = customerById.get(customerId);
    if (!target) continue;
    target.contacts.push({
      id: String(row.id || ""),
      name: asText(row.name),
      email: normalizeText(row.email),
      phone: asText(row.phone),
      title: asText(row.title),
      isPrimary: row.is_primary === true,
    });
  }
  return customerById;
}

function buildIndexes(customers: Map<string, CustomerSnapshot>) {
  const companyIndex = new Map<string, Set<string>>();
  const emailIndex = new Map<string, Set<string>>();

  function addIndex(map: Map<string, Set<string>>, key: string | null, customerId: string) {
    if (!key) return;
    const existing = map.get(key) || new Set<string>();
    existing.add(customerId);
    map.set(key, existing);
  }

  for (const customer of customers.values()) {
    addIndex(companyIndex, normalizeText(customer.companyName), customer.id);
    addIndex(emailIndex, normalizeText(customer.primaryContactEmail), customer.id);
    for (const contact of customer.contacts) {
      addIndex(emailIndex, normalizeText(contact.email), customer.id);
    }
  }

  return { companyIndex, emailIndex };
}

function resolveAssignedUser(input: string | null, staffUsers: StaffUser[]) {
  if (!input) return { status: "empty" as const, userId: null, label: null };
  const normalized = normalizeText(input);
  const matches = staffUsers.filter((user) => {
    return normalizeText(user.email) === normalized || normalizeText(user.fullName) === normalized;
  });
  if (matches.length === 1) {
    const match = matches[0];
    return {
      status: "resolved" as const,
      userId: match.userId,
      label: match.fullName || match.email || match.userId,
    };
  }
  if (matches.length > 1) return { status: "ambiguous" as const, userId: null, label: input };
  return { status: "unresolved" as const, userId: null, label: input };
}

function resolveCustomerMatch(parsed: ParsedRow, indexes: ReturnType<typeof buildIndexes>): MatchResult {
  const companyKey = normalizeText(parsed.storeName);
  const emailKey = normalizeText(parsed.primaryEmail);
  const companyMatches = companyKey ? Array.from(indexes.companyIndex.get(companyKey) || []) : [];
  const emailMatches = emailKey ? Array.from(indexes.emailIndex.get(emailKey) || []) : [];

  if (!companyKey) return { kind: "invalid", reasons: ["Missing Store Name."] };
  if (companyMatches.length > 1) return { kind: "ambiguous", reasons: ["Company name matches multiple customers."] };
  if (emailMatches.length > 1) return { kind: "ambiguous", reasons: ["Email matches multiple customers."] };
  if (companyMatches.length === 1 && emailMatches.length === 1 && companyMatches[0] !== emailMatches[0]) {
    return { kind: "ambiguous", reasons: ["Company and email resolve to different customers."] };
  }
  if (companyMatches.length === 1) return { kind: "matched", customerId: companyMatches[0], via: "company" };
  if (emailMatches.length === 1) return { kind: "matched", customerId: emailMatches[0], via: "email" };
  return { kind: "new", customerId: `preview-${parsed.rowNumber}` };
}

function buildCustomerPatch(parsed: ParsedRow, assignmentUserId: string | null) {
  return {
    company_name: parsed.storeName,
    address_1: parsed.address1,
    city: parsed.city,
    state: parsed.state,
    postal_code: parsed.postalCode,
    area_zone: parsed.areaZone,
    license_number: parsed.licenseNumber,
    main_phone: parsed.mainPhone,
    website: parsed.website,
    credit_rating: parsed.creditRating,
    tier: parsed.tier,
    house_brand: parsed.houseBrand,
    assigned_sales_user_id: assignmentUserId,
    status: parsed.status,
    primary_contact_email: parsed.primaryEmail,
    last_contact_date: parsed.lastContactDate,
    next_follow_up_date: parsed.nextFollowUpDate,
    import_source: "google_sheets",
    last_imported_at: new Date().toISOString(),
  } as Record<string, unknown>;
}

function findExistingContact(customer: CustomerSnapshot, parsed: ParsedRow) {
  const primaryEmail = normalizeText(parsed.primaryEmail);
  const buyerName = normalizeText(parsed.buyerName);

  if (primaryEmail) {
    const byEmail = customer.contacts.find((contact) => normalizeText(contact.email) === primaryEmail);
    if (byEmail) return byEmail;
  }
  if (buyerName) {
    const byName = customer.contacts.find((contact) => normalizeText(contact.name) === buyerName);
    if (byName) return byName;
  }
  return null;
}

function buildContactPayloads(customerId: string, parsed: ParsedRow) {
  const contacts: Array<Record<string, unknown>> = [];
  if (parsed.buyerName || parsed.primaryEmail || parsed.buyerTitle || parsed.mainPhone) {
    contacts.push({
      customer_id: customerId,
      name: parsed.buyerName,
      email: parsed.primaryEmail,
      phone: parsed.mainPhone,
      title: parsed.buyerTitle,
      is_primary: true,
      source: "google_sheets",
      import_notes: parsed.rawEmailCell && parsed.secondaryEmails.length > 0 ? `Raw email cell: ${parsed.rawEmailCell}` : null,
    });
  }
  for (const email of parsed.secondaryEmails) {
    contacts.push({
      customer_id: customerId,
      name: parsed.buyerName,
      email,
      phone: null,
      title: parsed.buyerTitle,
      is_primary: false,
      source: "google_sheets",
      import_notes: "Secondary email parsed from Google Sheets import.",
    });
  }
  return contacts;
}

function summarizeRows(rows: PreviewRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});
}

async function buildPreview(args: {
  spreadsheetIdOrUrl: string;
  tabName: string;
  mapping?: Partial<ImportMapping>;
}) {
  const sheet = await getSheetValues({ spreadsheetIdOrUrl: args.spreadsheetIdOrUrl, tabName: args.tabName });
  const headers = sheet.values[0] || [];
  const mapping = {
    ...buildDefaultImportMapping(headers),
    ...(args.mapping || {}),
  } as ImportMapping;

  const staffUsers = await loadStaffUsers();
  const customers = await loadCustomerState();
  const previewRows: PreviewRow[] = [];

  for (let index = 1; index < sheet.values.length; index += 1) {
    const rowValues = sheet.values[index] || [];
    if (rowValues.every((value) => !String(value || "").trim())) continue;

    const parsed = parseRow(index + 1, rowToObject(headers, rowValues), mapping);
    const indexes = buildIndexes(customers);
    const assignment = resolveAssignedUser(parsed.assignedTo, staffUsers);
    const match = resolveCustomerMatch(parsed, indexes);

    const warnings = [...parsed.warnings];
    if (assignment.status === "ambiguous") warnings.push(`Assigned To is ambiguous: ${parsed.assignedTo}`);
    if (assignment.status === "unresolved") warnings.push(`Assigned To did not match a unique staff user: ${parsed.assignedTo}`);
    if (match.kind === "ambiguous" || match.kind === "invalid") warnings.push(...match.reasons);

    let classification: PreviewRow["classification"] = "invalid_row";
    let customerId: string | null = null;
    let matchStatus: PreviewRow["matchStatus"] = "invalid";
    let matchVia: PreviewRow["matchVia"] = null;
    let proposedContacts: Array<Record<string, unknown>> = [];
    let proposedCustomerFields: Record<string, unknown> = buildCustomerPatch(parsed, assignment.userId);

    if (match.kind === "new") {
      classification = "new_customer";
      customerId = match.customerId;
      matchStatus = "new";
      proposedContacts = buildContactPayloads(match.customerId, parsed);

      customers.set(match.customerId, {
        id: match.customerId,
        isPreviewOnly: true,
        companyName: parsed.storeName,
        primaryContactEmail: parsed.primaryEmail,
        assignedSalesUserId: assignment.userId,
        fields: proposedCustomerFields,
        contacts: proposedContacts.map((contact, contactIndex) => ({
          id: `${match.customerId}-contact-${contactIndex}`,
          name: asText(contact.name),
          email: normalizeText(contact.email),
          phone: asText(contact.phone),
          title: asText(contact.title),
          isPrimary: contact.is_primary === true,
        })),
      });
    } else if (match.kind === "matched") {
      const customer = customers.get(match.customerId)!;
      const existingContact = findExistingContact(customer, parsed);
      classification = existingContact ? "update_customer" : "new_contact_on_existing_customer";
      customerId = customer.id;
      matchStatus = "matched";
      matchVia = match.via;
      proposedContacts = buildContactPayloads(customer.id, parsed);
    } else if (match.kind === "ambiguous") {
      classification = "ambiguous_match";
      matchStatus = "ambiguous";
    } else {
      classification = "invalid_row";
      matchStatus = "invalid";
    }

    previewRows.push({
      rowNumber: parsed.rowNumber,
      classification,
      companyName: parsed.storeName,
      assignmentStatus: assignment.status,
      assignmentLabel: assignment.label,
      assignmentUserId: assignment.userId,
      matchStatus,
      matchVia,
      customerId,
      parsedEmails: parsed.emails,
      proposedCustomerFields,
      proposedContacts,
      warnings,
    });
  }

  return {
    spreadsheetId: sheet.spreadsheetId,
    tabName: sheet.tabName,
    headers,
    mapping,
    summary: summarizeRows(previewRows),
    rows: previewRows,
  } satisfies PreviewResponse;
}

function removeNullishValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== "" && fieldValue !== undefined)) as T;
}

function buildUpdatePayload(existing: GenericRow, previewFields: Record<string, unknown>) {
  const mutableFields = new Set([
    "status",
    "stage",
    "assigned_sales_user_id",
    "last_contact_date",
    "next_follow_up_date",
    "tier",
    "credit_rating",
  ]);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(previewFields)) {
    if (value === null || value === "" || value === undefined) continue;
    const existingValue = existing[key];
    if (mutableFields.has(key)) {
      out[key] = value;
      continue;
    }
    if (existingValue == null || existingValue === "") {
      out[key] = value;
    }
  }

  return out;
}

async function applyPreview(args: {
  preview: PreviewResponse;
  importNotes: boolean;
  actorUserId: string;
}) {
  const supabase = createAdminClient();
  const customers = await loadCustomerState();
  const report = {
    customersCreated: 0,
    customersUpdated: 0,
    contactsCreated: 0,
    assignmentsResolved: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
  };

  for (const row of args.preview.rows) {
    if (row.classification === "ambiguous_match" || row.classification === "invalid_row") {
      report.rowsSkipped += 1;
      continue;
    }

    try {
      let customerId = String(row.customerId || "");

      if (row.classification === "new_customer") {
        const insertPayload = removeNullishValues(row.proposedCustomerFields);
        const { data, error } = await supabase.from("customers").insert(insertPayload).select("id").single();
        if (error || !data?.id) throw new Error(error?.message || "Failed to create customer");
        customerId = String(data.id);
        report.customersCreated += 1;
      } else {
        const existing = customers.get(customerId);
        if (existing) {
          const updatePayload = buildUpdatePayload(existing.fields, row.proposedCustomerFields);
          if (Object.keys(updatePayload).length > 0) {
            const { error } = await supabase.from("customers").update(updatePayload).eq("id", customerId);
            if (error) throw new Error(error.message);
            report.customersUpdated += 1;
          }
        }
      }

      if (row.assignmentUserId) report.assignmentsResolved += 1;

      for (const contact of row.proposedContacts) {
        const payload = {
          ...contact,
          customer_id: customerId,
        };
        const email = normalizeText(payload.email);
        let existingContact: GenericRow | null = null;

        if (email) {
          const existingByEmail = await supabase
            .from("customer_contacts")
            .select("id, customer_id")
            .eq("customer_id", customerId)
            .eq("email", email)
            .maybeSingle();
          if (existingByEmail.error && existingByEmail.error.code !== "PGRST116") throw new Error(existingByEmail.error.message);
          existingContact = (existingByEmail.data as GenericRow | null) ?? null;
        }

        if (existingContact) continue;

        if (payload.is_primary === true) {
          const clearPrimary = await supabase.from("customer_contacts").update({ is_primary: false }).eq("customer_id", customerId);
          if (clearPrimary.error) throw new Error(clearPrimary.error.message);
          const { error: customerErr } = await supabase
            .from("customers")
            .update({ primary_contact_email: payload.email || null })
            .eq("id", customerId);
          if (customerErr) throw new Error(customerErr.message);
        }

        const { error } = await supabase.from("customer_contacts").insert(removeNullishValues(payload));
        if (error) throw new Error(error.message);
        report.contactsCreated += 1;
      }

      if (args.importNotes && row.proposedCustomerFields.notes) {
        const { error } = await supabase.from("customer_notes").insert({
          customer_id: customerId,
          note: `Imported from Google Sheets (row ${row.rowNumber}): ${String(row.proposedCustomerFields.notes)}`,
          author_user_id: args.actorUserId,
        });
        if (error) throw new Error(error.message);
      }
    } catch {
      report.rowsFailed += 1;
    }
  }

  return report;
}

export async function previewCustomerImport(args: {
  spreadsheetIdOrUrl: string;
  tabName: string;
  mapping?: Partial<ImportMapping>;
}) {
  return buildPreview(args);
}

export async function applyCustomerImport(args: {
  spreadsheetIdOrUrl: string;
  tabName: string;
  mapping?: Partial<ImportMapping>;
  importNotes: boolean;
  actorUserId: string;
}) {
  const preview = await buildPreview({
    spreadsheetIdOrUrl: args.spreadsheetIdOrUrl,
    tabName: args.tabName,
    mapping: args.mapping,
  });

  const report = await applyPreview({
    preview,
    importNotes: args.importNotes,
    actorUserId: args.actorUserId,
  });

  return {
    preview,
    report,
  };
}

export { getFieldLabels };
