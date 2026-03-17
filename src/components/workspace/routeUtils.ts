import type { CustomerSummary } from "@/lib/customerWorkspace";

export type RouteViewMode = "list" | "map";

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

export function setQueryParam(params: URLSearchParams, key: string, value: string, emptyValues: string[] = ["all", ""]) {
  if (emptyValues.includes(value)) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
