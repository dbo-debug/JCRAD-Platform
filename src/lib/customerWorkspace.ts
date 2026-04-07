import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCustomerApprovalStatus } from "@/lib/customerApproval";

type GenericRow = Record<string, unknown>;
type AuthUser = { id: string; email: string | null };
type AdminClient = ReturnType<typeof createAdminClient>;
const WORKSPACE_BATCH_SIZE = 500;

export type CustomerSummary = {
  id: string;
  name: string;
  approvalStatus: string;
  archivedAt: string | null;
  status: string;
  stage: string | null;
  source: string | null;
  importSource: string | null;
  isHallOfFlowersLead: boolean;
  isHotLead: boolean;
  areaZone: string | null;
  territoryCode: string | null;
  routeDay: string | null;
  visitStatus: string | null;
  lastVisitAt: string | null;
  nextVisitDueAt: string | null;
  routePriority: number | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: "geocoded" | "missing_address" | "failed" | "needs_review" | null;
  geocodedAddress: string | null;
  lastGeocodedAt: string | null;
  geocodeProvider: string | null;
  website: string | null;
  mainPhone: string | null;
  primaryContactEmail: string | null;
  assignedSalesUserId: string | null;
  assignedSalesName: string | null;
  assignedSalesEmail: string | null;
  assignedRouteRepUserId: string | null;
  assignedRouteRepName: string | null;
  assignedRouteRepEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  openTaskCount: number;
  overdueTaskCount: number;
  hasOpenTask: boolean;
  nextTaskDueAt: string | null;
  latestTaskStatus: string | null;
  contactCount: number;
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
  linkedDocuments: LinkedRecord[];
  counts: {
    estimates: number;
    orders: number;
    packagingSubmissions: number;
    documents: number;
  };
  hasBeenContacted: boolean;
  lastContactedAt: string | null;
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
    details: Record<string, unknown> | null;
    createdAt: string | null;
    actorName: string | null;
    entityType: string | null;
    entityId: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    dueAt: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    status: string;
    priority: number | null;
    reminderOffsetMinutes: number | null;
    createdAt: string | null;
    completedAt: string | null;
  }>;
  estimates: LinkedRecord[];
  orders: LinkedRecord[];
  packagingSubmissions: LinkedRecord[];
  documents: LinkedRecord[];
};

export type CustomerWorkspaceMetrics = {
  totalCustomers: number;
  totalContacts: number;
  customersWithContacts: number;
  missingPrimaryContact: number;
  customersWithoutContacts: number;
};

export type CustomerWorkspaceIndexData = {
  customers: CustomerSummary[];
  metrics: CustomerWorkspaceMetrics;
};

type WorkspaceData = {
  customers: GenericRow[];
  customerUsers: GenericRow[];
  customerContacts: GenericRow[];
  customerNotes: GenericRow[];
  customerActivity: GenericRow[];
  customerTasks: GenericRow[];
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

function isCustomerWorkspaceRecord(customer: GenericRow) {
  const recordKind = normalizeText(customer.record_kind);
  return !recordKind || recordKind === "customer";
}

function isArchivedCustomerRecord(customer: GenericRow) {
  return Boolean(firstText(customer.archived_at));
}

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);
const CONTACT_ACTIVITY_TYPES = new Set([
  "call",
  "email",
  "email_sent",
  "email_received",
  "sms_sent",
  "meeting",
  "visit_logged",
  "visit_completed",
]);

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

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readHotLeadState(details: unknown): boolean | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>).hot_lead;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function getRowTimestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : -1;
}

function isContactActivityRow(row: GenericRow) {
  const activityType = normalizeText(row.activity_type);
  if (!activityType) return false;
  if (CONTACT_ACTIVITY_TYPES.has(activityType)) return true;
  if (activityType.startsWith("call")) return true;
  if (activityType === "email" || activityType.startsWith("email_")) return true;
  if (activityType === "sms" || activityType.startsWith("sms_")) return true;
  if (activityType.includes("meeting")) return true;
  if (activityType === "visit" || activityType.startsWith("visit_")) return true;
  return false;
}

function getLastContactedAt(args: { customer: GenericRow; activityRows: GenericRow[] }): string | null {
  return uniqueStrings([
    firstText(args.customer.last_contacted_at, args.customer.first_contacted_at, args.customer.contacted_at),
    ...args.activityRows
      .filter((row) => isContactActivityRow(row))
      .map((row) => firstText(row.created_at)),
  ])
    .filter(Boolean)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => b.time - a.time)[0]?.value || null;
}

