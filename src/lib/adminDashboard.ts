import type { ActionRowItem, ActivityListItem, QueueSnapshotItem, ShortcutRailItem, WorkflowCardProps } from "@/components/admin/dashboard/DashboardPrimitives";
import type { CustomerApprovalQueueItem } from "@/lib/customerApprovals";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import { normalizePackagingCategory, type PackagingCategory } from "@/lib/packaging/category";
import { getRouteEligibilityReason, isRouteEligibleCustomer } from "@/lib/routeEligibility";
import type { SavedRouteSummary } from "@/lib/routeWorkspace";

export type EstimateRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_name: string | null;
  customer_email: string | null;
  packaging_review_pending: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrderRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

export type PackagingSubmissionRow = {
  id: string;
  estimate_id: string | null;
  category: string | null;
  status: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
};

export type PlatformEventRow = {
  id: string;
  event_type: string | null;
  user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type CustomerTaskRow = {
  id: string;
  customer_id: string | null;
  title: string | null;
  due_date: string | null;
  status: string | null;
  assigned_user_id: string | null;
};

export type StaffDashboardContext = {
  userId: string;
  role: "admin" | "sales";
};

type AdminDashboardBuildArgs = {
  staff: StaffDashboardContext;
  referenceNow: number;
  estimates: EstimateRow[];
  orders: OrderRow[];
  submissions: PackagingSubmissionRow[];
  platformEvents: PlatformEventRow[];
  pendingStopsCount: number;
  customerTasks: CustomerTaskRow[];
  customers: CustomerSummary[];
  savedRoutes: SavedRouteSummary[];
  approvalQueue: CustomerApprovalQueueItem[];
  approvalStatusCounts: {
    pending: number;
    docsLinked: number;
    followUp: number;
  };
};

type DashboardTaskItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  ctaLabel: string;
};

type DashboardRouteItem = {
  id: string;
  name: string;
  detail: string;
  status: string;
  href: string;
  ctaLabel: string;
};

type DashboardCustomerItem = {
  id: string;
  name: string;
  detail: string;
  href: string;
  ctaLabel: string;
};

export type AdminDashboardViewModel = {
  role: "admin" | "sales";
  shortcuts: ShortcutRailItem[];
  activeRoutes: DashboardRouteItem[];
  blockedCustomers: DashboardCustomerItem[];
  openTaskItems: DashboardTaskItem[];
  accountActivityItems: DashboardCustomerItem[];
  recentPendingOrders: DashboardCustomerItem[];
  platformActivityItems: ActivityListItem[];
  packagingByCategory: Map<PackagingCategory, number>;
  counts: {
    routeReadyAccounts: number;
    blockedByGeocode: number;
    pendingStops: number;
    activeRoutes: number;
    routesThisWeek: number;
    unassignedRoutes: number;
    openTasks: number;
    overdueTasks: number;
    unassignedTasks: number;
    customersNeedingFollowUp: number;
    pendingOrders: number;
    draftEstimates: number;
    hotLeads: number;
    myAccounts: number;
    myHotLeads: number;
    approvalQueue: number;
    approvalDocsLinked: number;
    packagingPending: number;
    packagingApproved: number;
    packagingRejected: number;
  };
  admin?: {
    workflowCards: WorkflowCardProps[];
    actionItems: ActionRowItem[];
    bottleneckSnapshots: QueueSnapshotItem[];
    hrefs: {
      blockedCleanup: string;
      teamWorkload: string;
    };
  };
  sales?: {
    workflowCards: WorkflowCardProps[];
    actionItems: ActionRowItem[];
    hrefs: {
      assignedTasks: string;
      overdueTasks: string;
      routeQueue: string;
      customerWatchlist: string;
    };
  };
};

