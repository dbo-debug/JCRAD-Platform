const GENERATED_ROUTE_LABELS = new Set(["Pending Stops", "Draft Route"]);
const GENERATED_ROUTE_NAME_PATTERN = /^(.+)\s•\s\d{4}-\d{2}-\d{2}$/;

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export function getGeneratedRouteNamePrefix(args: { name: string | null; territoryCode?: string | null }) {
  const routeName = asText(args.name);
  if (!routeName || !GENERATED_ROUTE_NAME_PATTERN.test(routeName)) return null;

  const prefix = asText(routeName.split(" • ")[0]);
  if (!prefix) return null;
  if (GENERATED_ROUTE_LABELS.has(prefix)) return prefix;
  if (prefix === asText(args.territoryCode)) return prefix;
  return null;
}

export function syncGeneratedRouteName(args: { name: string | null; territoryCode?: string | null; routeDate: string }) {
  const prefix = getGeneratedRouteNamePrefix(args);
  if (!prefix) return args.name;
  return `${prefix} • ${args.routeDate}`;
}
