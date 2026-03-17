import type { CustomerSummary } from "@/lib/customerWorkspace";

export type RouteViewMode = "list" | "map";
export type CoordinateCoverageFilter = "all" | "has_coords" | "needs_coords" | "address_ready" | "missing_address";
export type TerritorySortMode = "account_count" | "due_today" | "follow_up_needed";
export type TerritoryFocusMode = "all" | "my_territories" | "unassigned_territories" | "due_heavy" | "cleanup";

export type VisitOutcomeKey =
  | "met_buyer"
  | "no_answer"
  | "unavailable"
  | "sample_drop"
  | "interested"
  | "revisit_needed";

export const VISIT_OUTCOMES: Array<{
  key: VisitOutcomeKey;
  label: string;
  visitStatus: string;
  nextVisitDays: number | null;
  accentClass: string;
}> = [
  { key: "met_buyer", label: "Met Buyer", visitStatus: "met_buyer", nextVisitDays: null, accentClass: "border-[#b7e4d7] bg-[#edf9f3] text-[#16624b]" },
  { key: "no_answer", label: "No Answer", visitStatus: "no_answer", nextVisitDays: 2, accentClass: "border-[#f4ddb0] bg-[#fff6df] text-[#946200]" },
  { key: "unavailable", label: "Unavailable", visitStatus: "unavailable", nextVisitDays: 3, accentClass: "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]" },
  { key: "sample_drop", label: "Sample Drop", visitStatus: "sample_drop", nextVisitDays: null, accentClass: "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]" },
  { key: "interested", label: "Interested", visitStatus: "interested", nextVisitDays: 2, accentClass: "border-[#bfe8ef] bg-[#edfafe] text-[#0c6b79]" },
  { key: "revisit_needed", label: "Revisit Needed", visitStatus: "revisit_needed", nextVisitDays: 7, accentClass: "border-[#ffd2d2] bg-[#fff0f0] text-[#9a3d3d]" },
];

export function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function titleCase(value: string | null | undefined, fallback = "Unspecified") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value: string | null | undefined, fallback = "Not scheduled") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined, fallback = "Not recorded") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toLocaleString();
}

export function normalizeMailtoHref(value: string | null | undefined) {
  const email = String(value || "").trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}`;
}

export function normalizeTelHref(value: string | null | undefined) {
  const phone = String(value || "").trim();
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${normalized}`;
}

export function visitStatusChipClass(status: string | null | undefined) {
  switch (normalizeText(status)) {
    case "visited":
    case "met_buyer":
    case "sample_drop":
      return "border-[#b7e4d7] bg-[#edf9f3] text-[#16624b]";
    case "due":
    case "scheduled":
    case "interested":
      return "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]";
    case "overdue":
    case "no_answer":
    case "unavailable":
      return "border-[#f4ddb0] bg-[#fff6df] text-[#946200]";
    case "skipped":
    case "needs_follow_up":
    case "revisit_needed":
      return "border-[#ffd2d2] bg-[#fff0f0] text-[#9a3d3d]";
    default:
      return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4a6575]";
  }
}

export function priorityChipClass(priority: number | null) {
  if (priority === null) return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4a6575]";
  if (priority <= 1) return "border-[#ffd2d2] bg-[#fff0f0] text-[#9a3d3d]";
  if (priority <= 3) return "border-[#f4ddb0] bg-[#fff6df] text-[#946200]";
  return "border-[#d0e4ff] bg-[#eef5ff] text-[#285ea8]";
}

export function getRouteDayRank(routeDay: string | null | undefined) {
  switch (normalizeText(routeDay)) {
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    case "sunday":
      return 7;
    default:
      return 99;
  }
}

