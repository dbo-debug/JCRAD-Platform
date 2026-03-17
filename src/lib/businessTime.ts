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

function getBusinessOffsetMs(date: Date) {
  const parts = getPartsForZone(date);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

export function parseBusinessDateTime(args: { routeDate: string; time: string }) {
  const [year, month, day] = args.routeDate.split("-").map(Number);
  const [hours, minutes] = args.time.split(":").map(Number);
  let utcMs = Date.UTC(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);

  // Run twice so DST offsets settle correctly for the target business timezone.
  utcMs -= getBusinessOffsetMs(new Date(utcMs));
  utcMs -= getBusinessOffsetMs(new Date(utcMs));

  return new Date(utcMs);
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
