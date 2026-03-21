export type PackagingCompatibilityContext = "flower" | "concentrate" | "vape" | "pre_roll";

export const PACKAGING_COMPATIBILITY_CONTEXTS: PackagingCompatibilityContext[] = [
  "flower",
  "concentrate",
  "vape",
  "pre_roll",
];

export function normalizePackagingCompatibilityContext(value: unknown): PackagingCompatibilityContext | "" {
  const raw = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (
    raw === "flower" ||
    raw === "concentrate" ||
    raw === "vape" ||
    raw === "pre_roll"
  ) {
    return raw;
  }
  return "";
}

export function normalizePackagingCompatibilityContexts(value: unknown): PackagingCompatibilityContext[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = values
    .map((entry) => normalizePackagingCompatibilityContext(entry))
    .filter((entry): entry is PackagingCompatibilityContext => Boolean(entry));

  return Array.from(new Set(normalized));
}

export function packagingCompatibilityLabel(value: PackagingCompatibilityContext): string {
  if (value === "pre_roll") return "Pre-roll";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function packagingCompatibilityContextsForSku(row: {
  applies_to_contexts?: unknown;
  applies_to?: unknown;
  category?: unknown;
  packaging_type?: unknown;
}): PackagingCompatibilityContext[] {
  const explicit = normalizePackagingCompatibilityContexts(row.applies_to_contexts);
  if (explicit.length > 0) return explicit;

  const legacy = normalizePackagingCompatibilityContext(row.applies_to || row.category);
  if (legacy) return [legacy];

  const packagingType = String(row.packaging_type || "").trim().toLowerCase().replace(/-/g, "_");
  if (packagingType === "pre_roll_tube" || packagingType === "pre_roll_jar" || packagingType === "pre_roll_pack") {
    return ["pre_roll"];
  }

  return [];
}

export function skuSupportsPackagingCompatibilityContext(
  row: {
    applies_to_contexts?: unknown;
    applies_to?: unknown;
    category?: unknown;
    packaging_type?: unknown;
  },
  target: unknown
): boolean {
  const normalizedTarget = normalizePackagingCompatibilityContext(target);
  if (!normalizedTarget) return false;
  return packagingCompatibilityContextsForSku(row).includes(normalizedTarget);
}