function deriveHotLeadState(activityRows: GenericRow[], taskRows: GenericRow[]): boolean {
  const latestActivitySignal = activityRows.reduce<{ state: boolean; createdAt: number } | null>((latest, row) => {
    const state = readHotLeadState(row.details);
    if (state === null) return latest;

    const candidate = {
      state,
      createdAt: getRowTimestamp(firstText(row.created_at)),
    };

    if (!latest || candidate.createdAt > latest.createdAt) return candidate;
    return latest;
  }, null);

  const latestOpenHallOfFlowersTask = taskRows.reduce<{ createdAt: number } | null>((latest, row) => {
    const isOpen =
      !CLOSED_TASK_STATUSES.has(normalizeText(row.status)) &&
      !firstText(row.completed_at) &&
      normalizeText(row.title).includes("hall of flowers lead");
    if (!isOpen) return latest;

    const candidate = { createdAt: getRowTimestamp(firstText(row.created_at)) };
    if (!latest || candidate.createdAt > latest.createdAt) return candidate;
    return latest;
  }, null);

  if (latestActivitySignal && latestOpenHallOfFlowersTask) {
    return latestActivitySignal.createdAt >= latestOpenHallOfFlowersTask.createdAt ? latestActivitySignal.state : true;
  }

  if (latestActivitySignal) return latestActivitySignal.state;
  return Boolean(latestOpenHallOfFlowersTask);
}

function formatProfileName(profile: GenericRow | null | undefined): string | null {
  return firstText(profile?.company_name, profile?.email);
}

function getCustomerName(customer: GenericRow): string {
  return firstText(
    customer.company_name,
    customer.primary_contact_name,
    customer.primary_contact_email,
    customer.main_phone,
  ) || "Unnamed customer";
}

function getCustomerStatus(customer: GenericRow): string {
  return firstText(customer.status, customer.account_status) || "active";
}

