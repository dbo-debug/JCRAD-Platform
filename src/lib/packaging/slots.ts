import {
  normalizePackagingCompatibilityContexts,
  skuSupportsPackagingCompatibilityContext,
  type PackagingCompatibilityContext,
} from "@/lib/packaging/compatibility";

export type PackagingEstimatorSlot =
  | "flower_primary"
  | "concentrate_vessel"
  | "concentrate_secondary_bag"
  | "vape_primary_hardware"
  | "vape_secondary_bag"
  | "pre_roll_single_primary"
  | "pre_roll_multi_primary"
  | "pre_roll_multi_secondary_bag";

export const PACKAGING_ESTIMATOR_SLOTS: PackagingEstimatorSlot[] = [
  "flower_primary",
  "concentrate_vessel",
  "concentrate_secondary_bag",
  "vape_primary_hardware",
  "vape_secondary_bag",
  "pre_roll_single_primary",
  "pre_roll_multi_primary",
  "pre_roll_multi_secondary_bag",
];

export function normalizePackagingEstimatorSlot(value: unknown): PackagingEstimatorSlot | "" {
  const raw = String(value || "").trim().toLowerCase();
  if (PACKAGING_ESTIMATOR_SLOTS.includes(raw as PackagingEstimatorSlot)) return raw as PackagingEstimatorSlot;
  return "";
}

export function normalizePackagingEstimatorSlots(value: unknown): PackagingEstimatorSlot[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = values
    .map((entry) => normalizePackagingEstimatorSlot(entry))
    .filter((entry): entry is PackagingEstimatorSlot => Boolean(entry));
  return Array.from(new Set(normalized));
}

export function packagingEstimatorSlotLabel(value: PackagingEstimatorSlot): string {
  switch (value) {
    case "flower_primary":
      return "Flower Primary";
    case "concentrate_vessel":
      return "Concentrate Vessel";
    case "concentrate_secondary_bag":
      return "Concentrate Secondary Bag";
    case "vape_primary_hardware":
      return "Vape Primary Hardware";
    case "vape_secondary_bag":
      return "Vape Secondary Bag";
    case "pre_roll_single_primary":
      return "Pre-roll Single Primary";
    case "pre_roll_multi_primary":
      return "Pre-roll Multipack Primary";
    case "pre_roll_multi_secondary_bag":
      return "Pre-roll Multipack Secondary Bag";
  }
}

type SlotSource = {
  applies_to?: unknown;
  applies_to_contexts?: unknown;
  packaging_type?: unknown;
  size_grams?: unknown;
  pack_qty?: unknown;
  estimator_slots?: unknown;
};

function normalizedPackagingType(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasContext(contexts: PackagingCompatibilityContext[], target: PackagingCompatibilityContext): boolean {
  return contexts.includes(target);
}

export function derivePackagingEstimatorSlots(row: SlotSource): PackagingEstimatorSlot[] {
  const compatibilityContexts = normalizePackagingCompatibilityContexts(row.applies_to_contexts);
  const primaryFamily = String(row.applies_to || "").trim().toLowerCase().replace(/-/g, "_");
  const packagingType = normalizedPackagingType(row.packaging_type);
  const sizeGrams = toPositiveNumber(row.size_grams);
  const packQty = Math.max(1, Number(row.pack_qty || 1));
  const slots = new Set<PackagingEstimatorSlot>();

  if (
    primaryFamily === "flower" &&
    (packagingType === "flower_in_bag" || packagingType === "flower_in_jar") &&
    hasContext(compatibilityContexts, "flower")
  ) {
    slots.add("flower_primary");
  }

  if (primaryFamily === "concentrate" && packagingType === "concentrate_jar" && hasContext(compatibilityContexts, "concentrate")) {
    slots.add("concentrate_vessel");
  }

  if (
    primaryFamily === "vape" &&
    (packagingType === "vape_510_cart" || packagingType === "vape_all_in_one") &&
    hasContext(compatibilityContexts, "vape")
  ) {
    slots.add("vape_primary_hardware");
  }

  if (primaryFamily === "pre_roll" && hasContext(compatibilityContexts, "pre_roll")) {
    slots.add(packQty === 1 ? "pre_roll_single_primary" : "pre_roll_multi_primary");
  }

  const is35Mylar = packagingType === "flower_in_bag" && sizeGrams != null && Math.abs(sizeGrams - 3.5) < 1e-9;
  if (is35Mylar && hasContext(compatibilityContexts, "concentrate")) slots.add("concentrate_secondary_bag");
  if (is35Mylar && hasContext(compatibilityContexts, "vape")) slots.add("vape_secondary_bag");
  if (is35Mylar && hasContext(compatibilityContexts, "pre_roll")) slots.add("pre_roll_multi_secondary_bag");

  return Array.from(slots);
}

export function skuSupportsPackagingEstimatorSlot(row: SlotSource, target: PackagingEstimatorSlot): boolean {
  const explicit = normalizePackagingEstimatorSlots(row.estimator_slots);
  if (explicit.length > 0) return explicit.includes(target);

  const derived = derivePackagingEstimatorSlots({
    applies_to: row.applies_to,
    applies_to_contexts: row.applies_to_contexts,
    packaging_type: row.packaging_type,
    size_grams: row.size_grams,
    pack_qty: row.pack_qty,
  });
  if (derived.length > 0) return derived.includes(target);

  if (target === "flower_primary") {
    return skuSupportsPackagingCompatibilityContext(row, "flower") && normalizedPackagingType(row.packaging_type) !== "pre_roll_tube";
  }
  if (target === "concentrate_vessel") {
    return skuSupportsPackagingCompatibilityContext(row, "concentrate") && normalizedPackagingType(row.packaging_type) === "concentrate_jar";
  }
  if (target === "vape_primary_hardware") {
    const packagingType = normalizedPackagingType(row.packaging_type);
    return skuSupportsPackagingCompatibilityContext(row, "vape") && (packagingType === "vape_510_cart" || packagingType === "vape_all_in_one");
  }
  if (target === "pre_roll_single_primary") {
    return skuSupportsPackagingCompatibilityContext(row, "pre_roll") && normalizedPackagingType(row.packaging_type) === "pre_roll_tube";
  }
  if (target === "pre_roll_multi_primary") {
    return skuSupportsPackagingCompatibilityContext(row, "pre_roll") && normalizedPackagingType(row.packaging_type) === "pre_roll_jar";
  }

  return false;
}

export function primaryPackagingSlotForEstimate(args: {
  category: "flower" | "concentrate" | "vape";
  isPreRoll: boolean;
  preRollPackQty?: number;
}): PackagingEstimatorSlot {
  if (args.isPreRoll) return Math.max(1, Number(args.preRollPackQty || 1)) === 1 ? "pre_roll_single_primary" : "pre_roll_multi_primary";
  if (args.category === "concentrate") return "concentrate_vessel";
  if (args.category === "vape") return "vape_primary_hardware";
  return "flower_primary";
}

export function secondaryPackagingSlotForEstimate(args: {
  category: "flower" | "concentrate" | "vape";
  isPreRoll: boolean;
  preRollPackQty?: number;
}): PackagingEstimatorSlot | null {
  if (args.isPreRoll) {
    return Math.max(1, Number(args.preRollPackQty || 1)) >= 2 ? "pre_roll_multi_secondary_bag" : null;
  }
  if (args.category === "concentrate") return "concentrate_secondary_bag";
  if (args.category === "vape") return "vape_secondary_bag";
  return null;
}
