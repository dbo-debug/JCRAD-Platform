import { createAdminClient } from "@/lib/supabase/admin";

type GenericRow = Record<string, unknown>;
type AuthUser = { id: string; email: string | null };
type AdminClient = ReturnType<typeof createAdminClient>;

const WORKSPACE_BATCH_SIZE = 500;
const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);

export type SourceSummary = {
  id: string;
  name: string;
  sourceType: string | null;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  stage: string | null;
  notes: string | null;
  supplyCategories: string[];
  linkedProductIds: string[];
  assignedBuyerUserId: string | null;
  assignedBuyerName: string | null;
  assignedBuyerEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  openTaskCount: number;
  overdueTaskCount: number;
  hasOpenTask: boolean;
  nextTaskDueAt: string | null;
  latestTaskStatus: string | null;
  lastActivityAt: string | null;
};

export type SourceDetail = {
  source: SourceSummary;
  activity: Array<{
    id: string;
    activityType: string;
    summary: string;
    details: Record<string, unknown> | null;
    createdAt: string | null;
    actorName: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    status: string;
    priority: number | null;
    createdAt: string | null;
    completedAt: string | null;
  }>;
};

export type SourceWorkspaceMetrics = {
  totalSources: number;
  activeSources: number;
  withContactEmail: number;
  openTasks: number;
  overdueTasks: number;
};

export type SourceWorkspaceIndexData = {
  sources: SourceSummary[];
  metrics: SourceWorkspaceMetrics;
};

type WorkspaceData = {
  sources: GenericRow[];
  sourceActivity: GenericRow[];
  sourceTasks: GenericRow[];
  profiles: GenericRow[];
  authUsers: AuthUser[];
};

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
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

function formatProfileName(profile: GenericRow | null | undefined): string | null {
  return firstText(profile?.full_name, profile?.company_name, profile?.email);
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

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
        (errorMessage.includes("relation") && errorMessage.includes("does not exist")) ||
        errorMessage.includes("schema cache") ||
        (errorDetails.includes("relation") && errorDetails.includes("does not exist")) ||
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

  const [sources, sourceActivity, sourceTasks, profiles] = await Promise.all([
    fetchAllTableRows({ supabase, table: "sources", orderBy: { column: "updated_at", ascending: false } }),
    fetchAllTableRows({ supabase, table: "source_activity", orderBy: { column: "created_at", ascending: false }, optionalRelation: true }),
    fetchAllTableRows({ supabase, table: "source_tasks", orderBy: { column: "created_at", ascending: false }, optionalRelation: true }),
    fetchAllTableRows({ supabase, table: "profiles", columns: "id, role, company_name" }),
  ]);

  return { sources, sourceActivity, sourceTasks, profiles, authUsers };
}

function buildSourceSummary(args: {
  source: GenericRow;
  data: WorkspaceData;
  profileById: Map<string, GenericRow>;
  authUserById: Map<string, AuthUser>;
}): SourceSummary {
  const sourceId = String(args.source.id || "").trim();
  const activityRows = args.data.sourceActivity.filter((row) => String(row.source_id || "").trim() === sourceId);
  const taskRows = args.data.sourceTasks.filter((row) => String(row.source_id || "").trim() === sourceId);
  const assignedBuyerUserId = firstText(args.source.assigned_buyer_user_id, args.source.owner_user_id, args.source.assigned_sales_user_id);
  const assignedBuyerProfile = assignedBuyerUserId ? args.profileById.get(assignedBuyerUserId) : null;

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

  const now = Date.now();
  const overdueTaskCount = openTasks.filter((row) => {
    const due = Date.parse(String(firstText(row.due_date) || ""));
    return Number.isFinite(due) && due < now;
  }).length;

  const lastActivityAt = [
    firstText(args.source.updated_at, args.source.created_at),
    ...activityRows.map((row) => firstText(row.created_at)),
    ...taskRows.map((row) => firstText(row.completed_at, row.due_date, row.created_at)),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => b.time - a.time)[0]?.value || null;

  return {
    id: sourceId,
    name: firstText(args.source.name, args.source.company_name, args.source.contact_name) || "Unnamed source",
    sourceType: firstText(args.source.source_type),
    companyName: firstText(args.source.company_name),
    contactName: firstText(args.source.contact_name),
    contactEmail: firstText(args.source.contact_email),
    contactPhone: firstText(args.source.contact_phone),
    status: firstText(args.source.status) || "active",
    stage: firstText(args.source.stage),
    notes: firstText(args.source.notes),
    supplyCategories: parseStringList(args.source.supply_categories),
    linkedProductIds: parseStringList(args.source.linked_product_ids),
    assignedBuyerUserId,
    assignedBuyerName: formatProfileName(assignedBuyerProfile),
    assignedBuyerEmail: firstText(args.authUserById.get(assignedBuyerUserId || "")?.email),
    createdAt: firstText(args.source.created_at),
    updatedAt: firstText(args.source.updated_at),
    openTaskCount: openTasks.length,
    overdueTaskCount,
    hasOpenTask: openTasks.length > 0,
    nextTaskDueAt: firstText(openTasks[0]?.due_date),
    latestTaskStatus: firstText(openTasks[0]?.status, taskRows[0]?.status),
    lastActivityAt,
  };
}

