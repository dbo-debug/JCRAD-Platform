import { GRAMS_PER_LB } from "@/lib/pricing";

export const PRICING_CATEGORIES = ["flower", "concentrate", "vape"] as const;
export const MATERIAL_COST_BASES = ["per_lb", "per_g", "per_1000g"] as const;

export type PricingCategory = (typeof PRICING_CATEGORIES)[number];
export type MaterialCostBasis = (typeof MATERIAL_COST_BASES)[number];
export type InventoryUnit = "lb" | "g";

export function normalizePricingCategory(value: unknown): PricingCategory | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "pre_roll" || raw === "pre-roll" || raw === "preroll") return "flower";
  if (raw === "flower" || raw === "concentrate" || raw === "vape") return raw;
  return null;
}

export function defaultMaterialCostBasisForCategory(value: unknown): MaterialCostBasis {
  const category = normalizePricingCategory(value);
  return category === "flower" ? "per_lb" : "per_g";
}

export function normalizeMaterialCostBasis(value: unknown, category?: unknown): MaterialCostBasis {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "per_lb" || raw === "per_g" || raw === "per_1000g") return raw;
  return defaultMaterialCostBasisForCategory(category);
}

export function normalizeInventoryUnit(value: unknown): InventoryUnit {
  return String(value || "").trim().toLowerCase() === "g" ? "g" : "lb";
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function costPerGFromBasis(args: {
  materialCostBasis: unknown;
  materialCostInput: unknown;
}): number | null {
  const basis = normalizeMaterialCostBasis(args.materialCostBasis);
  const input = finitePositive(args.materialCostInput);
  if (input == null) return null;
  if (basis === "per_lb") return input / GRAMS_PER_LB;
  if (basis === "per_g") return input;
  return input / 1000;
}

export function normalizeMaterialCostPerG(args: {
  materialCostBasis: unknown;
  materialCostInput: unknown;
  bulkCostPerLb: unknown;
  inventoryUnit: unknown;
}): number | null {
  const fromBasis = costPerGFromBasis(args);
  if (fromBasis != null) return fromBasis;

  const bulkCostPerLb = finitePositive(args.bulkCostPerLb);
  if (bulkCostPerLb == null) return null;

  const inventoryUnit = normalizeInventoryUnit(args.inventoryUnit);
  return inventoryUnit === "g" ? bulkCostPerLb : bulkCostPerLb / GRAMS_PER_LB;
}

