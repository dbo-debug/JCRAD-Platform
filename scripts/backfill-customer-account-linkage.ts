import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

type GenericRow = Record<string, unknown>;

type CustomerIdentity = {
  customerId: string;
  companyName: string | null;
  primaryContactEmail: string | null;
};

type AuthUser = {
  id: string;
  email: string | null;
};

type CandidateMatch =
  | { kind: "company"; customerId: string }
  | { kind: "email"; customerId: string }
  | { kind: "user"; customerId: string }
  | { kind: "already"; customerId: string }
  | { kind: "ambiguous" }
  | { kind: "unmatched" };

type TableStats = {
  alreadyLinked: number;
  linkedByCompany: number;
  linkedByEmail: number;
  linkedByUser: number;
  ambiguous: number;
  unmatched: number;
  changed: number;
};

type CustomerUserStats = {
  alreadyLinked: number;
  linkedByCompany: number;
  linkedByEmail: number;
  linkedByUser: number;
  ambiguous: number;
  unmatched: number;
  changed: number;
};

type CustomerUsersRow = {
  id?: string;
  customer_id: string;
  user_id: string;
  membership_role?: string | null;
  status?: string | null;
  is_primary?: boolean | null;
};

type RuntimeConfig = {
  dryRun: boolean;
  apply: boolean;
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function parseArgs(argv: string[]): RuntimeConfig {
  const args = new Set(argv);
  const apply = args.has("--apply");
  const dryRun = apply ? false : true;
  return { dryRun, apply };
}

function loadLocalEnv() {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "web", ".env.local"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".env.local"),
  ];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function createAdminSupabase() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function createEmptyStats(): TableStats {
  return {
    alreadyLinked: 0,
    linkedByCompany: 0,
    linkedByEmail: 0,
    linkedByUser: 0,
    ambiguous: 0,
    unmatched: 0,
    changed: 0,
  };
}

function toMapOfSets(rows: Array<{ key: string | null; customerId: string }>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.key) continue;
    const existing = map.get(row.key) || new Set<string>();
    existing.add(row.customerId);
    map.set(row.key, existing);
  }
  return map;
}

function getUniqueMap(source: Map<string, Set<string>>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, ids] of source.entries()) {
    if (ids.size === 1) out.set(key, Array.from(ids)[0]);
  }
  return out;
}

function getAmbiguousKeys(source: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  for (const [key, ids] of source.entries()) {
    if (ids.size > 1) out.add(key);
  }
  return out;
}

function getString(row: GenericRow, key: string): string {
  return String(row[key] || "").trim();
}

function isCustomerProfile(row: GenericRow): boolean {
  const role = normalizeText(row.role);
  return role === "customer" || role === null;
}

async function loadAllData() {
  const supabase = createAdminSupabase();
  const authUsers: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = (data?.users || []).map((user) => ({
      id: String(user.id || ""),
      email: normalizeText(user.email),
    }));
    authUsers.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }

  const [
    customersRes,
    customerContactsRes,
    customerUsersRes,
    profilesRes,
    estimatesRes,
    ordersRes,
    packagingRes,
    customerDocumentsRes,
  ] = await Promise.all([
    supabase.from("customers").select("id, company_name, primary_contact_email"),
    supabase.from("customer_contacts").select("id, customer_id, email"),
    supabase.from("customer_users").select("id, customer_id, user_id, membership_role, status, is_primary"),
    supabase.from("profiles").select("id, role, company_name"),
    supabase.from("estimates").select("id, customer_account_id, customer_name, customer_email"),
    supabase.from("orders").select("id, customer_account_id, customer_id"),
    supabase.from("packaging_submissions").select("id, customer_account_id, customer_name, customer_email"),
    supabase.from("customer_documents").select("id, user_id, customer_account_id"),
  ]);

  const responses = [
    customersRes,
    customerContactsRes,
    customerUsersRes,
    profilesRes,
    estimatesRes,
    ordersRes,
    packagingRes,
    customerDocumentsRes,
  ];
  const error = responses.find((response) => response.error)?.error;
  if (error) throw new Error(error.message);

  return {
    supabase,
    customers: (customersRes.data || []) as GenericRow[],
    customerContacts: (customerContactsRes.data || []) as GenericRow[],
    customerUsers: (customerUsersRes.data || []) as GenericRow[],
    profiles: (profilesRes.data || []) as GenericRow[],
    authUsers,
    estimates: (estimatesRes.data || []) as GenericRow[],
    orders: (ordersRes.data || []) as GenericRow[],
    packagingSubmissions: (packagingRes.data || []) as GenericRow[],
    customerDocuments: (customerDocumentsRes.data || []) as GenericRow[],
  };
}