const CLOSED_ORDER_STATUSES = new Set(["fulfilled", "completed", "cancelled", "rejected", "closed"]);
const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SHORTCUT_CARDS: ReadonlyArray<(ShortcutRailItem & { adminOnly?: boolean })> = [
  {
    title: "Customers",
    description: "CRM records, segments, and account cleanup.",
    href: "/workspace/customers",
  },
  {
    title: "Routes",
    description: "Planning, route queue, and runner handoff.",
    href: "/workspace/routes",
  },
  {
    title: "Tasks",
    description: "Follow-up work across accounts and field execution.",
    href: "/workspace/tasks",
  },
  {
    title: "Orders",
    description: "Pending order progression and review.",
    href: "/admin/orders",
  },
  {
    title: "Menu",
    description: "Commercial menu and estimate entry path.",
    href: "/menu",
  },
  {
    title: "Packaging",
    description: "Packaging operations and catalog maintenance.",
    href: "/admin/packaging",
    adminOnly: true,
  },
] as const;

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  return new Date(parsed).toLocaleDateString();
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "unknown time";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "unknown time";
  const diffMs = Date.now() - ms;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatRouteDateLabel(routeDate: string | null): string {
  if (!routeDate) return "No date";
  const parsed = Date.parse(routeDate);
  if (!Number.isFinite(parsed)) return routeDate;
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getPendingOrderCount(rows: OrderRow[]): number {
  return rows.reduce((count, row) => {
    const status = normalizeStatus(row.status) || "pending";
    return CLOSED_ORDER_STATUSES.has(status) ? count : count + 1;
  }, 0);
}

function eventLabel(eventTypeRaw: string | null): string {
  const eventType = normalizeStatus(eventTypeRaw);
  if (eventType === "user_signup") return "User signup";
  if (eventType === "user_login") return "User login";
  if (eventType === "estimate_created") return "Estimate created";
  if (eventType === "estimate_line_added") return "Estimate line added";
  if (eventType === "estimate_add_line_failed") return "Estimate add-line failed";
  if (eventType === "order_requested") return "Order requested";
  return eventType || "Platform event";
}

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== "object") return "";
  const preferredKeys = ["estimate_id", "order_id", "offer_id", "mode", "line_count", "error"];
  const parts: string[] = [];
  for (const key of preferredKeys) {
    const value = metadata[key];
    if (value == null || value === "") continue;
    const display = String(value);
    parts.push(`${key}: ${display.length > 120 ? `${display.slice(0, 119)}...` : display}`);
  }
  return parts.join(" • ");
}

function sortByNewest<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => {
    const leftMs = Date.parse(String(getDate(left) || ""));
    const rightMs = Date.parse(String(getDate(right) || ""));
    const safeLeft = Number.isFinite(leftMs) ? leftMs : 0;
    const safeRight = Number.isFinite(rightMs) ? rightMs : 0;
    return safeRight - safeLeft;
  });
}

function getRoutesThisWeek(routes: SavedRouteSummary[], referenceNow: number) {
  return routes.filter((route) => {
    const ms = Date.parse(String(route.routeDate || ""));
    return Number.isFinite(ms) && ms >= referenceNow && ms < referenceNow + ONE_WEEK_MS;
  });
}

function getNextRoute(routes: SavedRouteSummary[], referenceNow: number) {
  const active = routes.find((route) => ["assigned", "in_progress"].includes(normalizeStatus(route.status)));
  if (active) return active;

  return [...routes]
    .filter((route) => Number.isFinite(Date.parse(String(route.routeDate || ""))))
    .sort((left, right) => {
      const leftDiff = Math.abs(Date.parse(String(left.routeDate || "")) - referenceNow);
      const rightDiff = Math.abs(Date.parse(String(right.routeDate || "")) - referenceNow);
      return leftDiff - rightDiff;
    })[0] || null;
}

function isTaskOverdue(task: Pick<CustomerTaskRow, "due_date" | "status">, referenceNow: number) {
  if (CLOSED_TASK_STATUSES.has(normalizeStatus(task.status))) return false;
  const due = Date.parse(String(task.due_date || ""));
  return Number.isFinite(due) && due < referenceNow;
}

function taskViewHref(view: "open" | "overdue" | "upcoming" | "completed") {
  return `/workspace/tasks?view=${view}`;
}

function routeCleanupHref() {
  return "/workspace/routes/run?coordStatus=needs_coords&territoryFocus=cleanup&view=list";
}

