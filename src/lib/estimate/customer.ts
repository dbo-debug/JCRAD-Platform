import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type GenericRow = Record<string, unknown>;

export type EstimateResolvedCustomer = {
  customerId: string;
  matchType: "account" | "user" | "email" | "company";
};

export type EstimateAttachedCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
};

export type EstimateCustomerOption = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
};

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
}

function buildProfileMap(rows: GenericRow[]) {
  return new Map(
    rows
      .map((row) => [String(row.id || "").trim(), row] as const)
      .filter(([id]) => Boolean(id))
  );
}

function pickPrimaryContact(rows: GenericRow[]) {
  return rows.find((row) => row.is_primary === true) || rows[0] || null;
}

function pickPrimaryProfile(rows: GenericRow[], profileById: Map<string, GenericRow>) {
  const sorted = [...rows].sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
  const profiles = sorted
    .map((row) => profileById.get(String(row.user_id || "").trim()) || null)
    .filter((row): row is GenericRow => Boolean(row));
  return profiles.find((row) => firstText(row.logo_url)) || profiles[0] || null;
}

function getCustomerCompanyName(customer: GenericRow): string | null {
  return firstText(customer.company_name, customer.primary_contact_name, customer.primary_contact_email);
}

function getCustomerContactName(args: {
  customer: GenericRow;
  primaryContact: GenericRow | null;
}): string | null {
  return firstText(args.customer.primary_contact_name, args.primaryContact?.name);
}

function getCustomerEmail(args: {
  customer: GenericRow;
  primaryContact: GenericRow | null;
}): string | null {
  return firstText(args.primaryContact?.email, args.customer.primary_contact_email);
}

function getCustomerPhone(args: {
  customer: GenericRow;
  primaryContact: GenericRow | null;
}): string | null {
  return firstText(args.primaryContact?.phone, args.customer.primary_contact_phone, args.customer.main_phone);
}

function buildAttachedCustomer(args: {
  customer: GenericRow;
  contactRows: GenericRow[];
  membershipRows: GenericRow[];
  profileById: Map<string, GenericRow>;
}): EstimateAttachedCustomer {
  const primaryContact = pickPrimaryContact(args.contactRows);
  const primaryProfile = pickPrimaryProfile(args.membershipRows, args.profileById);
  const companyName = getCustomerCompanyName(args.customer);

  return {
    id: String(args.customer.id || ""),
    company_name: companyName,
    contact_name: getCustomerContactName({ customer: args.customer, primaryContact }),
    email: getCustomerEmail({ customer: args.customer, primaryContact }),
    phone: getCustomerPhone({ customer: args.customer, primaryContact }),
    logo_url: firstText(primaryProfile?.logo_url),
  };
}

async function loadCustomerContext(admin: AdminClient, customerIds: string[]) {
  if (customerIds.length === 0) {
    return {
      customers: [] as GenericRow[],
      contacts: [] as GenericRow[],
      memberships: [] as GenericRow[],
      profileById: new Map<string, GenericRow>(),
    };
  }

  const [customersRes, contactsRes, membershipsRes] = await Promise.all([
    admin
      .from("customers")
      .select("id, company_name, primary_contact_name, primary_contact_email, primary_contact_phone, main_phone, record_kind")
      .in("id", customerIds),
    admin
      .from("customer_contacts")
      .select("id, customer_id, name, email, phone, is_primary")
      .in("customer_id", customerIds),
    admin
      .from("customer_users")
      .select("customer_id, user_id, is_primary")
      .in("customer_id", customerIds),
  ]);

  if (customersRes.error) throw new Error(customersRes.error.message);
  if (contactsRes.error) throw new Error(contactsRes.error.message);
  if (membershipsRes.error) throw new Error(membershipsRes.error.message);

  const memberships = (membershipsRes.data || []) as GenericRow[];
  const userIds = Array.from(new Set(memberships.map((row) => String(row.user_id || "").trim()).filter(Boolean)));
  const profilesRes = userIds.length > 0
    ? await admin.from("profiles").select("id, company_name, logo_url").in("id", userIds)
    : { data: [], error: null };

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  return {
    customers: ((customersRes.data || []) as GenericRow[]).filter((row) => {
      const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
      return !recordKind || recordKind === "customer";
    }),
    contacts: (contactsRes.data || []) as GenericRow[],
    memberships,
    profileById: buildProfileMap((profilesRes.data || []) as GenericRow[]),
  };
}

