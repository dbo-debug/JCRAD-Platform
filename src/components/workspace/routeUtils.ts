import type { CustomerSummary } from "@/lib/customerWorkspace";

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
      return "border-[#b7e4d7] bg-[#edf9f3] text-[#16624b]";
    case "due":
    case "scheduled":
      return "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]";
    case "overdue":
      return "border-[#f4ddb0] bg-[#fff6df] text-[#946200]";
    case "skipped":
    case "needs_follow_up":
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
