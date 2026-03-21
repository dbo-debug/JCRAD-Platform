import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type GenericRow = Record<string, unknown>;

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
      .select("id, company_name, primary_contact_name, primary_contact_email, primary_contact_phone, main_phone, record_kind, archived_at")
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
      return (!recordKind || recordKind === "customer") && !row.archived_at;
    }),
    contacts: (contactsRes.data || []) as GenericRow[],
    memberships,
    profileById: buildProfileMap((profilesRes.data || []) as GenericRow[]),
  };
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
    .is("archived_at", null)
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