export async function loadSourceWorkspaceIndex(): Promise<SourceWorkspaceIndexData> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);
  const sources = data.sources.map((source) => buildSourceSummary({ source, data, profileById, authUserById }));

  return {
    sources,
    metrics: {
      totalSources: sources.length,
      activeSources: sources.filter((source) => normalizeText(source.status) === "active").length,
      withContactEmail: sources.filter((source) => Boolean(source.contactEmail)).length,
      openTasks: sources.reduce((total, source) => total + source.openTaskCount, 0),
      overdueTasks: sources.reduce((total, source) => total + source.overdueTaskCount, 0),
    },
  };
}

export async function loadSourceWorkspaceDetail(sourceId: string): Promise<SourceDetail | null> {
  const data = await loadWorkspaceData();
  const profileById = getProfileMap(data.profiles);
  const authUserById = getAuthUserMap(data.authUsers);
  const source = data.sources.find((row) => String(row.id || "").trim() === sourceId);
  if (!source) return null;

  const tasks = data.sourceTasks
    .filter((row) => String(row.source_id || "").trim() === sourceId)
    .map((row) => {
      const assignee = profileById.get(String(row.assigned_user_id || ""));
      return {
        id: String(row.id || ""),
        title: firstText(row.title) || "Untitled task",
        dueDate: firstText(row.due_date),
        assignedUserId: firstText(row.assigned_user_id),
        assignedUserName: formatProfileName(assignee),
        status: firstText(row.status) || "open",
        priority: firstNumber(row.priority),
        createdAt: firstText(row.created_at),
        completedAt: firstText(row.completed_at),
      };
    })
    .sort((a, b) => {
      const aComplete = a.completedAt ? 1 : 0;
      const bComplete = b.completedAt ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;
      const aDue = Date.parse(String(a.dueDate || ""));
      const bDue = Date.parse(String(b.dueDate || ""));
      if (Number.isFinite(aDue) || Number.isFinite(bDue)) {
        return (Number.isFinite(aDue) ? aDue : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bDue) ? bDue : Number.MAX_SAFE_INTEGER);
      }
      const aCreated = Date.parse(String(a.createdAt || ""));
      const bCreated = Date.parse(String(b.createdAt || ""));
      return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
    });

  const activity = data.sourceActivity
    .filter((row) => String(row.source_id || "").trim() === sourceId)
    .map((row) => {
      const actor = profileById.get(String(row.actor_user_id || ""));
      return {
        id: String(row.id || ""),
        activityType: firstText(row.activity_type) || "activity",
        summary: firstText(row.summary, row.activity_type) || "Activity",
        details: row.details && typeof row.details === "object" && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : null,
        createdAt: firstText(row.created_at),
        actorName: formatProfileName(actor),
      };
    })
    .sort((a, b) => {
      const aTime = Date.parse(String(a.createdAt || ""));
      const bTime = Date.parse(String(b.createdAt || ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });

  return {
    source: buildSourceSummary({ source, data, profileById, authUserById }),
    activity,
    tasks,
  };
}
