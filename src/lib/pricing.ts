export type CopackPackagingType = "flower_in_bag" | "concentrate" | "vape";

export type PreRollLaborMode =
  | "preroll_no_infusion_any_size"
  | "internal_infusion"
  | "external_infusion"
  | "5pk_no_infusion"
  | "5pk_internal_dry_infusion"
  | "5pk_external_infusion";

export const JC_RAD_PACKAGING_LABOR_PER_UNIT: Record<CopackPackagingType, number> = {
  flower_in_bag: 1.08,
  concentrate: 1.28,
  vape: 1.13,
};

export const PRE_ROLL_LABOR_PER_UNIT: Record<PreRollLaborMode, number> = {
  preroll_no_infusion_any_size: 0.88,
  internal_infusion: 0.93,
  external_infusion: 1.38,
  "5pk_no_infusion": 2.33,
  "5pk_internal_dry_infusion": 2.55,
  "5pk_external_infusion": 4.83,
};

export type PackagingTier = {
  moq: number;
  unit_price: number;
};

export const GRAMS_PER_LB = 453.592;

export const CATEGORY_UNIT_SIZES: Record<string, string[]> = {
  flower: ["3.5g", "5g", "7g", "14g", "28g"],
  concentrate: ["1g"],
  vape: ["0.5g", "1g"],
};

export const PRE_ROLL_UNIT_SIZES = ["0.5g", "0.75g", "1g"] as const;
export const PRE_ROLL_PACK_QTY = [1, 5] as const;

export function gramsFromUnitSize(unitSize: string): number {
  const key = unitSize.toLowerCase();
  const map: Record<string, number> = {
    "0.5g": 0.5,
    "0.75g": 0.75,
    "1g": 1,
    "3.5g": 3.5,
    "5g": 5,
    "7g": 7,
    "14g": 14,
    "28g": 28,
    // Backward-compatible legacy keys
    eighth: 3.5,
    quarter: 7,
    half: 14,
    oz: 28,
  };
  if (!(key in map)) {
    throw new Error(`Unsupported unit size: ${unitSize}`);
  }
  return map[key];
}

export function selectPackagingTier(units: number, tiers: PackagingTier[]): PackagingTier | null {
  if (!tiers.length) return null;

  const sorted = [...tiers].sort((a, b) => a.moq - b.moq);
  const eligible = sorted.filter((t) => t.moq <= units);
  if (eligible.length > 0) return eligible[eligible.length - 1];
  return sorted[0];
}

export function materialUnitCostFromLb(bulkSellPerLb: number, unitSizeGrams: number): number {
  return (bulkSellPerLb / GRAMS_PER_LB) * unitSizeGrams;
}

export function lbsFromCopack(units: number, gramsPerUnit: number): number {
  return (Math.max(0, units) * Math.max(0, gramsPerUnit)) / GRAMS_PER_LB;
}

export function lbsFromEstimateLine(line: {
  mode?: string | null;
  quantity_lbs?: number | null;
  units?: number | null;
  unit_size?: string | null;
  pre_roll_mode?: string | null;
  pre_roll_pack_qty?: number | null;
}): number {
  const mode = String(line.mode || "").toLowerCase();
  if (mode === "bulk") {
    return Math.max(0, Number(line.quantity_lbs || 0));
  }

  const units = Math.max(0, Number(line.units || 0));
  const unitSize = String(line.unit_size || "1g");
  const isPreRoll = !!line.pre_roll_mode;
  const packQty = isPreRoll ? Math.max(1, Number(line.pre_roll_pack_qty || 1)) : 1;
  const gramsPerUnit = gramsFromUnitSize(unitSize) * packQty;
  return lbsFromCopack(units, gramsPerUnit);
}

export function laborUnitCost(args: {
  category?: string | null;
  packagingType?: string | null;
  preRollMode?: string | null;
  isPreRoll?: boolean;
  customerPackaging?: boolean;
  extraTouchPoints?: number;
  extraTouchPointCostUsd?: number;
}) {
  const customerPackaging = !!args.customerPackaging;
  const extraTouchPoints = Number.isFinite(args.extraTouchPoints) ? Number(args.extraTouchPoints) : 0;
  const extraTouchPointCostUsd = Number.isFinite(args.extraTouchPointCostUsd) ? Number(args.extraTouchPointCostUsd) : 0.1;

  if (args.isPreRoll) {
    const mode = (args.preRollMode || "preroll_no_infusion_any_size") as PreRollLaborMode;
    return PRE_ROLL_LABOR_PER_UNIT[mode] ?? PRE_ROLL_LABOR_PER_UNIT.preroll_no_infusion_any_size;
  }

  const packagingType = (args.packagingType || "flower_in_bag") as CopackPackagingType;
  const base = JC_RAD_PACKAGING_LABOR_PER_UNIT[packagingType] ?? JC_RAD_PACKAGING_LABOR_PER_UNIT.flower_in_bag;

  if (!customerPackaging) return base;
  return base + Math.max(0, extraTouchPoints) * Math.max(0, extraTouchPointCostUsd);
}

export function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