function buildCustomerIndexes(data: {
  customers: GenericRow[];
  customerContacts: GenericRow[];
  customerUsers: GenericRow[];
  profiles: GenericRow[];
  authUsers: AuthUser[];
}) {
  const profileById = new Map<string, GenericRow>();
  for (const profile of data.profiles) {
    const id = getString(profile, "id");
    if (id) profileById.set(id, profile);
  }
  const authUserById = new Map<string, AuthUser>();
  for (const user of data.authUsers) {
    if (user.id) authUserById.set(user.id, user);
  }

  const customerIdentities: CustomerIdentity[] = data.customers.map((row) => ({
    customerId: getString(row, "id"),
    companyName: normalizeText(row.company_name),
    primaryContactEmail: normalizeText(row.primary_contact_email),
  }));

  const companyRows: Array<{ key: string | null; customerId: string }> = [];
  const emailRows: Array<{ key: string | null; customerId: string }> = [];

  for (const customer of customerIdentities) {
    companyRows.push({ key: customer.companyName, customerId: customer.customerId });
    emailRows.push({ key: customer.primaryContactEmail, customerId: customer.customerId });
  }

  for (const contact of data.customerContacts) {
    const customerId = getString(contact, "customer_id");
    if (!customerId) continue;
    emailRows.push({ key: normalizeText(contact.email), customerId });
  }

  for (const membership of data.customerUsers) {
    const customerId = getString(membership, "customer_id");
    const userId = getString(membership, "user_id");
    const authUser = authUserById.get(userId);
    if (!customerId || !authUser) continue;
    emailRows.push({ key: normalizeText(authUser.email), customerId });
  }

  const companyAll = toMapOfSets(companyRows);
  const emailAll = toMapOfSets(emailRows);

  return {
    profileById,
    uniqueCompany: getUniqueMap(companyAll),
    ambiguousCompany: getAmbiguousKeys(companyAll),
    uniqueEmail: getUniqueMap(emailAll),
    ambiguousEmail: getAmbiguousKeys(emailAll),
  };
}

function resolveCompanyEmailMatch(
  row: GenericRow,
  indexes: {
    uniqueCompany: Map<string, string>;
    ambiguousCompany: Set<string>;
    uniqueEmail: Map<string, string>;
    ambiguousEmail: Set<string>;
  },
  fields?: {
    companyField?: string | null;
    emailField?: string | null;
  }
): CandidateMatch {
  const existing = getString(row, "customer_account_id");
  if (existing) return { kind: "already", customerId: existing };

  const companyField = fields?.companyField || null;
  const emailField = fields?.emailField || null;

  const companyKey = companyField ? normalizeText(row[companyField]) : null;
  if (companyKey) {
    if (indexes.ambiguousCompany.has(companyKey)) return { kind: "ambiguous" };
    const companyCustomerId = indexes.uniqueCompany.get(companyKey);
    if (companyCustomerId) return { kind: "company", customerId: companyCustomerId };
  }

  const emailKey = emailField ? normalizeText(row[emailField]) : null;
  if (emailKey) {
    if (indexes.ambiguousEmail.has(emailKey)) return { kind: "ambiguous" };
    const emailCustomerId = indexes.uniqueEmail.get(emailKey);
    if (emailCustomerId) return { kind: "email", customerId: emailCustomerId };
  }

  return { kind: "unmatched" };
}

function resolveDocumentUserMatch(
  row: GenericRow,
  uniqueUserToCustomer: Map<string, string>,
  ambiguousUserIds: Set<string>
): CandidateMatch {
  const existing = getString(row, "customer_account_id");
  if (existing) return { kind: "already", customerId: existing };

  const userId = getString(row, "user_id");
  if (!userId) return { kind: "unmatched" };
  if (ambiguousUserIds.has(userId)) return { kind: "ambiguous" };
  const customerId = uniqueUserToCustomer.get(userId);
  if (customerId) return { kind: "user", customerId };
  return { kind: "unmatched" };
}

