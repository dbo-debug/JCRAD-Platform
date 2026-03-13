import { GRAMS_PER_LB } from "@/lib/pricing";
import { normalizePricingCategory } from "@/lib/pricing-normalize";

export const DEFAULT_MARKUP_PCT = 0.2;

export type PriceUnit = "per_lb" | "per_g";

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function defaultSellUnitForCategory(category: unknown): PriceUnit {
  const normalized = normalizePricingCategory(category);
  return normalized === "flower" ? "per_lb" : "per_g";
}

export function deriveSellPricingFromCost(args: {
  category: unknown;
  costPerLb?: unknown;
  costPerG?: unknown;
  explicitSellPerLb?: unknown;
  explicitSellPerG?: unknown;
  markupPct?: unknown;
}): { sellPerLb: number | null; sellPerG: number | null; derivedFromCost: boolean; unit: PriceUnit } {
  const unit = defaultSellUnitForCategory(args.category);
  const markupPct = Number.isFinite(Number(args.markupPct)) ? Math.max(0, Number(args.markupPct)) : DEFAULT_MARKUP_PCT;
  const multiplier = 1 + markupPct;

  const costPerLb = finitePositive(args.costPerLb);
  const costPerG = finitePositive(args.costPerG);
  let sellPerLb = finitePositive(args.explicitSellPerLb);
  let sellPerG = finitePositive(args.explicitSellPerG);
  let derivedFromCost = false;

  if (sellPerLb == null && sellPerG == null) {
    if (unit === "per_lb" && costPerLb != null) {
      sellPerLb = costPerLb * multiplier;
      derivedFromCost = true;
    } else if (unit === "per_g" && costPerG != null) {
      sellPerG = costPerG * multiplier;
      derivedFromCost = true;
    } else if (costPerLb != null) {
      sellPerLb = costPerLb * multiplier;
      derivedFromCost = true;
    } else if (costPerG != null) {
      sellPerG = costPerG * multiplier;
      derivedFromCost = true;
    }
  }

  if (sellPerLb == null && sellPerG != null) {
    sellPerLb = sellPerG * GRAMS_PER_LB;
  }
  if (sellPerG == null && sellPerLb != null) {
    sellPerG = sellPerLb / GRAMS_PER_LB;
  }

  return { sellPerLb, sellPerG, derivedFromCost, unit };
}