export function getRouteSearchText(customer: CustomerSummary) {
  return [
    customer.name,
    customer.territoryCode,
    customer.routeDay,
    customer.visitStatus,
    customer.assignedRouteRepName,
    customer.assignedRouteRepEmail,
    customer.primaryContactEmail,
    customer.mainPhone,
    ...customer.primaryContacts.flatMap((contact) => [contact.name, contact.email, contact.phone, contact.title]),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

export function customerHasAddress(customer: CustomerSummary) {
  return Boolean(customer.address1 || customer.city || customer.state || customer.postalCode);
}

export function getCoordinateCoverageState(customer: CustomerSummary): Exclude<CoordinateCoverageFilter, "all" | "needs_coords"> {
  if (customer.latitude !== null && customer.longitude !== null) return "has_coords";
  return customerHasAddress(customer) ? "address_ready" : "missing_address";
}

export function sortCustomersForRoute(left: CustomerSummary, right: CustomerSummary) {
  const dayDelta = getRouteDayRank(left.routeDay) - getRouteDayRank(right.routeDay);
  if (dayDelta !== 0) return dayDelta;

  const leftPriority = left.routePriority ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = right.routePriority ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;

  const leftDue = Date.parse(String(left.nextVisitDueAt || ""));
  const rightDue = Date.parse(String(right.nextVisitDueAt || ""));
  if (Number.isFinite(leftDue) || Number.isFinite(rightDue)) {
    return (Number.isFinite(leftDue) ? leftDue : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rightDue) ? rightDue : Number.MAX_SAFE_INTEGER);
  }

  return left.name.localeCompare(right.name);
}

export function buildRouteStats(customers: CustomerSummary[], referenceNow: number) {
  const startOfDay = new Date(referenceNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfToday = startOfDay.getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

  const dueToday = customers.filter((customer) => {
    const due = Date.parse(String(customer.nextVisitDueAt || ""));
    return Number.isFinite(due) && due >= startOfToday && due < endOfToday;
  }).length;

  const visitedToday = customers.filter((customer) => {
    const visitedAt = Date.parse(String(customer.lastVisitAt || ""));
    return Number.isFinite(visitedAt) && visitedAt >= startOfToday && visitedAt < endOfToday;
  }).length;

  const followUpNeeded = customers.filter((customer) =>
    ["needs_follow_up", "interested", "revisit_needed", "no_answer", "unavailable"].includes(normalizeText(customer.visitStatus))
  ).length;

  const noTerritory = customers.filter((customer) => !customer.territoryCode).length;
  const noCoords = customers.filter((customer) => customer.latitude === null || customer.longitude === null).length;

  return {
    dueToday,
    visitedToday,
    followUpNeeded,
    noTerritory,
    noCoords,
  };
}

export function getTerritoryKey(customer: CustomerSummary) {
  return String(customer.territoryCode || "").trim() || "UNASSIGNED";
}

export function buildTerritoryStats(customers: CustomerSummary[], referenceNow: number) {
  const startOfDay = new Date(referenceNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfToday = startOfDay.getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

  const territoryMap = new Map<
    string,
    {
      territoryKey: string;
      customers: CustomerSummary[];
      accountCount: number;
      dueToday: number;
      visitedToday: number;
      followUpNeeded: number;
      noCoords: number;
      unassignedRep: number;
      noRouteDay: number;
      ownerUserId: string | null;
      ownerState: "owned" | "partial" | "mixed" | "unassigned";
    }
  >();

  for (const customer of customers) {
    const territoryKey = getTerritoryKey(customer);
    const existing = territoryMap.get(territoryKey) || {
      territoryKey,
      customers: [],
      accountCount: 0,
      dueToday: 0,
      visitedToday: 0,
      followUpNeeded: 0,
      noCoords: 0,
      unassignedRep: 0,
      noRouteDay: 0,
      ownerUserId: null,
      ownerState: "unassigned",
    };

    existing.customers.push(customer);
    existing.accountCount += 1;

    const due = Date.parse(String(customer.nextVisitDueAt || ""));
    if (Number.isFinite(due) && due >= startOfToday && due < endOfToday) existing.dueToday += 1;

    const visitedAt = Date.parse(String(customer.lastVisitAt || ""));
    if (Number.isFinite(visitedAt) && visitedAt >= startOfToday && visitedAt < endOfToday) existing.visitedToday += 1;

    if (["needs_follow_up", "interested", "revisit_needed", "no_answer", "unavailable"].includes(normalizeText(customer.visitStatus))) {
      existing.followUpNeeded += 1;
    }

    if (customer.latitude === null || customer.longitude === null) existing.noCoords += 1;
    if (!customer.assignedRouteRepUserId) existing.unassignedRep += 1;
    if (!customer.routeDay) existing.noRouteDay += 1;

    territoryMap.set(territoryKey, existing);
  }

  return Array.from(territoryMap.values()).map((territory) => {
    const assignedRepIds = Array.from(new Set(territory.customers.map((customer) => customer.assignedRouteRepUserId).filter((value): value is string => Boolean(value))));

    if (assignedRepIds.length === 0) {
      return { ...territory, ownerUserId: null, ownerState: "unassigned" as const };
    }
    if (assignedRepIds.length === 1 && territory.unassignedRep === 0) {
      return { ...territory, ownerUserId: assignedRepIds[0], ownerState: "owned" as const };
    }
    if (assignedRepIds.length === 1) {
      return { ...territory, ownerUserId: assignedRepIds[0], ownerState: "partial" as const };
    }
    return { ...territory, ownerUserId: null, ownerState: "mixed" as const };
  });
}

export function sortTerritoryStats<
  T extends {
    territoryKey: string;
    accountCount: number;
    dueToday: number;
    followUpNeeded: number;
  },
>(territories: T[], sortMode: TerritorySortMode) {
  return [...territories].sort((left, right) => {
    const metricDelta =
      sortMode === "due_today"
        ? right.dueToday - left.dueToday
        : sortMode === "follow_up_needed"
          ? right.followUpNeeded - left.followUpNeeded
          : right.accountCount - left.accountCount;

    if (metricDelta !== 0) return metricDelta;
    if (left.territoryKey === "UNASSIGNED") return 1;
    if (right.territoryKey === "UNASSIGNED") return -1;
    return left.territoryKey.localeCompare(right.territoryKey);
  });
}

export function setQueryParam(params: URLSearchParams, key: string, value: string, emptyValues: string[] = ["all", ""]) {
  if (emptyValues.includes(value)) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