function getCustomerApprovalStatus(customer: GenericRow): string {
  return normalizeCustomerApprovalStatus(customer.approval_status);
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

function isLinkedRecord(row: LinkedRecord | null): row is LinkedRecord {
  return row !== null;
}

async function fetchAllTableRows(args: {
  supabase: AdminClient;
  table: string;
  columns?: string;
  orderBy?: { column: string; ascending: boolean };
  optionalRelation?: boolean;
}) {
  const rows: GenericRow[] = [];
  let from = 0;

  while (true) {
    let query = args.supabase
      .from(args.table)
      .select(args.columns || "*")
      .range(from, from + WORKSPACE_BATCH_SIZE - 1);

    if (args.orderBy) {
      query = query.order(args.orderBy.column, { ascending: args.orderBy.ascending });
    }

    const { data, error } = await query;
    if (error) {
      const errorMessage = String(error.message || "").toLowerCase();
      const errorDetails = String((error as { details?: unknown }).details || "").toLowerCase();
      const isMissingOptionalRelation =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        errorMessage.includes("relation") && errorMessage.includes("does not exist") ||
        errorMessage.includes("schema cache") ||
        errorDetails.includes("relation") && errorDetails.includes("does not exist") ||
        errorDetails.includes("schema cache");

      if (args.optionalRelation && isMissingOptionalRelation) {
        return [];
      }
      throw new Error(error.message);
    }

    const page = (data || []) as GenericRow[];
    rows.push(...page);
    if (page.length < WORKSPACE_BATCH_SIZE) break;
    from += WORKSPACE_BATCH_SIZE;
  }

  return rows;
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
    customers,
    customerUsers,
    customerContacts,
    customerNotes,
    customerActivity,
    customerTasks,
    estimatesRes,
    ordersRes,
    packagingRes,
    customerDocumentsRes,
    profiles,
  ] = await Promise.all([
    fetchAllTableRows({ supabase, table: "customers", orderBy: { column: "updated_at", ascending: false } }),
    fetchAllTableRows({ supabase, table: "customer_users" }),
    fetchAllTableRows({ supabase, table: "customer_contacts" }),
    fetchAllTableRows({ supabase, table: "customer_notes", orderBy: { column: "created_at", ascending: false } }),
    fetchAllTableRows({ supabase, table: "customer_activity", orderBy: { column: "created_at", ascending: false }, optionalRelation: true }),
    fetchAllTableRows({ supabase, table: "customer_tasks", orderBy: { column: "created_at", ascending: false }, optionalRelation: true }),
    supabase
      .from("estimates")
      .select("id, customer_account_id, customer_name, customer_email, status, total, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("id, customer_account_id, customer_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("packaging_submissions")
      .select("id, customer_account_id, estimate_id, category, status, customer_name, customer_email, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("customer_documents").select("*").order("created_at", { ascending: false }).limit(5000),
    fetchAllTableRows({ supabase, table: "profiles", columns: "id, role, company_name" }),
  ]);

  const responses = [estimatesRes, ordersRes, packagingRes, customerDocumentsRes];

  const error = responses.find((response) => response.error)?.error;
  if (error) throw new Error(error.message);

  return {
    customers,
    customerUsers,
    customerContacts,
    customerNotes,
    customerActivity,
    customerTasks,
    estimates: (estimatesRes.data || []) as GenericRow[],
    orders: (ordersRes.data || []) as GenericRow[],
    packagingSubmissions: (packagingRes.data || []) as GenericRow[],
    customerDocuments: (customerDocumentsRes.data || []) as GenericRow[],
    profiles,
    authUsers,
  };
}

function buildWorkspaceMetrics(data: WorkspaceData): CustomerWorkspaceMetrics {
  const customerIds = new Set(
    data.customers
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );
  const activeContacts = data.customerContacts.filter((row) => customerIds.has(String(row.customer_id || "").trim()));
  const customersWithContacts = new Set(
    activeContacts
      .map((row) => String(row.customer_id || "").trim())
      .filter(Boolean)
  );
  const customersWithPrimaryContact = new Set(
    activeContacts
      .filter((row) => row.is_primary === true)
      .map((row) => String(row.customer_id || "").trim())
      .filter(Boolean)
  );

  return {
    totalCustomers: data.customers.length,
    totalContacts: activeContacts.length,
    customersWithContacts: customersWithContacts.size,
    missingPrimaryContact: data.customers.filter((customer) => !customersWithPrimaryContact.has(String(customer.id || "").trim())).length,
    customersWithoutContacts: data.customers.filter((customer) => !customersWithContacts.has(String(customer.id || "").trim())).length,
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
    .map((row): LinkedRecord | null => {
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
    .filter(isLinkedRecord)
    .sort((a, b) => {
      const aTime = Date.parse(String(a.updatedAt || a.createdAt || ""));
      const bTime = Date.parse(String(b.updatedAt || b.createdAt || ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

function buildLinkedCustomerDocuments(rows: GenericRow[], args: { accountId: string; userIds: Set<string> }): LinkedRecord[] {
  return rows
    .map((row): LinkedRecord | null => {
      const accountId = String(row.customer_account_id || "").trim();
      const userId = String(row.user_id || "").trim();
      const matchesAccount = accountId && accountId === args.accountId;
      const matchesUser = !matchesAccount && userId && args.userIds.has(userId);
      if (!matchesAccount && !matchesUser) return null;

      return {
        ...row,
        id: String(row.id || ""),
        matchType: "account" as const,
        createdAt: firstText(row.created_at) || null,
        updatedAt: firstText(row.updated_at) || null,
      };
    })
    .filter(isLinkedRecord)
    .sort((a, b) => {
      const aTime = Date.parse(String(a.updatedAt || a.createdAt || ""));
      const bTime = Date.parse(String(b.updatedAt || b.createdAt || ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

export async function loadCustomerWorkspaceIndex(args?: { includeArchived?: boolean }): Promise<CustomerWorkspaceIndexData> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);
  const customerWorkspaceRows = data.customers.filter(isCustomerWorkspaceRecord);
  const activeCustomers = customerWorkspaceRows.filter((customer) => !isArchivedCustomerRecord(customer));
  const customers = args?.includeArchived ? customerWorkspaceRows : activeCustomers;

  return {
    customers: customers.map((customer) => buildCustomerSummary({ customer, data, profileById, authUserById })),
    metrics: buildWorkspaceMetrics({ ...data, customers: activeCustomers }),
  };
}

export async function loadCustomerWorkspaceDetail(customerId: string): Promise<CustomerDetail | null> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);
  const customer = data.customers.find((row) => String(row.id || "").trim() === customerId && isCustomerWorkspaceRecord(row));
  if (!customer) return null;

  const contacts = data.customerContacts.filter((row) => String(row.customer_id || "").trim() === customerId);
  const memberships = data.customerUsers.filter((row) => String(row.customer_id || "").trim() === customerId);
  const identifiers = getCustomerIdentifiers({
    customer,
    contacts,
    customerUsers: memberships,
    authUserById,
  });
  const membershipUserIds = new Set(memberships.map((row) => String(row.user_id || "").trim()).filter(Boolean));

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
  const documents = buildLinkedCustomerDocuments(data.customerDocuments, {
    accountId: customerId,
    userIds: membershipUserIds,
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
          details: row.details && typeof row.details === "object" && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : null,
          createdAt: firstText(row.created_at) || null,
          actorName: formatProfileName(actor),
          entityType: firstText(row.entity_type),
          entityId: firstText(row.entity_id),
        };
      })
  );

  const tasks = sortByRecent(
    data.customerTasks
      .filter((row) => String(row.customer_id || "").trim() === customerId)
      .map((row) => {
        const assignedUserId = firstText(row.assigned_user_id);
        const assignee = profileById.get(String(assignedUserId || ""));
        const assigneeAuthUser = assignedUserId ? authUserById.get(assignedUserId) : null;
        const completedAt = firstText(row.completed_at) || null;
        return {
          id: String(row.id || ""),
          title: firstText(row.title) || "Untitled task",
          dueDate: firstText(row.due_date),
          dueAt: firstText(row.due_at),
          assignedUserId,
          assignedUserName: formatProfileName(assignee) || firstText(assigneeAuthUser?.email) || assignedUserId,
          status: firstText(row.status) || "open",
          priority: typeof row.priority === "number" ? row.priority : Number.isFinite(Number(row.priority)) ? Number(row.priority) : null,
          reminderOffsetMinutes:
            typeof row.reminder_offset_minutes === "number"
              ? row.reminder_offset_minutes
              : Number.isFinite(Number(row.reminder_offset_minutes))
                ? Number(row.reminder_offset_minutes)
                : null,
          createdAt: firstText(row.created_at) || null,
          completedAt,
        };
      })
      .sort((a, b) => {
        const statusWeight = a.completedAt ? 1 : 0;
        const otherStatusWeight = b.completedAt ? 1 : 0;
        if (statusWeight !== otherStatusWeight) return statusWeight - otherStatusWeight;

        const aDue = Date.parse(String(a.dueAt || a.dueDate || ""));
        const bDue = Date.parse(String(b.dueAt || b.dueDate || ""));
        if (Number.isFinite(aDue) || Number.isFinite(bDue)) {
          return (Number.isFinite(aDue) ? aDue : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bDue) ? bDue : Number.MAX_SAFE_INTEGER);
        }

        const aCreated = Date.parse(String(a.createdAt || ""));
        const bCreated = Date.parse(String(b.createdAt || ""));
        return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
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
    tasks,
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
  const activityRows = data.customerActivity.filter((row) => String(row.customer_id || "").trim() === customerId);
  const taskRows = data.customerTasks.filter((row) => String(row.customer_id || "").trim() === customerId);
  const identifiers = getCustomerIdentifiers({
    customer,
    contacts,
    customerUsers: memberships,
    authUserById,
  });
  const membershipUserIds = new Set(memberships.map((row) => String(row.user_id || "").trim()).filter(Boolean));

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
  const linkedDocuments = buildLinkedCustomerDocuments(data.customerDocuments, {
    accountId: identifiers.accountId,
    userIds: membershipUserIds,
  });
  const lastContactedAt = getLastContactedAt({ customer, activityRows });

  const assignedSalesUserId = firstText(customer.assigned_sales_user_id, customer.owner_user_id);
  const assignedSalesProfile = assignedSalesUserId ? profileById.get(assignedSalesUserId) : null;
  const assignedRouteRepUserId = firstText(customer.assigned_route_rep_user_id);
  const assignedRouteRepProfile = assignedRouteRepUserId ? profileById.get(assignedRouteRepUserId) : null;
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

  const source = firstText(customer.source);
  const importSource = firstText(customer.import_source);
  const isHallOfFlowersLead = normalizeText(source) === "hall_of_flowers" || normalizeText(importSource) === "event_quick_add";
  const isHotLead = deriveHotLeadState(activityRows, taskRows);
  const openTasks = taskRows
    .filter((row) => !CLOSED_TASK_STATUSES.has(normalizeText(row.status)) && !firstText(row.completed_at))
    .sort((a, b) => {
      const aDue = Date.parse(String(firstText(a.due_date) || ""));
      const bDue = Date.parse(String(firstText(b.due_date) || ""));
      if (Number.isFinite(aDue) || Number.isFinite(bDue)) {
        return (Number.isFinite(aDue) ? aDue : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bDue) ? bDue : Number.MAX_SAFE_INTEGER);
      }
      const aCreated = Date.parse(String(firstText(a.created_at) || ""));
      const bCreated = Date.parse(String(firstText(b.created_at) || ""));
      return (Number.isFinite(aCreated) ? aCreated : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bCreated) ? bCreated : Number.MAX_SAFE_INTEGER);
    });
  const referenceNow = Date.now();
  const overdueTaskCount = openTasks.filter((row) => {
    const due = Date.parse(String(firstText(row.due_date) || ""));
    return Number.isFinite(due) && due < referenceNow;
  }).length;
  const nextTaskDueAt = firstText(openTasks[0]?.due_date) || null;
  const latestTaskStatus = firstText(openTasks[0]?.status, taskRows[0]?.status) || null;

  const lastActivityAt = uniqueStrings([
    ...linkedEstimates.map((row) => row.updatedAt || row.createdAt),
    ...linkedOrders.map((row) => row.updatedAt || row.createdAt),
    ...linkedPackaging.map((row) => row.updatedAt || row.createdAt),
    ...linkedDocuments.map((row) => row.updatedAt || row.createdAt),
    ...activityRows.map((row) => firstText(row.created_at)),
    ...taskRows.map((row) => firstText(row.created_at, row.completed_at, row.due_date)),
  ])
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => b.time - a.time)[0]?.value || null;

  return {
    id: customerId,
    name: getCustomerName(customer),
    approvalStatus: getCustomerApprovalStatus(customer),
    archivedAt: firstText(customer.archived_at),
    status: getCustomerStatus(customer),
    stage: firstText(customer.stage),
    source,
    importSource,
    isHallOfFlowersLead,
    isHotLead,
    areaZone: firstText(customer.area_zone),
    territoryCode: firstText(customer.territory_code),
    routeDay: firstText(customer.route_day),
    visitStatus: firstText(customer.visit_status),
    lastVisitAt: firstText(customer.last_visit_at),
    nextVisitDueAt: firstText(customer.next_visit_due_at),
    routePriority: firstNumber(customer.route_priority),
    address1: firstText(customer.address_1),
    address2: firstText(customer.address_2),
    city: firstText(customer.city),
    state: firstText(customer.state),
    postalCode: firstText(customer.postal_code),
    latitude: firstNumber(customer.latitude),
    longitude: firstNumber(customer.longitude),
    geocodeStatus: firstText(customer.geocode_status) as CustomerSummary["geocodeStatus"],
    geocodedAddress: firstText(customer.geocoded_address),
    lastGeocodedAt: firstText(customer.last_geocoded_at, customer.geocoded_at),
    geocodeProvider: firstText(customer.geocode_provider, customer.geocode_source),
    website: firstText(customer.website),
    mainPhone: firstText(customer.main_phone),
    primaryContactEmail: firstText(customer.primary_contact_email),
    assignedSalesUserId,
    assignedSalesName: formatProfileName(assignedSalesProfile),
    assignedSalesEmail: firstText(authUserById.get(assignedSalesUserId || "")?.email),
    assignedRouteRepUserId,
    assignedRouteRepName: formatProfileName(assignedRouteRepProfile),
    assignedRouteRepEmail: firstText(authUserById.get(assignedRouteRepUserId || "")?.email),
    createdAt: firstText(customer.created_at) || null,
    updatedAt: firstText(customer.updated_at) || null,
    openTaskCount: openTasks.length,
    overdueTaskCount,
    hasOpenTask: openTasks.length > 0,
    nextTaskDueAt,
    latestTaskStatus,
    contactCount: contacts.length,
    primaryContacts,
    memberUsers,
    linkedDocuments: linkedDocuments.slice(0, 6),
    counts: {
      estimates: linkedEstimates.length,
      orders: linkedOrders.length,
      packagingSubmissions: linkedPackaging.length,
      documents: linkedDocuments.length,
    },
    hasBeenContacted: Boolean(lastContactedAt),
    lastContactedAt,
    lastActivityAt,
  };
}
