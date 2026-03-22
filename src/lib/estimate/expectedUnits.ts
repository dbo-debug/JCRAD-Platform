import { gramsFromUnitSize } from "@/lib/pricing";

export const FARMERS_POUND_GRAMS = 454;

const DEFAULT_PREROLL_BASE_UNITS_PER_LB_BY_SIZE: Record<string, number> = {
  "0.5g": 880,
  "0.75g": 586,
  "1g": 440,
};

function clampPct(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function floorNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function unitSizeSettingToken(unitSize: string): string {
  return String(unitSize || "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function defaultPrerollBaseUnitsPerLb(unitSize: string): number {
  return DEFAULT_PREROLL_BASE_UNITS_PER_LB_BY_SIZE[String(unitSize || "").trim()] || 440;
}

export type InfusedPreRollExpectedUnitsArgs = {
  startingWeightLbs: number;
  unitSize: string;
  preRollPackQty: number;
  baseUnitsPerLb: number;
  finishedGoodsYieldPct: number;
  hasInternalInfusion: boolean;
  internalTargetGPerLb: number;
  internalLossPct: number;
  internalThcaLossPct?: number;
  useThcaInternalLoss?: boolean;
  hasExternalInfusion: boolean;
  externalLiquidTargetGPerUnit1g: number;
  externalLiquidLossPct: number;
  externalDryTargetGPerUnit1g: number;
  externalDryLossPct: number;
};

export type InfusedPreRollExpectedUnitsResult = {
  highUnits: number;
  lowUnits: number;
  baseFlowerGrams: number;
  internalTargetGrams: number;
  internalUsableGrams: number;
  externalLiquidTargetGrams: number;
  externalLiquidUsableGrams: number;
  externalDryTargetGrams: number;
  externalDryUsableGrams: number;
  totalUsableGrams: number;
  gramsPerPackHigh: number;
  liquidTargetGramsPerPack: number;
  dryTargetGramsPerPack: number;
};

export function calculateInfusedPreRollExpectedUnits(args: InfusedPreRollExpectedUnitsArgs): InfusedPreRollExpectedUnitsResult {
  const startingWeightLbs = Math.max(0, Number(args.startingWeightLbs || 0));
  const packQty = Math.max(1, Math.floor(Number(args.preRollPackQty || 1)));
  const unitSize = String(args.unitSize || "1g").trim() || "1g";
  const unitSizeGrams = Math.max(0, gramsFromUnitSize(unitSize));
  const baseUnitsPerLb = Math.max(
    1,
    floorNonNegative(Number(args.baseUnitsPerLb || 0)) || defaultPrerollBaseUnitsPerLb(unitSize),
  );
  const packsPerLbHigh = Math.max(1, Math.floor(baseUnitsPerLb / packQty));
  const gramsPerPackHigh = FARMERS_POUND_GRAMS / packsPerLbHigh;
  const finishedGoodsYieldPct = clampPct(Number(args.finishedGoodsYieldPct), 1);
  const internalLossPct = clampPct(
    Number(args.useThcaInternalLoss ? (args.internalThcaLossPct ?? args.internalLossPct) : args.internalLossPct),
  );
  const externalLiquidLossPct = clampPct(Number(args.externalLiquidLossPct));
  const externalDryLossPct = clampPct(Number(args.externalDryLossPct));

  const baseFlowerGrams = floorNonNegative(startingWeightLbs * FARMERS_POUND_GRAMS);
  const internalTargetGrams = args.hasInternalInfusion
    ? Math.max(0, Number(args.internalTargetGPerLb || 0)) * startingWeightLbs
    : 0;
  const internalUsableGrams = floorNonNegative(internalTargetGrams * (1 - internalLossPct));
  const liquidTargetGramsPerPack = args.hasExternalInfusion
    ? Math.max(0, Number(args.externalLiquidTargetGPerUnit1g || 0)) * unitSizeGrams * packQty
    : 0;
  const dryTargetGramsPerPack = args.hasExternalInfusion
    ? Math.max(0, Number(args.externalDryTargetGPerUnit1g || 0)) * unitSizeGrams * packQty
    : 0;

  let highUnits = floorNonNegative((baseFlowerGrams + internalUsableGrams) / gramsPerPackHigh);

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const externalLiquidTargetGrams = highUnits * liquidTargetGramsPerPack;
    const externalDryTargetGrams = highUnits * dryTargetGramsPerPack;
    const externalLiquidUsableGrams = floorNonNegative(externalLiquidTargetGrams * (1 - externalLiquidLossPct));
    const externalDryUsableGrams = floorNonNegative(externalDryTargetGrams * (1 - externalDryLossPct));
    const totalUsableGrams = baseFlowerGrams + internalUsableGrams + externalLiquidUsableGrams + externalDryUsableGrams;
    const nextHighUnits = floorNonNegative(totalUsableGrams / gramsPerPackHigh);
    if (nextHighUnits === highUnits) break;
    highUnits = nextHighUnits;
  }

  const externalLiquidTargetGrams = highUnits * liquidTargetGramsPerPack;
  const externalDryTargetGrams = highUnits * dryTargetGramsPerPack;
  const externalLiquidUsableGrams = floorNonNegative(externalLiquidTargetGrams * (1 - externalLiquidLossPct));
  const externalDryUsableGrams = floorNonNegative(externalDryTargetGrams * (1 - externalDryLossPct));
  const totalUsableGrams = baseFlowerGrams + internalUsableGrams + externalLiquidUsableGrams + externalDryUsableGrams;
  const lowUnits = floorNonNegative(highUnits * finishedGoodsYieldPct);

  return {
    highUnits,
    lowUnits,
    baseFlowerGrams,
    internalTargetGrams: floorNonNegative(internalTargetGrams),
    internalUsableGrams,
    externalLiquidTargetGrams: floorNonNegative(externalLiquidTargetGrams),
    externalLiquidUsableGrams,
    externalDryTargetGrams: floorNonNegative(externalDryTargetGrams),
    externalDryUsableGrams,
    totalUsableGrams,
    gramsPerPackHigh,
    liquidTargetGramsPerPack,
    dryTargetGramsPerPack,
  };
}