async function loadActiveCustomerIds(admin: AdminClient, customerIds: string[]) {
  const uniqueIds = Array.from(new Set(customerIds.map((value) => String(value || "").trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [] as string[];

  const { data, error } = await admin
    .from("customers")
    .select("id, record_kind")
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);

  return ((data || []) as GenericRow[])
    .filter((row) => {
      const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
      return !recordKind || recordKind === "customer";
    })
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
}

async function resolveCustomerIdsByEmail(admin: AdminClient, email: string): Promise<string[]> {
  const normalizedEmail = normalizeText(email);
  if (!normalizedEmail) return [];

  const [customerRes, contactRes] = await Promise.all([
    admin.from("customers").select("id").ilike("primary_contact_email", normalizedEmail),
    admin.from("customer_contacts").select("customer_id").ilike("email", normalizedEmail),
  ]);

  if (customerRes.error) throw new Error(customerRes.error.message);
  if (contactRes.error) throw new Error(contactRes.error.message);

  const activeCustomerIds = await loadActiveCustomerIds(admin, [
    ...(customerRes.data || []).map((row: GenericRow) => String(row.id || "").trim()),
    ...(contactRes.data || []).map((row: GenericRow) => String(row.customer_id || "").trim()),
  ]);

  return Array.from(new Set(activeCustomerIds));
}

async function resolveCustomerIdsByCompany(admin: AdminClient, companyName: string): Promise<string[]> {
  const normalizedCompanyName = normalizeText(companyName);
  if (!normalizedCompanyName) return [];

  const { data, error } = await admin
    .from("customers")
    .select("id, company_name, record_kind")
    .ilike("company_name", companyName);

  if (error) throw new Error(error.message);

  return ((data || []) as GenericRow[])
    .filter((row) => {
      const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
      return (!recordKind || recordKind === "customer") && normalizeText(row.company_name) === normalizedCompanyName;
    })
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
}

export async function resolveEstimateCustomerForAuthenticatedUser(
  admin: AdminClient,
  args: {
    userId: string | null | undefined;
    userEmail?: string | null;
    companyName?: string | null;
  }
): Promise<EstimateResolvedCustomer | null> {
  const userId = String(args.userId || "").trim();

  if (userId) {
    const { data, error } = await admin
      .from("customer_users")
      .select("customer_id, is_primary, status")
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    const membershipRows = (data || []) as GenericRow[];
    const activeCustomerIds = await loadActiveCustomerIds(
      admin,
      membershipRows
        .filter((row) => {
          const status = normalizeText(row.status);
          return !status || status === "active";
        })
        .map((row) => String(row.customer_id || "").trim())
    );

    if (activeCustomerIds.length === 1) {
      return { customerId: activeCustomerIds[0], matchType: "user" };
    }

    const primaryMembershipIds = membershipRows
      .filter((row) => row.is_primary === true)
      .map((row) => String(row.customer_id || "").trim())
      .filter((customerId) => activeCustomerIds.includes(customerId));

    if (primaryMembershipIds.length === 1) {
      return { customerId: primaryMembershipIds[0], matchType: "user" };
    }
  }

  const emailMatches = await resolveCustomerIdsByEmail(admin, String(args.userEmail || ""));
  if (emailMatches.length === 1) {
    return { customerId: emailMatches[0], matchType: "email" };
  }

  const companyMatches = await resolveCustomerIdsByCompany(admin, String(args.companyName || ""));
  if (companyMatches.length === 1) {
    return { customerId: companyMatches[0], matchType: "company" };
  }

  return null;
}

export async function resolveEstimateCustomerFromFields(
  admin: AdminClient,
  args: {
    customerAccountId?: string | null;
    customerEmail?: string | null;
    customerName?: string | null;
  }
): Promise<EstimateResolvedCustomer | null> {
  const existingCustomerId = String(args.customerAccountId || "").trim();
  if (existingCustomerId) {
    const activeCustomerIds = await loadActiveCustomerIds(admin, [existingCustomerId]);
    if (activeCustomerIds.length === 1) {
      return { customerId: activeCustomerIds[0], matchType: "account" };
    }
  }

  const emailMatches = await resolveCustomerIdsByEmail(admin, String(args.customerEmail || ""));
  if (emailMatches.length === 1) {
    return { customerId: emailMatches[0], matchType: "email" };
  }

  const companyMatches = await resolveCustomerIdsByCompany(admin, String(args.customerName || ""));
  if (companyMatches.length === 1) {
    return { customerId: companyMatches[0], matchType: "company" };
  }

  return null;
}

export async function loadEstimateAttachedCustomer(admin: AdminClient, customerId: string): Promise<EstimateAttachedCustomer | null> {
  const normalizedCustomerId = String(customerId || "").trim();
  if (!normalizedCustomerId) return null;

  const context = await loadCustomerContext(admin, [normalizedCustomerId]);
  const customer = context.customers.find((row) => String(row.id || "").trim() === normalizedCustomerId);
  if (!customer) return null;

  return buildAttachedCustomer({
    customer,
    contactRows: context.contacts.filter((row) => String(row.customer_id || "").trim() === normalizedCustomerId),
    membershipRows: context.memberships.filter((row) => String(row.customer_id || "").trim() === normalizedCustomerId),
    profileById: context.profileById,
  });
}

export async function loadEstimateCustomerOptions(admin: AdminClient): Promise<EstimateCustomerOption[]> {
  const { data: customerRows, error } = await admin
    .from("customers")
    .select("id")
    .or("record_kind.is.null,record_kind.eq.customer")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const customerIds = ((customerRows || []) as GenericRow[])
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
  const context = await loadCustomerContext(admin, customerIds);

  return context.customers
    .map((customer) =>
      buildAttachedCustomer({
        customer,
        contactRows: context.contacts.filter((row) => String(row.customer_id || "").trim() === String(customer.id || "").trim()),
        membershipRows: context.memberships.filter((row) => String(row.customer_id || "").trim() === String(customer.id || "").trim()),
        profileById: context.profileById,
      })
    )
    .map((customer) => ({
      ...customer,
      company_name: customer.company_name || "Unnamed customer",
    }))
    .sort((a, b) => a.company_name.localeCompare(b.company_name));
}