function recordStat(stats: TableStats, match: CandidateMatch, changed: boolean) {
  if (match.kind === "already") stats.alreadyLinked += 1;
  if (match.kind === "company") stats.linkedByCompany += 1;
  if (match.kind === "email") stats.linkedByEmail += 1;
  if (match.kind === "user") stats.linkedByUser += 1;
  if (match.kind === "ambiguous") stats.ambiguous += 1;
  if (match.kind === "unmatched") stats.unmatched += 1;
  if (changed) stats.changed += 1;
}

async function updateRows(
  supabase: ReturnType<typeof createAdminSupabase>,
  table: "estimates" | "orders" | "packaging_submissions" | "customer_documents",
  updates: Array<{ id: string; customer_account_id: string }>
) {
  for (const update of updates) {
    const { error } = await supabase
      .from(table)
      .update({ customer_account_id: update.customer_account_id })
      .eq("id", update.id)
      .is("customer_account_id", null);
    if (error) throw new Error(`${table} ${update.id}: ${error.message}`);
  }
}

async function backfillCustomerUsers(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  profiles: GenericRow[];
  existingCustomerUsers: GenericRow[];
  uniqueCompany: Map<string, string>;
  ambiguousCompany: Set<string>;
  apply: boolean;
}) {
  const stats: CustomerUserStats = createEmptyStats();
  const existingByUserId = new Map<string, Set<string>>();

  for (const row of args.existingCustomerUsers) {
    const userId = getString(row, "user_id");
    const customerId = getString(row, "customer_id");
    if (!userId || !customerId) continue;
    const existing = existingByUserId.get(userId) || new Set<string>();
    existing.add(customerId);
    existingByUserId.set(userId, existing);
  }

  const inserts: CustomerUsersRow[] = [];

  for (const profile of args.profiles) {
    if (!isCustomerProfile(profile)) continue;

    const userId = getString(profile, "id");
    if (!userId) continue;

    const companyKey = normalizeText(profile.company_name);
    const existingMemberships = existingByUserId.get(userId);

    if (existingMemberships && existingMemberships.size > 0) {
      stats.alreadyLinked += 1;
      continue;
    }

    if (!companyKey) {
      stats.unmatched += 1;
      continue;
    }

    if (args.ambiguousCompany.has(companyKey)) {
      stats.ambiguous += 1;
      continue;
    }

    const customerId = args.uniqueCompany.get(companyKey);
    if (!customerId) {
      stats.unmatched += 1;
      continue;
    }

    stats.linkedByCompany += 1;
    inserts.push({
      customer_id: customerId,
      user_id: userId,
      membership_role: "member",
      status: "active",
      is_primary: false,
    });
  }

  if (args.apply && inserts.length > 0) {
    for (const insert of inserts) {
      const { error } = await args.supabase.from("customer_users").insert(insert);
      if (error) throw new Error(`customer_users insert failed for user ${insert.user_id}: ${error.message}`);
      stats.changed += 1;
    }
  }

  return stats;
}

function buildUserLinkage(customerUsers: GenericRow[]) {
  const userToCustomers = new Map<string, Set<string>>();
  for (const row of customerUsers) {
    const userId = getString(row, "user_id");
    const customerId = getString(row, "customer_id");
    if (!userId || !customerId) continue;
    const existing = userToCustomers.get(userId) || new Set<string>();
    existing.add(customerId);
    userToCustomers.set(userId, existing);
  }

  return {
    uniqueUserToCustomer: getUniqueMap(userToCustomers),
    ambiguousUserIds: getAmbiguousKeys(userToCustomers),
  };
}

async function backfillTable(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  table: "estimates" | "orders" | "packaging_submissions";
  rows: GenericRow[];
  indexes: {
    uniqueCompany: Map<string, string>;
    ambiguousCompany: Set<string>;
    uniqueEmail: Map<string, string>;
    ambiguousEmail: Set<string>;
  };
  userLinkage?: {
    uniqueUserToCustomer: Map<string, string>;
    ambiguousUserIds: Set<string>;
  };
  fields?: {
    companyField?: string | null;
    emailField?: string | null;
    userField?: string | null;
  };
  apply: boolean;
}) {
  const stats = createEmptyStats();
  const updates: Array<{ id: string; customer_account_id: string }> = [];

  for (const row of args.rows) {
    let match = resolveCompanyEmailMatch(row, args.indexes, args.fields);
    if (match.kind === "unmatched" && args.fields?.userField && args.userLinkage) {
      match = resolveDocumentUserMatch(
        { id: row.id, user_id: row[args.fields.userField], customer_account_id: row.customer_account_id },
        args.userLinkage.uniqueUserToCustomer,
        args.userLinkage.ambiguousUserIds
      );
    }
    const shouldUpdate = args.apply && (match.kind === "company" || match.kind === "email" || match.kind === "user");
    if (shouldUpdate && "customerId" in match) {
      updates.push({ id: getString(row, "id"), customer_account_id: match.customerId });
    }
    recordStat(stats, match, shouldUpdate);
  }

  if (args.apply && updates.length > 0) {
    await updateRows(args.supabase, args.table, updates);
  }

  return stats;
}

