import { createAdminClient } from "@/lib/supabase/admin";

type GenericRow = Record<string, unknown>;
type AuthUser = { id: string; email: string | null };

export type CustomerSummary = {
  id: string;
  name: string;
  status: string;
  stage: string | null;
  primaryContactEmail: string | null;
  assignedSalesUserId: string | null;
  assignedSalesName: string | null;
  assignedSalesEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  primaryContacts: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    title: string | null;
  }>;
  memberUsers: Array<{
    userId: string;
    fullName: string;
    email: string | null;
    membershipRole: string;
    isPrimary: boolean;
  }>;
  counts: {
    estimates: number;
    orders: number;
    packagingSubmissions: number;
    documents: number;
  };
  lastActivityAt: string | null;
};

export type LinkedRecord = {
  id: string;
  matchType: "account" | "email" | "company";
  createdAt: string | null;
  updatedAt?: string | null;
} & Record<string, unknown>;

export type CustomerDetail = {
  customer: CustomerSummary;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    isPrimary: boolean;
  }>;
  users: Array<{
    userId: string;
    fullName: string;
    email: string | null;
    membershipRole: string;
    isPrimary: boolean;
    status: string;
  }>;
  notes: Array<{
    id: string;
    note: string;
    createdAt: string | null;
    authorName: string | null;
  }>;
  activity: Array<{
    id: string;
    activityType: string;
    summary: string;
    createdAt: string | null;
    actorName: string | null;
    entityType: string | null;
    entityId: string | null;
  }>;
  estimates: LinkedRecord[];
  orders: LinkedRecord[];
  packagingSubmissions: LinkedRecord[];
  documents: LinkedRecord[];
};

type WorkspaceData = {
  customers: GenericRow[];
  customerUsers: GenericRow[];
  customerContacts: GenericRow[];
  customerNotes: GenericRow[];
  customerActivity: GenericRow[];
  estimates: GenericRow[];
  orders: GenericRow[];
  packagingSubmissions: GenericRow[];
  customerDocuments: GenericRow[];
  profiles: GenericRow[];
  authUsers: AuthUser[];
};