function focusedRouteQueueHref() {
  return "/workspace/routes/run?territoryFocus=due_heavy&view=list";
}

function routeRunnerHref(routeId?: string | null) {
  return routeId ? `/workspace/routes/run?routeId=${routeId}` : "/workspace/routes";
}

function customerHotLeadHref() {
  return "/workspace/customers?hotLead=hot&sort=activity_desc";
}

function customerFollowUpHref() {
  return "/workspace/customers?taskState=overdue_task&sort=activity_desc";
}

function customerPipelineHref() {
  return "/workspace/customers?savedView=pipeline&hotLead=hot&sort=activity_desc";
}

function approvalQueueHref() {
  return "/workspace/customers/approvals";
}

function orderQueueHref() {
  return "/admin/orders";
}

function packagingQueueHref() {
  return "/admin/packaging/submissions";
}

export function buildAdminDashboardViewModel(args: AdminDashboardBuildArgs): AdminDashboardViewModel {
  const isAdmin = args.staff.role === "admin";
  const routeReadyAccounts = args.customers.filter((customer) => isRouteEligibleCustomer(customer));
  const blockedByGeocode = args.customers.filter((customer) => getRouteEligibilityReason(customer) !== null);
  const activeRoutes = args.savedRoutes.filter((route) => ["assigned", "in_progress"].includes(normalizeStatus(route.status)));
  const routesThisWeek = getRoutesThisWeek(args.savedRoutes, args.referenceNow);
  const unassignedRoutes = args.savedRoutes.filter((route) => !route.assignedUserId);
  const nextRoute = getNextRoute(args.savedRoutes, args.referenceNow);

  const openTasks = args.customerTasks.filter((task) => !CLOSED_TASK_STATUSES.has(normalizeStatus(task.status)));
  const overdueTaskCount = openTasks.filter((task) => isTaskOverdue(task, args.referenceNow)).length;
  const unassignedTaskCount = openTasks.filter((task) => !String(task.assigned_user_id || "").trim()).length;
  const customersNeedingFollowUp = new Set(openTasks.map((task) => String(task.customer_id || "").trim()).filter(Boolean)).size;

  const draftEstimates = args.estimates.filter((row) => {
    const status = normalizeStatus(row.status);
    return !status || status === "draft";
  });
  const pendingOrdersCount = getPendingOrderCount(args.orders);
  const recentPendingOrders = args.orders.filter((row) => !CLOSED_ORDER_STATUSES.has(normalizeStatus(row.status))).slice(0, 5);

  const packagingPending = args.submissions.filter((row) => {
    const status = normalizeStatus(row.status);
    return !status || status === "pending";
  });
  const packagingApproved = args.submissions.filter((row) => normalizeStatus(row.status) === "approved");
  const packagingRejected = args.submissions.filter((row) => normalizeStatus(row.status) === "rejected");

  const packagingByCategory = new Map<PackagingCategory, number>();
  for (const category of ["flower", "pre_roll", "vape", "concentrate"] as PackagingCategory[]) {
    packagingByCategory.set(category, 0);
  }
  for (const row of packagingPending) {
    const category = normalizePackagingCategory(row.category);
    if (!category) continue;
    packagingByCategory.set(category, Number(packagingByCategory.get(category) || 0) + 1);
  }

  const hotLeads = sortByNewest(
    args.customers.filter((customer) => customer.isHotLead && !customer.archivedAt),
    (customer) => customer.lastActivityAt || customer.updatedAt || customer.createdAt
  );
  const myAccounts = args.customers.filter(
    (customer) =>
      !customer.archivedAt &&
      (customer.assignedSalesUserId === args.staff.userId || customer.assignedRouteRepUserId === args.staff.userId)
  );
  const myHotLeads = sortByNewest(
    myAccounts.filter((customer) => customer.isHotLead),
    (customer) => customer.lastActivityAt || customer.updatedAt || customer.createdAt
  );
  const myAccountActivity = sortByNewest(
    myAccounts.filter((customer) => customer.lastActivityAt || customer.updatedAt || customer.createdAt),
    (customer) => customer.lastActivityAt || customer.updatedAt || customer.createdAt
  );

  const visibleShortcuts = SHORTCUT_CARDS.filter((card) => !card.adminOnly || isAdmin);
  const blockedCleanupHref = routeCleanupHref();
  const overdueTasksHref = taskViewHref("overdue");
  const openTasksHref = taskViewHref("open");
  const focusedCustomerWatchHref = customerFollowUpHref();
  const hotLeadHref = customerHotLeadHref();
  const pipelineHref = customerPipelineHref();
  const routesQueueHref = focusedRouteQueueHref();
  const nextRouteHref = nextRoute ? routeRunnerHref(nextRoute.id) : "/workspace/routes";
  const nextRouteDescription = nextRoute
    ? `${nextRoute.name} is next, with ${args.pendingStopsCount} stops still waiting in queue.`
    : `${args.pendingStopsCount} pending stops are ready for route planning or assignment.`;
  const nextRouteQueueDetail = nextRoute
    ? `${nextRoute.name} is the next route in your day, with ${nextRoute.stopCount} planned stops.`
    : `${args.pendingStopsCount} pending stops are ready for route planning or assignment.`;
  const nextRouteCtaLabel = nextRoute ? "Open next route" : "Open routes workspace";

  const platformActivityItems: ActivityListItem[] = args.platformEvents.map((row) => ({
    id: row.id,
    title: eventLabel(row.event_type),
    timestamp: formatRelativeTime(row.created_at),
    byline: `${row.user_email || "Unknown user"} • ${formatDate(row.created_at)}`,
    detail: metadataSummary(row.metadata) || undefined,
  }));

  const activeRouteItems: DashboardRouteItem[] = activeRoutes.slice(0, 4).map((route) => ({
    id: route.id,
    name: route.name,
    detail: `${formatRouteDateLabel(route.routeDate)} • ${route.assignedUserLabel || "Unassigned rep"} • ${route.stopCount} stops`,
    status: route.status,
    href: routeRunnerHref(route.id),
    ctaLabel: "Open route runner",
  }));

  const blockedCustomers: DashboardCustomerItem[] = blockedByGeocode.slice(0, 6).map((customer) => ({
    id: customer.id,
    name: customer.name,
    detail: `${getRouteEligibilityReason(customer) || "Needs routing cleanup"} • ${customer.city || "Unknown city"}`,
    href: blockedCleanupHref,
    ctaLabel: "Open cleanup queue",
  }));

  const openTaskItems: DashboardTaskItem[] = openTasks.slice(0, 5).map((task) => ({
    id: task.id,
    title: task.title || "Untitled task",
    detail: `${normalizeStatus(task.status) || "open"} • due ${formatDate(task.due_date)}`,
    href: isTaskOverdue(task, args.referenceNow) ? overdueTasksHref : openTasksHref,
    ctaLabel: isTaskOverdue(task, args.referenceNow) ? "Open overdue queue" : "Open assigned task queue",
  }));

  const accountActivityItems: DashboardCustomerItem[] = myAccountActivity.slice(0, 4).map((customer) => ({
    id: customer.id,
    name: customer.name,
    detail: `${customer.isHotLead ? "Hot lead" : customer.stage || customer.status || "Account"} • ${customer.openTaskCount} open tasks • ${formatRelativeTime(customer.lastActivityAt || customer.updatedAt || customer.createdAt)}`,
    href: customer.isHotLead ? hotLeadHref : focusedCustomerWatchHref,
    ctaLabel: customer.isHotLead ? "Open hot lead queue" : "Open follow-up accounts",
  }));

  const recentPendingOrderItems: DashboardCustomerItem[] = recentPendingOrders.slice(0, 3).map((order) => ({
    id: order.id,
    name: order.customer_name || order.customer_email || "Order",
    detail: `${normalizeStatus(order.status) || "pending"} • ${formatDate(order.created_at)}`,
    href: orderQueueHref(),
    ctaLabel: "Open order queue",
  }));

  const counts = {
    routeReadyAccounts: routeReadyAccounts.length,
    blockedByGeocode: blockedByGeocode.length,
    pendingStops: args.pendingStopsCount,
    activeRoutes: activeRoutes.length,
    routesThisWeek: routesThisWeek.length,
    unassignedRoutes: unassignedRoutes.length,
    openTasks: openTasks.length,
    overdueTasks: overdueTaskCount,
    unassignedTasks: unassignedTaskCount,
    customersNeedingFollowUp,
    pendingOrders: pendingOrdersCount,
    draftEstimates: draftEstimates.length,
    hotLeads: hotLeads.length,
    myAccounts: myAccounts.length,
    myHotLeads: myHotLeads.length,
    approvalQueue: args.approvalQueue.length,
    approvalDocsLinked: args.approvalStatusCounts.docsLinked,
    packagingPending: packagingPending.length,
    packagingApproved: packagingApproved.length,
    packagingRejected: packagingRejected.length,
  };

  const model: AdminDashboardViewModel = {
    role: args.staff.role,
    shortcuts: visibleShortcuts,
    activeRoutes: activeRouteItems,
    blockedCustomers,
    openTaskItems,
    accountActivityItems,
    recentPendingOrders: recentPendingOrderItems,
    platformActivityItems,
    packagingByCategory,
    counts,
  };

  if (isAdmin) {
    const driftingWorkCount = blockedByGeocode.length + unassignedTaskCount + unassignedRoutes.length;
    const bottleneckCount = pendingOrdersCount + packagingPending.length + args.approvalQueue.length;
    model.admin = {
      workflowCards: [
        {
          title: "Intervene on drifting work",
          value: driftingWorkCount,
          href: unassignedTaskCount > 0 ? openTasksHref : routesQueueHref,
          description: `${unassignedTaskCount} follow-ups and ${unassignedRoutes.length} routes still need ownership.`,
          ctaLabel: unassignedTaskCount > 0 ? "Open task triage" : "Open route queue",
          tone: "warn",
        },
        {
          title: "Unblock route work",
          value: blockedByGeocode.length + args.pendingStopsCount,
          href: blockedCleanupHref,
          description: `${blockedByGeocode.length} blocked accounts and ${args.pendingStopsCount} pending stops are slowing route execution.`,
          ctaLabel: "Open route cleanup",
          tone: "warn",
        },
        {
          title: "Clear business bottlenecks",
          value: bottleneckCount,
          href: packagingPending.length > 0 ? packagingQueueHref() : pendingOrdersCount > 0 ? orderQueueHref() : approvalQueueHref(),
          description: `${pendingOrdersCount} orders, ${packagingPending.length} packaging reviews, ${args.approvalQueue.length} approvals.`,
          ctaLabel: "Open review queue",
          tone: "warn",
        },
        {
          title: "Monitor team load",
          value: routesThisWeek.length,
          href: openTasksHref,
          description: `${activeRoutes.length} active routes and ${openTasks.length} open follow-ups across the team.`,
          ctaLabel: "Open team workload",
        },
        {
          title: "Watch funnel pressure",
          value: hotLeads.length,
          href: pipelineHref,
          description: `${draftEstimates.length} draft estimates are feeding the next follow-up wave.`,
          ctaLabel: "Open hot lead pipeline",
        },
      ],
      actionItems: [
        {
          title: "Claim drifting follow-up",
          count: unassignedTaskCount,
          href: openTasksHref,
          tone: "warn",
          detail: "Open customer work without a clear owner is the fastest queue to go stale.",
          ctaLabel: "Open task triage",
        },
        {
          title: "Rescue blocked route accounts",
          count: blockedByGeocode.length,
          href: blockedCleanupHref,
          tone: "warn",
          detail: "These accounts cannot move into route planning until address or geocode issues are cleared.",
          ctaLabel: "Open cleanup queue",
        },
        {
          title: "Pull pending stops into routes",
          count: args.pendingStopsCount,
          href: routesQueueHref,
          tone: "neutral",
          detail: `${routeReadyAccounts.length} route-ready accounts are waiting on planning momentum.`,
          ctaLabel: "Open route queue",
        },
        {
          title: "Move pending orders forward",
          count: pendingOrdersCount,
          href: orderQueueHref(),
          tone: "neutral",
          detail: "Open order requests are sitting in progression and need the next business step.",
          ctaLabel: "Open order queue",
        },
        {
          title: "Review packaging and approvals",
          count: packagingPending.length + args.approvalQueue.length,
          href: packagingPending.length > 0 ? packagingQueueHref() : approvalQueueHref(),
          tone: "warn",
          detail: "Customer-facing approvals and packaging reviews are waiting on admin decisions.",
          ctaLabel: packagingPending.length > 0 ? "Open packaging review" : "Open approval queue",
        },
      ],
      bottleneckSnapshots: [
        {
          title: "Orders awaiting progression",
          subtitle: `${pendingOrdersCount} open`,
          detail: `${recentPendingOrders.length} recent requests are still waiting for movement.`,
          href: orderQueueHref(),
          ctaLabel: "Open order queue",
        },
        {
          title: "Packaging awaiting review",
          subtitle: `${packagingPending.length} pending`,
          detail: `${packagingApproved.length} approved • ${packagingRejected.length} rejected`,
          href: packagingQueueHref(),
          ctaLabel: "Open packaging review",
        },
        {
          title: "Approvals awaiting review",
          subtitle: `${args.approvalQueue.length} pending`,
          detail: `${args.approvalStatusCounts.docsLinked} with docs • ${args.approvalStatusCounts.followUp} need follow-up`,
          href: approvalQueueHref(),
          ctaLabel: "Open approvals",
        },
      ],
      hrefs: {
        blockedCleanup: blockedCleanupHref,
        teamWorkload: openTasksHref,
      },
    };
  } else {
    model.sales = {
      workflowCards: [
        {
          title: "Do now: overdue follow-up",
          value: overdueTaskCount,
          href: overdueTasksHref,
          description: `${openTasks.length} assigned follow-ups are open across ${customersNeedingFollowUp} accounts.`,
          ctaLabel: "Open overdue queue",
          tone: "warn",
        },
        {
          title: "Then: assigned follow-up",
          value: openTasks.length,
          href: openTasksHref,
          description: "After overdue work is handled, this is the queue that should keep moving today.",
          ctaLabel: "Open assigned tasks",
        },
        {
          title: "Then: route work",
          value: activeRoutes.length + args.pendingStopsCount,
          href: nextRouteHref,
          description: nextRouteDescription,
          ctaLabel: nextRouteCtaLabel,
        },
        {
          title: "Watch: account movement",
          value: myHotLeads.length,
          href: focusedCustomerWatchHref,
          description: `${myAccounts.length} assigned accounts and ${pendingOrdersCount} open orders may need follow-up today.`,
          ctaLabel: "Open follow-up accounts",
        },
      ],
      actionItems: [
        {
          title: "Handle overdue follow-up first",
          count: overdueTaskCount,
          href: overdueTasksHref,
          tone: "warn",
          detail: "Past-due outreach is the queue most likely to lose momentum if you let it wait.",
          ctaLabel: "Open overdue tasks",
        },
        {
          title: "Work the assigned follow-up queue",
          count: openTasks.length,
          href: openTasksHref,
          tone: "neutral",
          detail: "These are the next customer touches already assigned to you.",
          ctaLabel: "Open assigned tasks",
        },
        {
          title: "Run the next route or stop queue",
          count: activeRoutes.length + args.pendingStopsCount,
          href: nextRouteHref,
          tone: "neutral",
          detail: nextRouteQueueDetail,
          ctaLabel: nextRouteCtaLabel,
        },
        {
          title: "Watch hot leads and estimate movement",
          count: myHotLeads.length + draftEstimates.length,
          href: hotLeadHref,
          tone: "warn",
          detail: "Lead momentum and estimate activity are the next places new follow-up will surface.",
          ctaLabel: "Open hot lead watchlist",
        },
      ],
      hrefs: {
        assignedTasks: openTasksHref,
        overdueTasks: overdueTasksHref,
        routeQueue: nextRouteHref,
        customerWatchlist: focusedCustomerWatchHref,
      },
    };
  }

  return model;
}