async function backfillDocuments(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  rows: GenericRow[];
  uniqueUserToCustomer: Map<string, string>;
  ambiguousUserIds: Set<string>;
  apply: boolean;
}) {
  const stats = createEmptyStats();
  const updates: Array<{ id: string; customer_account_id: string }> = [];

  for (const row of args.rows) {
    const match = resolveDocumentUserMatch(row, args.uniqueUserToCustomer, args.ambiguousUserIds);
    const shouldUpdate = args.apply && match.kind === "user";
    if (shouldUpdate) {
      updates.push({ id: getString(row, "id"), customer_account_id: match.customerId });
    }
    recordStat(stats, match, shouldUpdate);
  }

  if (args.apply && updates.length > 0) {
    await updateRows(args.supabase, "customer_documents", updates);
  }

  return stats;
}

function printStats(label: string, stats: TableStats | CustomerUserStats) {
  console.log(`\n${label}`);
  console.log(`  already linked: ${stats.alreadyLinked}`);
  console.log(`  linked by company: ${stats.linkedByCompany}`);
  console.log(`  linked by email: ${stats.linkedByEmail}`);
  console.log(`  linked by user: ${stats.linkedByUser}`);
  console.log(`  ambiguous: ${stats.ambiguous}`);
  console.log(`  unmatched: ${stats.unmatched}`);
  console.log(`  changed: ${stats.changed}`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log(config.apply ? "Running backfill in APPLY mode." : "Running backfill in DRY-RUN mode.");

  const data = await loadAllData();
  const indexes = buildCustomerIndexes(data);

  const customerUserStats = await backfillCustomerUsers({
    supabase: data.supabase,
    profiles: data.profiles,
    existingCustomerUsers: data.customerUsers,
    uniqueCompany: indexes.uniqueCompany,
    ambiguousCompany: indexes.ambiguousCompany,
    apply: config.apply,
  });

  const refreshedCustomerUsers =
    config.apply && customerUserStats.changed > 0
      ? ((await data.supabase.from("customer_users").select("id, customer_id, user_id, membership_role, status, is_primary")).data || []) as GenericRow[]
      : data.customerUsers;

  const refreshedIndexes = buildCustomerIndexes({
    customers: data.customers,
    customerContacts: data.customerContacts,
    customerUsers: refreshedCustomerUsers,
    profiles: data.profiles,
    authUsers: data.authUsers,
  });

  const userLinkage = buildUserLinkage(refreshedCustomerUsers);

  const estimatesStats = await backfillTable({
    supabase: data.supabase,
    table: "estimates",
    rows: data.estimates,
    indexes: refreshedIndexes,
    fields: {
      companyField: "customer_name",
      emailField: "customer_email",
    },
    apply: config.apply,
  });

  const ordersStats = await backfillTable({
    supabase: data.supabase,
    table: "orders",
    rows: data.orders,
    indexes: refreshedIndexes,
    userLinkage,
    fields: {
      userField: "customer_id",
    },
    apply: config.apply,
  });

  const packagingStats = await backfillTable({
    supabase: data.supabase,
    table: "packaging_submissions",
    rows: data.packagingSubmissions,
    indexes: refreshedIndexes,
    fields: {
      companyField: "customer_name",
      emailField: "customer_email",
    },
    apply: config.apply,
  });

  const documentsStats = await backfillDocuments({
    supabase: data.supabase,
    rows: data.customerDocuments,
    uniqueUserToCustomer: userLinkage.uniqueUserToCustomer,
    ambiguousUserIds: userLinkage.ambiguousUserIds,
    apply: config.apply,
  });

  printStats("customer_users", customerUserStats);
  printStats("estimates", estimatesStats);
  printStats("orders", ordersStats);
  printStats("packaging_submissions", packagingStats);
  printStats("customer_documents", documentsStats);
}

main().catch((error) => {
  console.error("\nBackfill failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