type WorkspaceSummaryBuildArgs = {
  customer: GenericRow;
  data: WorkspaceData;
  profileById: Map<string, GenericRow>;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(values: Array<unknown>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function formatProfileName(profile: GenericRow | null | undefined): string | null {
  return firstText(profile?.full_name, profile?.company_name, profile?.email);
}

function getCustomerName(customer: GenericRow): string {
  return firstText(customer.name, customer.company_name, customer.display_name, customer.primary_contact_email) || "Unnamed customer";
}

function getCustomerStatus(customer: GenericRow): string {
  return firstText(customer.status, customer.account_status) || "active";
}

function getProfileMap(profiles: GenericRow[]) {
  return new Map(
    profiles
      .map((profile) => [String(profile.id || "").trim(), profile] as const)
      .filter(([id]) => Boolean(id))
  );
}

function getAuthUserMap(users: AuthUser[]) {
  return new Map(users.map((user) => [user.id, user] as const));
}

function getCustomerIdentifiers(args: {
  customer: GenericRow;
  contacts: GenericRow[];
  customerUsers: GenericRow[];
  authUserById: Map<string, AuthUser>;
}) {
  const companyName = normalizeText(getCustomerName(args.customer));
  const emails = new Set<string>();

  const primaryEmail = normalizeText(args.customer.primary_contact_email);
  if (primaryEmail) emails.add(primaryEmail);

  for (const contact of args.contacts) {
    const email = normalizeText(contact.email);
    if (email) emails.add(email);
  }

  for (const membership of args.customerUsers) {
    const userId = String(membership.user_id || "").trim();
    const authUser = userId ? args.authUserById.get(userId) : null;
    const email = normalizeText(authUser?.email);
    if (email) emails.add(email);
  }

  return {
    accountId: String(args.customer.id || "").trim(),
    companyName,
    emails,
  };
}

function matchLegacyRow(args: {
  row: GenericRow;
  accountId: string;
  companyName: string;
  emails: Set<string>;
  companyField?: string;
  emailField?: string;
  accountField?: string;
}): "account" | "email" | "company" | null {
  const accountField = args.accountField || "customer_account_id";
  const linkedAccountId = String(args.row[accountField] || "").trim();
  if (linkedAccountId && linkedAccountId === args.accountId) return "account";
  if (linkedAccountId) return null;

  const emailValue = normalizeText(args.row[args.emailField || "customer_email"]);
  if (emailValue && args.emails.has(emailValue)) return "email";

  const companyValue = normalizeText(args.row[args.companyField || "customer_name"]);
  if (companyValue && args.companyName && companyValue === args.companyName) return "company";

  return null;
}

function sortByRecent<T extends { createdAt: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(String(a.createdAt || ""));
    const bTime = Date.parse(String(b.createdAt || ""));
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

async function loadWorkspaceData(): Promise<WorkspaceData> {
  const supabase = createAdminClient();
  const authUsers: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = (data?.users || []).map((user: { id?: string; email?: string | null }) => ({
      id: String(user.id || ""),
      email: String(user.email || "").trim() || null,
    }));
    authUsers.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }

  const [
    customersRes,
    customerUsersRes,
    customerContactsRes,
    customerNotesRes,
    customerActivityRes,
    estimatesRes,
    ordersRes,
    packagingRes,
    customerDocumentsRes,
    profilesRes,
  ] = await Promise.all([
    supabase.from("customers").select("*").order("updated_at", { ascending: false }),
    supabase.from("customer_users").select("*"),
    supabase.from("customer_contacts").select("*"),
    supabase.from("customer_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("customer_activity").select("*").order("created_at", { ascending: false }),
    supabase
      .from("estimates")
      .select("id, customer_account_id, customer_name, customer_email, status, total, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("id, customer_account_id, customer_id, status, total, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("packaging_submissions")
      .select("id, customer_account_id, estimate_id, category, status, customer_name, customer_email, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("customer_documents").select("*").order("created_at", { ascending: false }).limit(5000),
    supabase.from("profiles").select("id, role, company_name"),
  ]);

  const responses = [
    customersRes,
    customerUsersRes,
    customerContactsRes,
    customerNotesRes,
    customerActivityRes,
    estimatesRes,
    ordersRes,
    packagingRes,
    customerDocumentsRes,
    profilesRes,
  ];

  const error = responses.find((response) => response.error)?.error;
  if (error) throw new Error(error.message);

  return {
    customers: (customersRes.data || []) as GenericRow[],
    customerUsers: (customerUsersRes.data || []) as GenericRow[],
    customerContacts: (customerContactsRes.data || []) as GenericRow[],
    customerNotes: (customerNotesRes.data || []) as GenericRow[],
    customerActivity: (customerActivityRes.data || []) as GenericRow[],
    estimates: (estimatesRes.data || []) as GenericRow[],
    orders: (ordersRes.data || []) as GenericRow[],
    packagingSubmissions: (packagingRes.data || []) as GenericRow[],
    customerDocuments: (customerDocumentsRes.data || []) as GenericRow[],
    profiles: (profilesRes.data || []) as GenericRow[],
    authUsers,
  };
}

function buildLinkedRecords(
  rows: GenericRow[],
  args: {
    accountId: string;
    companyName: string;
    emails: Set<string>;
    companyField?: string;
    emailField?: string;
    accountField?: string;
  }
): LinkedRecord[] {
  return rows
    .map((row) => {
      const matchType = matchLegacyRow({ row, ...args });
      if (!matchType) return null;
      return {
        ...row,
        id: String(row.id || ""),
        matchType,
        createdAt: firstText(row.created_at) || null,
        updatedAt: firstText(row.updated_at) || null,
      } satisfies LinkedRecord;
    })
    .filter((row): row is LinkedRecord => Boolean(row))
    .sort((a, b) => {
      const aTime = Date.parse(String(a.updatedAt || a.createdAt || ""));
      const bTime = Date.parse(String(b.updatedAt || b.createdAt || ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

export async function loadCustomerWorkspaceIndex(): Promise<CustomerSummary[]> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);

  return data.customers.map((customer) => buildCustomerSummary({ customer, data, profileById, authUserById }));
}

export async function loadCustomerWorkspaceDetail(customerId: string): Promise<CustomerDetail | null> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);
  const customer = data.customers.find((row) => String(row.id || "").trim() === customerId);
  if (!customer) return null;

  const contacts = data.customerContacts.filter((row) => String(row.customer_id || "").trim() === customerId);
  const memberships = data.customerUsers.filter((row) => String(row.customer_id || "").trim() === customerId);
  const identifiers = getCustomerIdentifiers({
    customer,
    contacts,
    customerUsers: memberships,
    authUserById,
  });

  const estimates = buildLinkedRecords(data.estimates, identifiers);
  const orders = data.orders
    .filter((row) => String(row.customer_account_id || "").trim() === customerId)
    .map((row) => ({
      ...row,
      id: String(row.id || ""),
      matchType: "account" as const,
      createdAt: firstText(row.created_at) || null,
      updatedAt: firstText(row.updated_at) || null,
    }));
  const packagingSubmissions = buildLinkedRecords(data.packagingSubmissions, identifiers);
  const documents = data.customerDocuments
    .filter((row) => String(row.customer_account_id || "").trim() === customerId)
    .map((row) => ({
      ...row,
      id: String(row.id || ""),
      matchType: "account" as const,
      createdAt: firstText(row.created_at) || null,
      updatedAt: firstText(row.updated_at) || null,
    }))
    .sort((a, b) => {
      const aTime = Date.parse(String(a.updatedAt || a.createdAt || ""));
      const bTime = Date.parse(String(b.updatedAt || b.createdAt || ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });

  const notes = sortByRecent(
    data.customerNotes
      .filter((row) => String(row.customer_id || "").trim() === customerId)
      .map((row) => {
        const author = profileById.get(String(row.author_user_id || ""));
        return {
          id: String(row.id || ""),
          note: firstText(row.note, row.body) || "",
          createdAt: firstText(row.created_at) || null,
          authorName: formatProfileName(author),
        };
      })
  );

  const activity = sortByRecent(
    data.customerActivity
      .filter((row) => String(row.customer_id || "").trim() === customerId)
      .map((row) => {
        const actor = profileById.get(String(row.actor_user_id || ""));
        return {
          id: String(row.id || ""),
          activityType: firstText(row.activity_type) || "activity",
          summary: firstText(row.summary, row.description, row.activity_type) || "Activity",
          createdAt: firstText(row.created_at) || null,
          actorName: formatProfileName(actor),
          entityType: firstText(row.entity_type),
          entityId: firstText(row.entity_id),
        };
      })
  );

  const summary = buildCustomerSummary({ customer, data, profileById, authUserById });

  return {
    customer: summary,
    contacts: contacts.map((row) => ({
      id: String(row.id || ""),
      name: firstText(row.name, row.email) || "Unnamed contact",
      email: firstText(row.email),
      phone: firstText(row.phone),
      title: firstText(row.title),
      isPrimary: row.is_primary === true,
    })),
    users: memberships.map((membership) => {
      const userId = String(membership.user_id || "");
      const profile = profileById.get(userId);
      const authUser = authUserById.get(userId);
      return {
        userId,
        fullName: formatProfileName(profile) || userId || "Unknown user",
        email: firstText(authUser?.email),
        membershipRole: firstText(membership.membership_role, membership.role) || "member",
        isPrimary: membership.is_primary === true,
        status: firstText(membership.status) || "active",
      };
    }),
    notes,
    activity,
    estimates,
    orders,
    packagingSubmissions,
    documents,
  };
}

function buildCustomerSummary({
  customer,
  data,
  profileById,
  authUserById,
}: WorkspaceSummaryBuildArgs & { authUserById: Map<string, AuthUser> }): CustomerSummary {
  const customerId = String(customer.id || "").trim();
  const contacts = data.customerContacts.filter((row) => String(row.customer_id || "").trim() === customerId);
  const memberships = data.customerUsers.filter((row) => String(row.customer_id || "").trim() === customerId);
  const identifiers = getCustomerIdentifiers({
    customer,
    contacts,
    customerUsers: memberships,
    authUserById,
  });

  const linkedEstimates = buildLinkedRecords(data.estimates, identifiers);
  const linkedOrders = data.orders
    .filter((row) => String(row.customer_account_id || "").trim() === identifiers.accountId)
    .map((row) => ({
      ...row,
      id: String(row.id || ""),
      matchType: "account" as const,
      createdAt: firstText(row.created_at) || null,
      updatedAt: firstText(row.updated_at) || null,
    }));
  const linkedPackaging = buildLinkedRecords(data.packagingSubmissions, identifiers);
  const linkedDocuments = data.customerDocuments
    .filter((row) => String(row.customer_account_id || "").trim() === identifiers.accountId)
    .map((row) => ({
      ...row,
      id: String(row.id || ""),
      matchType: "account" as const,
      createdAt: firstText(row.created_at) || null,
      updatedAt: firstText(row.updated_at) || null,
    }));

  const assignedSalesUserId = firstText(customer.assigned_sales_user_id, customer.owner_user_id);
  const assignedSalesProfile = assignedSalesUserId ? profileById.get(assignedSalesUserId) : null;
  const primaryContacts = contacts
    .filter((row) => row.is_primary === true)
    .slice(0, 2)
    .map((row) => ({
      id: String(row.id || ""),
      name: firstText(row.name, row.email) || "Unnamed contact",
      email: firstText(row.email),
      phone: firstText(row.phone),
      title: firstText(row.title),
    }));

  const memberUsers = memberships.map((membership) => {
    const userId = String(membership.user_id || "");
    const profile = profileById.get(userId);
    const authUser = authUserById.get(userId);
    return {
      userId,
      fullName: formatProfileName(profile) || userId || "Unknown user",
      email: firstText(authUser?.email),
      membershipRole: firstText(membership.membership_role, membership.role) || "member",
      isPrimary: membership.is_primary === true,
    };
  });

  const lastActivityAt = uniqueStrings([
    ...linkedEstimates.map((row) => row.updatedAt || row.createdAt),
    ...linkedOrders.map((row) => row.updatedAt || row.createdAt),
    ...linkedPackaging.map((row) => row.updatedAt || row.createdAt),
    ...linkedDocuments.map((row) => row.updatedAt || row.createdAt),
  ])
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => b.time - a.time)[0]?.value || null;

  return {
    id: customerId,
    name: getCustomerName(customer),
    status: getCustomerStatus(customer),
    stage: firstText(customer.stage),
    primaryContactEmail: firstText(customer.primary_contact_email),
    assignedSalesUserId,
    assignedSalesName: formatProfileName(assignedSalesProfile),
    assignedSalesEmail: firstText(authUserById.get(assignedSalesUserId || "")?.email),
    createdAt: firstText(customer.created_at) || null,
    updatedAt: firstText(customer.updated_at) || null,
    primaryContacts,
    memberUsers,
    counts: {
      estimates: linkedEstimates.length,
      orders: linkedOrders.length,
      packagingSubmissions: linkedPackaging.length,
      documents: linkedDocuments.length,
    },
    lastActivityAt,
  };
}
