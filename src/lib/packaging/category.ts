export type PackagingCategory = "vape" | "flower" | "pre_roll" | "concentrate";

export const PACKAGING_CATEGORIES: PackagingCategory[] = ["vape", "flower", "pre_roll", "concentrate"];

export function normalizePackagingCategory(value: unknown): PackagingCategory | "" {
  const raw = String(value || "").trim().toLowerCase().replace("-", "_");
  if (raw === "vape" || raw === "flower" || raw === "pre_roll" || raw === "concentrate") return raw;
  return "";
}

export function packagingCategoryLabel(value: PackagingCategory): string {
  if (value === "pre_roll") return "Pre-roll";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
