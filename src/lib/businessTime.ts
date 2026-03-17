export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

function getFormatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    ...options,
  });
}

function getPartsForZone(date: Date) {
  const parts = getFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function getBusinessTimeParts(date: Date) {
  const parts = getPartsForZone(date);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function parseBusinessDateTime(args: { routeDate: string; time: string }) {
  const [year, month, day] = args.routeDate.split("-").map(Number);
  const [hours, minutes] = args.time.split(":").map(Number);
  const targetLocalAsUtc = Date.UTC(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
  let date = new Date(targetLocalAsUtc);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = getPartsForZone(date);
    const currentLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const deltaMs = targetLocalAsUtc - currentLocalAsUtc;
    if (deltaMs === 0) break;
    date = new Date(date.getTime() + deltaMs);
  }

  return date;
}

function toBusinessDate(value: string | Date) {
  if (value instanceof Date) return value;
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return parseBusinessDateTime({ routeDate: text, time: "12:00" });
  }
  return new Date(text);
}

export function formatBusinessDateTime(value: string | Date | null | undefined, fallback = "Not set") {
  if (!value) return fallback;
  const date = toBusinessDate(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return getFormatter({
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatBusinessDateTimeLong(value: string | Date | null | undefined, fallback = "Not set") {
  if (!value) return fallback;
  const date = toBusinessDate(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return getFormatter({
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatBusinessDate(value: string | Date | null | undefined, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = toBusinessDate(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return getFormatter({
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
