"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EstimateCartPanel from "@/components/menu/EstimateCartPanel";
import FilterChipBar from "@/components/menu/FilterChipBar";
import MenuLayout from "@/components/menu/MenuLayout";
import ProductGrid from "@/components/menu/ProductGrid";
import { LIQUID_INFUSION_MEDIA } from "@/lib/infusion-config";
import { calculateInfusedPreRollExpectedUnits } from "@/lib/estimate/expectedUnits";
import { type PackagingCategory } from "@/lib/packaging/category";
import {
  primaryPackagingSlotForEstimate,
  secondaryPackagingSlotForEstimate,
  skuMatchesEstimatePrimaryCapacity,
  skuSupportsPackagingEstimatorSlot,
} from "@/lib/packaging/slots";
import {
  CATEGORY_UNIT_SIZES,
  GRAMS_PER_LB,
  PRE_ROLL_UNIT_SIZES,
  gramsFromUnitSize,
  litersFromGrams,
} from "@/lib/pricing";
import {
  type CardMode,
  type CardPackagingMode,
  type EstimateCartLine,
  type InfusionProductOption,
  type MenuCategory,
  type MenuMode,
  type Offer,
  type ProductCardCopackConfig,
  type ProductCardItem,
} from "@/components/menu/types";

const ESTIMATE_KEY = "jc_estimate_id";

const CATEGORY_OPTIONS: Array<{ value: MenuCategory; label: string }> = [
  { value: "flower", label: "Flower" },
  { value: "concentrate", label: "Concentrate" },
  { value: "vape", label: "Vape" },
  { value: "pre_roll", label: "Pre-roll" },
];
const FLOWER_CULTIVATION_OPTIONS = ["Indoor", "Light Assist", "Full Term"];
const FLOWER_GRADE_OPTIONS = ["Premium", "Mediums", "Smalls", "Shake"];
const CONCENTRATE_TYPE_OPTIONS = [
  "THCA",
  "Kief",
  "Bubble Hash",
  "Freeze Dried Rosin",
  "Shatter",
  "Diamonds",
  "Badder",
  "Rosin",
];
const VAPE_MEDIUM_OPTIONS = [...LIQUID_INFUSION_MEDIA];
const PRE_ROLL_MATERIAL_OPTIONS = ["Flower", "Smalls", "Shake"];

type PackagingSku = {
  id: string;
  name: string;
  category?: string | null;
  applies_to?: string | null;
  applies_to_contexts?: string[] | null;
  estimator_slots?: string[] | null;
  packaging_type?: string | null;
  size_grams?: number | null;
  pack_qty?: number | null;
  vape_device?: string | null;
  active?: boolean | null;
  workflow_contexts?: string[] | null;
  packaging_role?: string | null;
};

type OfferCardState = {
  expanded: boolean;
  mode: CardMode;
  startingWeightLbs: number;
  startingWeightGrams: number;
  advancedTargetUnits: number;
  showAdvancedUnits: boolean;
  unitSize: string;
  packagingMode: CardPackagingMode;
  packagingSkuId: string;
  secondaryPackagingSkuId: string;
  preRollPackQty: number;
  preRollMode: string;
  internalInfusionProductId: string;
  externalLiquidProductId: string;
  externalDryProductId: string;
  notes: string;
  frontFile: File | null;
  backFile: File | null;
};

type YieldSettings = {
  flowerYieldPct: number;
  concentrateYieldPct: number;
  prerollYieldPct: number;
  vapeFillYieldPct: number;
  flowerYieldPctBySize: Record<string, number>;
  prerollYieldPctBySize: Record<string, number>;
  prerollBaseUnitsPerLbBySize: Record<string, number>;
};

type InfusionSettings = {
  farmersPoundGrams: number;
  internalGPerLb: number;
  internalLossPct: number;
  internalThcaLossPct: number;
  externalDistillatePer1g: number;
  externalDistillateLossPct: number;
  externalKiefPer1g: number;
  externalKiefLossPct: number;
};

const PRE_ROLL_MODES = [
  "preroll_no_infusion_any_size",
  "internal_infusion",
  "external_infusion",
  "5pk_no_infusion",
  "5pk_internal_dry_infusion",
  "5pk_external_infusion",
] as const;

function preRollModeFromInfusion(args: {
  packQty: number;
  hasInternal: boolean;
  hasExternal: boolean;
}): string {
  if (args.hasExternal) return args.packQty === 5 ? "5pk_external_infusion" : "external_infusion";
  if (args.hasInternal) return args.packQty === 5 ? "5pk_internal_dry_infusion" : "internal_infusion";
  return args.packQty === 5 ? "5pk_no_infusion" : "preroll_no_infusion_any_size";
}

function getEstimateId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ESTIMATE_KEY) || "";
}

function setEstimateId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ESTIMATE_KEY, id);
}

function normalizeCategory(value: unknown): MenuCategory | "" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pre-roll" || raw === "preroll") return "pre_roll";
  if (raw === "flower" || raw === "concentrate" || raw === "vape" || raw === "pre_roll") return raw;
  return "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedLower(value: unknown): string {
  return normalizeWhitespace(String(value || "")).toLowerCase();
}

function startsWithToken(value: string, token: string): boolean {
  return value.toLowerCase().startsWith(`${token.toLowerCase()} `) || value.toLowerCase() === token.toLowerCase();
}

function endsWithToken(value: string, token: string): boolean {
  return value.toLowerCase().endsWith(` ${token.toLowerCase()}`) || value.toLowerCase() === token.toLowerCase();
}

function parseFallbackBadges(offer: Offer): string[] {
  const labels: string[] = [];
  const displayName = normalizeWhitespace(String(offer.catalog_name || offer.products?.name || ""));
  const category = normalizeCategory(offer.catalog_category || offer.products?.category);

  if (category === "flower") {
    const cultivations = ["Indoor", "Light Assist", "Full Term"];
    const grades = ["Shake", "Smalls", "Mediums", "Premium"];
    const cultivation = cultivations.find((value) => startsWithToken(displayName, value));
    const grade = grades.find((value) => endsWithToken(displayName, value));
    if (cultivation) labels.push(cultivation);
    if (grade) labels.push(grade);
  }

  if (category === "concentrate") {
    const type = CONCENTRATE_TYPE_OPTIONS.find((value) => startsWithToken(displayName, value));
    if (type) labels.push(type);
  }
  if (category === "vape") {
    const medium = VAPE_MEDIUM_OPTIONS.find((value) => startsWithToken(displayName, value));
    if (medium) labels.push(medium);
  }

  return labels.slice(0, 3);
}

function productBadgesForOffer(offer: Offer): string[] {
  const labels: string[] = [];
  const type = normalizeWhitespace(String(offer.products?.type || ""));
  const tier = normalizeWhitespace(String(offer.products?.tier || ""));
  if (type) labels.push(type);
  if (tier) labels.push(tier);

  for (const fallback of parseFallbackBadges(offer)) {
    if (labels.some((entry) => normalizedLower(entry) === normalizedLower(fallback))) continue;
    labels.push(fallback);
  }

  return labels.slice(0, 4);
}

function asMoney(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pricingLabelForOffer(offer: Offer): string {
  const sell = Number(offer.bulk_sell_per_lb);
  const inventoryUnit = String(offer.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
  if (Number.isFinite(sell) && sell > 0) {
    return `${asMoney(sell)} / ${inventoryUnit}`;
  }
  return "from pricing estimate";
}

function availabilityLabelForOffer(offer: Offer): string | undefined {
  const category = normalizeCategory(offer.catalog_category || offer.products?.category);
  const qtyRaw = offer.products?.inventory_qty;
  if (qtyRaw == null) return undefined;
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty) || qty < 0) return undefined;
  const inventoryUnit = String(offer.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";

  if (category === "flower") {
    const pounds = inventoryUnit === "g" ? qty / GRAMS_PER_LB : qty;
    return `Available: ${pounds.toFixed(2)} lb`;
  }

  const grams = inventoryUnit === "lb" ? qty * GRAMS_PER_LB : qty;
  if (category === "vape") {
    return `Available: ${Math.round(grams).toLocaleString()} g (${litersFromGrams(grams).toFixed(1)} L)`;
  }
  return `Available: ${Math.round(grams).toLocaleString()} g`;
}

function productIdForOffer(offer: Offer): string {
  return String(offer.product_id || offer.products?.id || "").trim();
}

function isVapeVesselSku(sku: PackagingSku | null | undefined): boolean {
  const t = normalizedLower(sku?.packaging_type);
  return t === "vape_510_cart" || t === "vape_all_in_one";
}

function isValidSecondaryPackagingSku(
  sku: PackagingSku | null | undefined,
  args: {
    category: "flower" | "concentrate" | "vape";
    isPreRoll: boolean;
    preRollPackQty: number;
    unitSizeGrams: number;
  }
): boolean {
  if (!sku || sku.active !== true) return false;
  const secondarySlot = secondaryPackagingSlotForEstimate({
    category: args.category,
    isPreRoll: args.isPreRoll,
    preRollPackQty: args.preRollPackQty,
  });
  if (!secondarySlot) return false;
  if (!skuSupportsPackagingEstimatorSlot(sku, secondarySlot)) return false;
  return skuMatchesEstimatePrimaryCapacity(sku, {
    category: args.category,
    isPreRoll: args.isPreRoll,
    unitSizeGrams: args.unitSizeGrams,
  });
}

function defaultCardState(offer: Offer, selectedCategory: MenuCategory, menuMode: MenuMode): OfferCardState {
  const baseCategory = normalizeCategory(offer.catalog_category || offer.products?.category);
  const mode: CardMode = selectedCategory === "pre_roll" && baseCategory === "flower"
    ? "pre_roll"
    : menuMode === "copack"
      ? "copack"
      : "bulk";
  const defaultUnitSize = mode === "pre_roll"
    ? PRE_ROLL_UNIT_SIZES[0]
    : CATEGORY_UNIT_SIZES[baseCategory] && CATEGORY_UNIT_SIZES[baseCategory].length > 0
      ? CATEGORY_UNIT_SIZES[baseCategory][0]
      : "3.5g";
  const concentrateStartingGrams = Math.max(1, Number(offer.min_order || 0) || 1000);
  const defaultStartingWeightLbs = baseCategory === "concentrate"
    ? concentrateStartingGrams / GRAMS_PER_LB
    : Math.max(1, Number(offer.min_order || 1));
  return {
    expanded: mode === "bulk" && baseCategory === "flower",
    mode,
    startingWeightLbs: defaultStartingWeightLbs,
    startingWeightGrams: baseCategory === "concentrate" ? concentrateStartingGrams : 1000,
    advancedTargetUnits: 100,
    showAdvancedUnits: false,
    unitSize: defaultUnitSize,
    packagingMode: "jcrad",
    packagingSkuId: "",
    secondaryPackagingSkuId: "",
    preRollPackQty: 1,
    preRollMode: PRE_ROLL_MODES[0],
    internalInfusionProductId: "",
    externalLiquidProductId: "",
    externalDryProductId: "",
    notes: "",
    frontFile: null,
    backFile: null,
  };
}

function scrollOfferCardIntoView(offerId: string, block: ScrollLogicalPosition = "center") {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    document.querySelector(`[data-offer-card-id="${offerId}"]`)?.scrollIntoView({ behavior: "smooth", block });
  }, 60);
}

function modeFromLine(modeRaw: unknown, preRollModeRaw: unknown): MenuMode | "pre_roll" {
  const mode = String(modeRaw || "bulk").toLowerCase();
  if (mode !== "copack") return "bulk";
  return String(preRollModeRaw || "").trim() ? "pre_roll" : "copack";
}

function lineUnitPrice(line: any, mode: MenuMode | "pre_roll"): number | null {
  const lineTotalRaw = Number(line?.line_sell_total);
  const fallbackTotalRaw = Number(line?.line_total);
  const total = Number.isFinite(lineTotalRaw) ? lineTotalRaw : Number.isFinite(fallbackTotalRaw) ? fallbackTotalRaw : NaN;
  if (!Number.isFinite(total) || total <= 0) return null;

  if (mode === "bulk") {
    const quantity = Number(line?.quantity ?? line?.quantity_lbs ?? 0);
    return quantity > 0 ? total / quantity : null;
  }

  const units = Number(line?.units || 0);
  return units > 0 ? total / units : null;
}

function lineQuantityLabel(line: any, mode: MenuMode | "pre_roll", category: MenuCategory | "" | null): string {
  const quantityLbs = Number(line?.quantity_lbs || 0);
  const quantity = Number(line?.quantity || 0);
  const quantityUnit = String(line?.quantity_unit || "").toLowerCase();
  const units = Number(line?.units || 0);
  if (mode === "bulk") {
    if (category === "vape" && quantityUnit === "g" && Number.isFinite(quantity) && quantity > 0) {
      return `${litersFromGrams(quantity).toFixed(2)} L`;
    }
    if (quantityUnit === "g" && Number.isFinite(quantity) && quantity > 0) return `${quantity.toFixed(0)} g`;
    if (quantityUnit === "lb" && Number.isFinite(quantity) && quantity > 0) return `${quantity.toFixed(2)} lb`;
    if (category === "vape" && Number.isFinite(quantityLbs) && quantityLbs > 0) {
      return `${litersFromGrams(quantityLbs * GRAMS_PER_LB).toFixed(2)} L`;
    }
    return `${Number.isFinite(quantityLbs) && quantityLbs > 0 ? quantityLbs.toFixed(2) : "1.00"} lb`;
  }
  return `${Number.isFinite(units) && units > 0 ? units : 1} units`;
}

function clampYieldPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function deriveExpectedRange(args: {
  category: MenuCategory | "";
  mode: CardMode;
  startingWeightLbs: number;
  startingWeightGrams: number;
  unitSize: string;
  preRollPackQty: number;
  hasInternalInfusion: boolean;
  hasExternalInfusion: boolean;
  internalInfusionProductName?: string | null;
  infusionSettings: InfusionSettings;
  yields: YieldSettings;
}): {
  low: number;
  high: number;
  label: string;
  disclaimer?: string;
  internalSummary?: string;
  externalSummary?: string;
  internalInfusionGPerLb?: number;
  externalDistillatePerUnit?: number;
  externalKiefPerUnit?: number;
  externalFlowerPerUnit?: number;
} {
  const {
    category,
    mode,
    startingWeightLbs,
    startingWeightGrams,
    unitSize,
    preRollPackQty,
    hasInternalInfusion,
    hasExternalInfusion,
    internalInfusionProductName,
    infusionSettings,
    yields,
  } = args;
  const gramsPerUnit = gramsFromUnitSize(unitSize) * (mode === "pre_roll" ? Math.max(1, preRollPackQty) : 1);
  if (category === "flower") {
    if (mode === "pre_roll" && (hasInternalInfusion || hasExternalInfusion)) {
      const jointG = gramsFromUnitSize(unitSize);
      const packQty = Math.max(1, preRollPackQty);
      const gPerLb = Math.max(0, Number(infusionSettings.internalGPerLb || 80));
      const expected = calculateInfusedPreRollExpectedUnits({
        startingWeightLbs,
        farmersPoundGrams: Number(infusionSettings.farmersPoundGrams || 454),
        unitSize,
        preRollPackQty: packQty,
        baseUnitsPerLb: Number(yields.prerollBaseUnitsPerLbBySize[unitSize] || 0),
        finishedGoodsYieldPct: clampYieldPct(yields.prerollYieldPctBySize[unitSize] ?? yields.prerollYieldPct),
        hasInternalInfusion,
        internalTargetGPerLb: gPerLb,
        internalLossPct: clampYieldPct(infusionSettings.internalLossPct),
        internalThcaLossPct: clampYieldPct(infusionSettings.internalThcaLossPct),
        useThcaInternalLoss: /\bthca\b/i.test(String(internalInfusionProductName || "")),
        hasExternalInfusion,
        externalLiquidTargetGPerUnit1g: Math.max(0, Number(infusionSettings.externalDistillatePer1g || 0.1)),
        externalLiquidLossPct: clampYieldPct(infusionSettings.externalDistillateLossPct),
        externalDryTargetGPerUnit1g: Math.max(0, Number(infusionSettings.externalKiefPer1g || 0.15)),
        externalDryLossPct: clampYieldPct(infusionSettings.externalKiefLossPct),
      });
      return {
        low: expected.lowUnits,
        high: expected.highUnits,
        label: `Expected units: ${expected.lowUnits.toLocaleString()}-${expected.highUnits.toLocaleString()}`,
        internalInfusionGPerLb: gPerLb,
        externalDistillatePerUnit: Math.max(0, Number(infusionSettings.externalDistillatePer1g || 0.1)) * jointG * packQty,
        externalKiefPerUnit: Math.max(0, Number(infusionSettings.externalKiefPer1g || 0.15)) * jointG * packQty,
        externalFlowerPerUnit: expected.highUnits > 0
          ? Math.floor((expected.baseFlowerGrams / expected.highUnits) * 100) / 100
          : 0,
      };
    }
    const startG = Math.max(0, startingWeightLbs) * GRAMS_PER_LB;
    const high = Math.max(0, Math.floor(startG / Math.max(1e-9, gramsPerUnit)));
    const pct = clampYieldPct(
      mode === "pre_roll"
        ? (yields.prerollYieldPctBySize[unitSize] ?? yields.prerollYieldPct)
        : (yields.flowerYieldPctBySize[unitSize] ?? yields.flowerYieldPct),
    );
    const low = Math.max(0, Math.floor(high * pct));
    return { low, high, label: `Expected units: ${low.toLocaleString()}-${high.toLocaleString()}` };
  }
  if (category === "concentrate") {
    const startG = Math.max(0, startingWeightGrams);
    const pct = clampYieldPct(yields.concentrateYieldPct);
    const low = Math.max(0, Math.floor(startG * pct));
    const high = Math.max(0, Math.floor(startG));
    return {
      low,
      high,
      label: `Expected finished grams: ${low.toLocaleString()}-${high.toLocaleString()}`,
      disclaimer: "Final yield depends on process and loss. Estimate assumes configured yield settings.",
    };
  }
  const startG = Math.max(0, startingWeightGrams);
  const pct = clampYieldPct(yields.vapeFillYieldPct);
  const low = Math.max(0, Math.floor((startG * pct) / Math.max(1e-9, gramsPerUnit)));
  const high = Math.max(0, Math.floor(startG / Math.max(1e-9, gramsPerUnit)));
  return {
    low,
    high,
    label: `Expected units: ${low.toLocaleString()}-${high.toLocaleString()}`,
    disclaimer: "Final yield depends on process and loss. Estimate assumes configured yield settings.",
  };
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

function inferPackagingCategoryFromContext(mode: CardMode, category: MenuCategory | ""): PackagingCategory | "" {
  if (mode === "pre_roll") return "pre_roll";
  if (category === "flower" || category === "concentrate" || category === "vape") return category;
  return "";
}

type EstimateSummary = {
  lines: EstimateCartLine[];
  total: number;
  packagingReviewPending: boolean;
  attachedCustomerId: string;
  attachedCustomerLabel: string;
};

function mapEstimateLine(line: any): EstimateCartLine {
  const mode = modeFromLine(line?.mode, line?.pre_roll_mode);
  const category = String(line?.pre_roll_mode || "").trim()
    ? "pre_roll"
    : normalizeCategory(line?.offers?.products?.category) || null;
  const quantityLabel = lineQuantityLabel(line, mode, category);
  const infusionInputs =
    line?.infusion_inputs && typeof line.infusion_inputs === "object"
      ? (line.infusion_inputs as Record<string, any>)
      : null;
  const internalInput =
    infusionInputs?.internal && typeof infusionInputs.internal === "object"
      ? (infusionInputs.internal as Record<string, any>)
      : null;
  const externalInput =
    infusionInputs?.external && typeof infusionInputs.external === "object"
      ? (infusionInputs.external as Record<string, any>)
      : null;
  const packagingBreakdown =
    infusionInputs?.cost_breakdown?.packaging && typeof infusionInputs.cost_breakdown.packaging === "object"
      ? (infusionInputs.cost_breakdown.packaging as Record<string, any>)
      : null;
  const lineTotalRaw = Number(line?.line_sell_total);
  const fallbackTotalRaw = Number(line?.line_total);
  const productTitle = normalizeWhitespace(String(line?.offers?.products?.name || line?.offers?.name || ""));
  const fallbackTitle = normalizeWhitespace(String(line?.notes || "Estimate line"));

  return {
    id: String(line?.id || crypto.randomUUID()),
    offerId: String(line?.offer_id || ""),
    title: productTitle || fallbackTitle,
    category,
    mode,
    quantityLabel,
    lineTotal: Number.isFinite(lineTotalRaw) ? lineTotalRaw : Number.isFinite(fallbackTotalRaw) ? fallbackTotalRaw : null,
    notes: line?.notes ? String(line.notes) : "",
    packagingMode: line?.packaging_mode ? String(line.packaging_mode) : null,
    packagingSubmissionId: line?.packaging_submission_id ? String(line.packaging_submission_id) : null,
    unitSize: line?.unit_size ? String(line.unit_size) : null,
    units: Number.isFinite(Number(line?.units)) ? Number(line.units) : null,
    quantity: Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : null,
    quantityUnit: ["lb", "g", "units"].includes(String(line?.quantity_unit || "").toLowerCase())
      ? (String(line.quantity_unit).toLowerCase() as "lb" | "g" | "units")
      : null,
    preRollPackQty: Number.isFinite(Number(line?.pre_roll_pack_qty)) ? Number(line.pre_roll_pack_qty) : null,
    preRollMode: line?.pre_roll_mode ? String(line.pre_roll_mode) : null,
    packagingSkuId: line?.packaging_sku_id ? String(line.packaging_sku_id) : null,
    secondaryPackagingSkuId: line?.secondary_packaging_sku_id ? String(line.secondary_packaging_sku_id) : null,
    packagingPrimaryLabel: packagingBreakdown?.primary_label ? String(packagingBreakdown.primary_label) : null,
    packagingSecondaryLabel: packagingBreakdown?.secondary_label ? String(packagingBreakdown.secondary_label) : null,
    materialTotal: Number.isFinite(Number(line?.material_total)) ? Number(line.material_total) : null,
    packagingTotal: Number.isFinite(Number(line?.packaging_total)) ? Number(line.packaging_total) : null,
    laborTotal: Number.isFinite(Number(line?.labor_total)) ? Number(line.labor_total) : null,
    coaTotal: Number.isFinite(Number(line?.coa_total)) ? Number(line.coa_total) : null,
    unitPrice: lineUnitPrice(line, mode),
    internalInfusionProductId: internalInput?.product_id ? String(internalInput.product_id) : null,
    externalLiquidProductId: externalInput?.liquid_product_id ? String(externalInput.liquid_product_id) : null,
    externalDryProductId: externalInput?.dry_product_id ? String(externalInput.dry_product_id) : null,
    internalInfusionProductName: internalInput?.product_name ? String(internalInput.product_name) : null,
    externalLiquidProductName: externalInput?.liquid_product_name ? String(externalInput.liquid_product_name) : null,
    externalDryProductName: externalInput?.dry_product_name ? String(externalInput.dry_product_name) : null,
  };
}

export default function MenuClient({
  initialOffers,
  initialYields,
  initialInfusionSettings,
  internalInfusionProducts,
  externalLiquidProducts,
  externalDryProducts,
  canShowDraft = false,
}: {
  initialOffers: Offer[];
  initialYields: YieldSettings;
  initialInfusionSettings: InfusionSettings;
  internalInfusionProducts: InfusionProductOption[];
  externalLiquidProducts: InfusionProductOption[];
  externalDryProducts: InfusionProductOption[];
  canShowDraft?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [menuMode, setMenuMode] = useState<MenuMode>("bulk");
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("flower");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [flowerCultivationFilters, setFlowerCultivationFilters] = useState<string[]>([]);
  const [flowerGradeFilters, setFlowerGradeFilters] = useState<string[]>([]);
  const [concentrateTypeFilters, setConcentrateTypeFilters] = useState<string[]>([]);
  const [vapeMediumFilters, setVapeMediumFilters] = useState<string[]>([]);
  const [preRollMaterialFilters, setPreRollMaterialFilters] = useState<string[]>([]);
  const [showDraftOffers, setShowDraftOffers] = useState(false);
  const [busyByOfferId, setBusyByOfferId] = useState<Record<string, boolean>>({});
  const [errorByOfferId, setErrorByOfferId] = useState<Record<string, string>>({});
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [estimateSummary, setEstimateSummary] = useState<EstimateSummary>({
    lines: [],
    total: 0,
    packagingReviewPending: false,
    attachedCustomerId: "",
    attachedCustomerLabel: "",
  });
  const [routeRunnerEstimateMessage, setRouteRunnerEstimateMessage] = useState<string | null>(null);
  const [cardStateByOfferId, setCardStateByOfferId] = useState<Record<string, OfferCardState>>({});
  const [packagingSkus, setPackagingSkus] = useState<PackagingSku[]>([]);
  const [complianceComplete] = useState(false);
  const processedRouteRunnerHandoffRef = useRef<string | null>(null);
  const yieldSettings = initialYields;

  async function createEstimate(customerId?: string) {
    const res = await fetch("/api/estimate/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerId ? { customer_account_id: customerId } : {}),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json?.error || `Estimate create failed (${res.status})`));

    const estimateId = String((json as any)?.estimate?.id || "");
    if (!estimateId) throw new Error("Estimate id missing");
    setEstimateId(estimateId);
    return estimateId;
  }

  async function ensureEstimateId() {
    const existing = getEstimateId();
    if (existing) return existing;
    return createEstimate();
  }

  async function updateEstimateCustomerLink(estimateId: string, customerId: string) {
    const res = await fetch("/api/estimate/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimate_id: estimateId, customer_id: customerId }),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json?.error || `Customer update failed (${res.status})`));
    return json;
  }

  async function loadEstimateSummary(id: string) {
    if (!id) return;

    const res = await fetch(`/api/estimate/get?id=${encodeURIComponent(id)}`);
    const json = await parseJsonSafe(res);
    if (!res.ok) return null;

    const linesRaw = Array.isArray((json as any)?.lines) ? (json as any).lines : [];
    const lines = linesRaw.map(mapEstimateLine);
    const total = Number((json as any)?.estimate?.total || 0);
    const packagingReviewPending = Boolean((json as any)?.estimate?.packaging_review_pending);
    const attachedCustomer = ((json as any)?.estimate?.attached_customer || null) as Record<string, unknown> | null;
    const nextSummary = {
      lines,
      total: Number.isFinite(total) ? total : 0,
      packagingReviewPending,
      attachedCustomerId: String(attachedCustomer?.id || ""),
      attachedCustomerLabel: String(attachedCustomer?.company_name || attachedCustomer?.contact_name || "").trim(),
    } satisfies EstimateSummary;
    setEstimateSummary(nextSummary);
    return nextSummary;
  }

  async function removeEstimateLine(lineId: string) {
    const estimateId = getEstimateId();
    if (!estimateId || !lineId) return;
    setRemovingLineId(lineId);
    try {
      const res = await fetch("/api/estimate/remove-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_id: estimateId, line_id: lineId }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json?.error || `Remove failed (${res.status})`));
      await loadEstimateSummary(estimateId);
      setEditingLineId((current) => (current === lineId ? null : current));
    } catch (err) {
      console.error("[menu] remove line failed", err);
    } finally {
      setRemovingLineId(null);
    }
  }

  const routeRunnerHandoff = useMemo(() => {
    const from = String(searchParams.get("from") || "").trim();
    const customerId = String(searchParams.get("customerId") || "").trim();
    const routeId = String(searchParams.get("routeId") || "").trim();
    const stopId = String(searchParams.get("stopId") || "").trim();
    if (from !== "route_runner" || !customerId) return null;
    return { customerId, routeId, stopId };
  }, [searchParams]);

  useEffect(() => {
    if (routeRunnerHandoff) return;
    const id = getEstimateId();
    if (id) {
      void loadEstimateSummary(id);
    }
  }, [routeRunnerHandoff]);

  useEffect(() => {
    let ignore = false;
    async function loadPackagingSkus() {
      try {
        const res = await fetch("/api/packaging");
        const json = await parseJsonSafe(res);
        if (!res.ok) throw new Error(String(json?.error || "Failed to load packaging options"));
        const rows = Array.isArray((json as any)?.skus) ? (json as any).skus : [];
        if (!ignore) setPackagingSkus(rows as PackagingSku[]);
      } catch {
        if (!ignore) setPackagingSkus([]);
      }
    }
    void loadPackagingSkus();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!routeRunnerHandoff) return;
    const handoff = routeRunnerHandoff;

    const handoffKey = `${handoff.customerId}:${handoff.routeId}:${handoff.stopId}`;
    if (processedRouteRunnerHandoffRef.current === handoffKey) return;
    processedRouteRunnerHandoffRef.current = handoffKey;

    let cancelled = false;

    async function applyRouteRunnerHandoff() {
      try {
        const existingEstimateId = String(getEstimateId() || "").trim();
        const routeContextLabel = "the route runner";

        if (!existingEstimateId) {
          const estimateId = await createEstimate(handoff.customerId);
          if (cancelled) return;
          await loadEstimateSummary(estimateId);
          if (cancelled) return;
          setRouteRunnerEstimateMessage(`Estimate ready for this customer from ${routeContextLabel}.`);
          return;
        }

        const existingSummary = await loadEstimateSummary(existingEstimateId);
        if (cancelled) return;

        if (!existingSummary?.attachedCustomerId) {
          await updateEstimateCustomerLink(existingEstimateId, handoff.customerId);
          if (cancelled) return;
          await loadEstimateSummary(existingEstimateId);
          if (cancelled) return;
          setRouteRunnerEstimateMessage(`Attached the current estimate to this route customer.`);
          return;
        }

        if (existingSummary.attachedCustomerId === handoff.customerId) {
          setRouteRunnerEstimateMessage(`Continuing the current estimate for this route customer.`);
          return;
        }

        const replacedCustomerLabel = existingSummary.attachedCustomerLabel || "another customer";
        const estimateId = await createEstimate(handoff.customerId);
        if (cancelled) return;
        await loadEstimateSummary(estimateId);
        if (cancelled) return;
        setRouteRunnerEstimateMessage(`Started a new estimate for this customer because the active estimate was already attached to ${replacedCustomerLabel}.`);
      } catch (error: unknown) {
        if (cancelled) return;
        setRouteRunnerEstimateMessage(error instanceof Error ? error.message : "Unable to prepare an estimate for this route customer.");
      } finally {
        if (!cancelled) {
          router.replace("/menu", { scroll: false });
        }
      }
    }

    void applyRouteRunnerHandoff();

    return () => {
      cancelled = true;
    };
  }, [routeRunnerHandoff, router]);

  const publishedOffers = useMemo(
    () => initialOffers.filter((offer) => normalizedLower(offer.status || "published") === "published"),
    [initialOffers]
  );
  const visibleOffers = useMemo(() => {
    if (!canShowDraft || !showDraftOffers) return publishedOffers;
    return initialOffers.filter((offer) => {
      const status = normalizedLower(offer.status || "published");
      return status === "published" || status === "draft";
    });
  }, [initialOffers, canShowDraft, showDraftOffers, publishedOffers]);
  const preRollSourceOffers = useMemo(
    () =>
      visibleOffers.filter((offer) => {
        const category = normalizeCategory(offer.catalog_category || offer.products?.category);
        if (category !== "flower") return false;
        return offer.allow_pre_roll !== false;
      }),
    [visibleOffers]
  );

  useEffect(() => {
    setCardStateByOfferId((prev) => {
      const next: Record<string, OfferCardState> = { ...prev };
      for (const offer of visibleOffers) {
        const offerId = String(offer.id || "");
        const current = next[offerId] || defaultCardState(offer, selectedCategory, menuMode);
        const baseCategory = normalizeCategory(offer.catalog_category || offer.products?.category);
        const desiredMode: CardMode = selectedCategory === "pre_roll" && baseCategory === "flower"
          ? "pre_roll"
          : menuMode === "copack"
            ? "copack"
            : "bulk";
        const desiredUnitSizeOptions = desiredMode === "pre_roll"
          ? [...PRE_ROLL_UNIT_SIZES]
          : CATEGORY_UNIT_SIZES[baseCategory] && CATEGORY_UNIT_SIZES[baseCategory].length > 0
            ? CATEGORY_UNIT_SIZES[baseCategory]
            : ["3.5g"];
        const desiredUnitSize = desiredUnitSizeOptions.includes(current.unitSize)
          ? current.unitSize
          : desiredUnitSizeOptions[0];
        const desiredPreRollPackQty =
          desiredMode === "pre_roll" && current.preRollPackQty === 5 && desiredUnitSize === "1g"
            ? 1
            : current.preRollPackQty;
        if (
          current.mode !== desiredMode
          || current.unitSize !== desiredUnitSize
          || current.preRollPackQty !== desiredPreRollPackQty
        ) {
          next[offerId] = {
            ...current,
            mode: desiredMode,
            unitSize: desiredUnitSize,
            packagingMode: desiredMode === "pre_roll" ? "jcrad" : current.packagingMode,
            packagingSkuId: "",
            secondaryPackagingSkuId: "",
            preRollPackQty: desiredPreRollPackQty,
          };
        }
      }
      return next;
    });
  }, [visibleOffers, selectedCategory, menuMode]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const missingPublishedOffer =
      canShowDraft && showDraftOffers
        ? 0
        : initialOffers.filter((offer) => normalizedLower(offer.status || "published") !== "published").length;
    const wrongCategory = visibleOffers.filter(
      (offer) => normalizeCategory(offer.catalog_category || offer.products?.category) !== "flower"
    ).length;
    const allowPreRollFalse = visibleOffers.filter((offer) => {
      const category = normalizeCategory(offer.catalog_category || offer.products?.category);
      return category === "flower" && offer.allow_pre_roll === false;
    }).length;

    console.log("[menu:preroll-sources]", {
      selectedCategory,
      eligibleFlowerSources: preRollSourceOffers.length,
      sample: preRollSourceOffers.slice(0, 5).map((offer) => ({
        name: normalizeWhitespace(String(offer.catalog_name || offer.products?.name || "Untitled")),
        product_id: productIdForOffer(offer),
      })),
      exclusions: {
        inactive: 0,
        wrongCategory,
        missingPublishedOffer,
        allowPreRollFalse,
      },
    });
  }, [selectedCategory, preRollSourceOffers, initialOffers, visibleOffers, canShowDraft, showDraftOffers]);

  function toggleFilter(setter: Dispatch<SetStateAction<string[]>>, value: string) {
    setter((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  }

  function clearActiveFilters() {
    setFlowerCultivationFilters([]);
    setFlowerGradeFilters([]);
    setConcentrateTypeFilters([]);
    setVapeMediumFilters([]);
    setPreRollMaterialFilters([]);
  }

  function updateCardState(offer: Offer, updater: (prev: OfferCardState) => OfferCardState) {
    const offerId = String(offer.id || "");
    setErrorByOfferId((prev) => (prev[offerId] ? { ...prev, [offerId]: "" } : prev));
    setCardStateByOfferId((prev) => {
      const current = prev[offerId] || defaultCardState(offer, selectedCategory, menuMode);
      return { ...prev, [offerId]: updater(current) };
    });
  }

  function cardStateForOffer(offer: Offer): OfferCardState {
    return cardStateByOfferId[String(offer.id || "")] || defaultCardState(offer, selectedCategory, menuMode);
  }

  function cancelEditingLine() {
    setEditingLineId(null);
  }

  function startEditingLine(lineId: string) {
    const line = estimateSummary.lines.find((entry) => entry.id === lineId);
    if (!line) return;
    const offer = offerById.get(String(line.offerId || ""));
    if (!offer) return;

    const offerCategory = normalizeCategory(offer.catalog_category || offer.products?.category) || "flower";
    const nextCategory = line.mode === "pre_roll" ? "pre_roll" : offerCategory;
    const nextMenuMode = line.mode === "bulk" ? "bulk" : "copack";
    const quantity = Math.max(0, Number(line.quantity || 0));
    const quantityUnit = String(line.quantityUnit || "").toLowerCase();
    const startingWeightLbs = quantityUnit === "g" ? quantity / GRAMS_PER_LB : quantity;
    const startingWeightGrams = quantityUnit === "lb" ? quantity * GRAMS_PER_LB : quantity;

    setSearch("");
    setSelectedCategory(nextCategory);
    setMenuMode(nextMenuMode);
    setEditingLineId(line.id);
    setCardStateByOfferId((prev) => ({
      ...prev,
      [String(offer.id || "")]: {
        ...(prev[String(offer.id || "")] || defaultCardState(offer, nextCategory, nextMenuMode)),
        expanded: true,
        mode: line.mode === "pre_roll" ? "pre_roll" : line.mode === "copack" ? "copack" : "bulk",
        startingWeightLbs,
        startingWeightGrams,
        advancedTargetUnits: Math.max(1, Number(line.units || 1)),
        showAdvancedUnits: line.mode !== "bulk",
        unitSize: String(line.unitSize || (line.mode === "pre_roll" ? PRE_ROLL_UNIT_SIZES[0] : "3.5g")),
        packagingMode: String(line.packagingMode || "").toLowerCase() === "customer" ? "customer" : "jcrad",
        packagingSkuId: String(line.packagingSkuId || ""),
        secondaryPackagingSkuId: String(line.secondaryPackagingSkuId || ""),
        preRollPackQty: Math.max(1, Number(line.preRollPackQty || 1)),
        preRollMode: String(line.preRollMode || PRE_ROLL_MODES[0]),
        internalInfusionProductId: String(line.internalInfusionProductId || ""),
        externalLiquidProductId: String(line.externalLiquidProductId || ""),
        externalDryProductId: String(line.externalDryProductId || ""),
        notes: String(line.notes || ""),
        frontFile: null,
        backFile: null,
      },
    }));

    scrollOfferCardIntoView(String(offer.id || ""), "start");
  }

  const filterGroups = useMemo(() => {
    if (selectedCategory === "flower") {
      return [
        {
          id: "flower-cultivation",
          label: "Cultivation",
          options: FLOWER_CULTIVATION_OPTIONS,
          selected: flowerCultivationFilters,
          onToggle: (value: string) => toggleFilter(setFlowerCultivationFilters, value),
        },
        {
          id: "flower-grade",
          label: "Grade",
          options: FLOWER_GRADE_OPTIONS,
          selected: flowerGradeFilters,
          onToggle: (value: string) => toggleFilter(setFlowerGradeFilters, value),
        },
      ];
    }
    if (selectedCategory === "concentrate") {
      return [
        {
          id: "concentrate-type",
          label: "Type",
          options: CONCENTRATE_TYPE_OPTIONS,
          selected: concentrateTypeFilters,
          onToggle: (value: string) => toggleFilter(setConcentrateTypeFilters, value),
        },
      ];
    }
    if (selectedCategory === "vape") {
      return [
        {
          id: "vape-medium",
          label: "Medium",
          options: VAPE_MEDIUM_OPTIONS,
          selected: vapeMediumFilters,
          onToggle: (value: string) => toggleFilter(setVapeMediumFilters, value),
        },
      ];
    }
    return [
      {
        id: "preroll-material",
        label: "Material",
        options: PRE_ROLL_MATERIAL_OPTIONS,
        selected: preRollMaterialFilters,
        onToggle: (value: string) => toggleFilter(setPreRollMaterialFilters, value),
      },
    ];
  }, [
    selectedCategory,
    flowerCultivationFilters,
    flowerGradeFilters,
    concentrateTypeFilters,
    vapeMediumFilters,
    preRollMaterialFilters,
  ]);

  const offerCards = useMemo(() => {
    const searchValue = normalizeWhitespace(search).toLowerCase();
    const scopedOffers = selectedCategory === "pre_roll"
      ? preRollSourceOffers
      : visibleOffers.filter((offer) => normalizeCategory(offer.catalog_category || offer.products?.category) === selectedCategory);

    return scopedOffers
      .filter((offer) => {
        if (!searchValue) return true;
        const haystack = [
          offer.catalog_name,
          offer.products?.name,
          offer.products?.type,
          offer.products?.tier,
          offer.catalog_category,
        ]
          .map((value) => normalizeWhitespace(String(value || "")).toLowerCase())
          .join(" ");
        return haystack.includes(searchValue);
      })
      .filter((offer) => {
        const badges = productBadgesForOffer(offer);
        const badgeSet = new Set(badges.map((entry) => normalizedLower(entry)));
        const typeRaw = normalizeWhitespace(String(offer.products?.type || ""));
        const tierRaw = normalizeWhitespace(String(offer.products?.tier || ""));
        const type = normalizedLower(typeRaw);
        const tier = normalizedLower(tierRaw);

        if (selectedCategory === "flower") {
          const cultivationActive = flowerCultivationFilters.length > 0;
          const gradeActive = flowerGradeFilters.length > 0;

          if (cultivationActive) {
            const matchesCultivation = flowerCultivationFilters.some((filterValue) => {
              const target = normalizedLower(filterValue);
              return type === target || badgeSet.has(target);
            });
            if (!matchesCultivation) return false;
          }

          if (gradeActive) {
            const matchesGrade = flowerGradeFilters.some((filterValue) => {
              const target = normalizedLower(filterValue);
              return tier === target || badgeSet.has(target);
            });
            if (!matchesGrade) return false;
          }
        }

        if (selectedCategory === "concentrate" && concentrateTypeFilters.length > 0) {
          const primary = type || tier;
          const matches = concentrateTypeFilters.some((filterValue) => {
            const target = normalizedLower(filterValue);
            return primary === target || badgeSet.has(target);
          });
          if (!matches) return false;
        }

        if (selectedCategory === "vape" && vapeMediumFilters.length > 0) {
          const primary = type || tier;
          const matches = vapeMediumFilters.some((filterValue) => {
            const target = normalizedLower(filterValue);
            return primary === target || badgeSet.has(target);
          });
          if (!matches) return false;
        }

        if (selectedCategory === "pre_roll" && preRollMaterialFilters.length > 0) {
          const matches = preRollMaterialFilters.some((filterValue) => {
            const target = normalizedLower(filterValue);
            return type === target || tier === target || badgeSet.has(target);
          });
          if (!matches) return false;
        }

        return true;
      })
      .map((offer): ProductCardItem => {
        const id = String(offer.id || "");
        const categoryLabel = normalizeCategory(offer.catalog_category || offer.products?.category) || "product";
        const category = normalizeCategory(offer.catalog_category || offer.products?.category);
        const cardState = cardStateForOffer(offer);
        const cardMode = cardState.mode;
        const apiMode = cardMode === "pre_roll" ? "copack" : cardMode;
        const isEditingThisOffer = editingLineId != null && estimateSummary.lines.some((line) => line.id === editingLineId && line.offerId === id);
        const addAllowed = cardMode === "pre_roll"
          ? offer.allow_pre_roll !== false
          : apiMode === "bulk"
            ? !!offer.allow_bulk
            : !!offer.allow_copack;
        const isPreRoll = cardMode === "pre_roll";
        const canUsePreRoll = category === "flower" && offer.allow_pre_roll !== false;
        const minOrder = Math.max(0, Number(offer.min_order || 0));
        const estimatorCategory = (category === "concentrate" || category === "vape" ? category : "flower") as "flower" | "concentrate" | "vape";
        const unitSizeOptions = isPreRoll
          ? [...PRE_ROLL_UNIT_SIZES]
          : CATEGORY_UNIT_SIZES[category] && CATEGORY_UNIT_SIZES[category].length > 0
            ? CATEGORY_UNIT_SIZES[category]
            : ["3.5g"];
        const filteredSkus = packagingSkus.filter((sku) => {
          const primarySlot = primaryPackagingSlotForEstimate({
            category: estimatorCategory,
            isPreRoll,
            preRollPackQty: cardState.preRollPackQty,
          });
          if (!skuSupportsPackagingEstimatorSlot(sku, primarySlot)) return false;
          const requestSize = Number(String(cardState.unitSize).replace("g", ""));
          if (!skuMatchesEstimatePrimaryCapacity(sku, {
            category: estimatorCategory,
            isPreRoll,
            unitSizeGrams: requestSize,
          })) {
            return false;
          }
          if (isPreRoll) {
            const skuSize = Number(sku.size_grams || 0);
            const skuQty = Number(sku.pack_qty || 0);
            if (skuSize > 0 && Math.abs(skuSize - requestSize) > 1e-9) return false;
            if (skuQty > 0 && skuQty !== cardState.preRollPackQty) return false;
            return true;
          }
          return true;
        });
        const requestSize = Number(String(cardState.unitSize).replace("g", ""));
        const vapeVesselOptions = category === "vape"
          ? filteredSkus.filter((sku) => isVapeVesselSku(sku))
          : [];
        const secondaryBagOptions = packagingSkus.filter((sku) => {
          return isValidSecondaryPackagingSku(sku, {
            category: estimatorCategory,
            isPreRoll,
            preRollPackQty: cardState.preRollPackQty,
            unitSizeGrams: requestSize,
          });
        });
        const selectedVapePackagingSku = category === "vape"
          ? packagingSkus.find((sku) => String(sku.id) === String(cardState.packagingSkuId))
          : null;
        const requiresSecondaryBag = apiMode === "copack"
          && cardState.packagingMode === "jcrad"
          && (
            (category === "concentrate")
            || (category === "vape" && isVapeVesselSku(selectedVapePackagingSku))
          )
          && !isPreRoll;
        const concentrateMinimumOrderError = category === "concentrate"
          && apiMode === "bulk"
          && minOrder > 0
          && cardState.startingWeightGrams < minOrder
          ? `Minimum bulk order is ${minOrder.toLocaleString()} g.`
          : "";
        const expectedRange = deriveExpectedRange({
          category,
          mode: cardState.mode,
          startingWeightLbs: cardState.startingWeightLbs,
          startingWeightGrams: cardState.startingWeightGrams,
          unitSize: cardState.unitSize,
          preRollPackQty: cardState.preRollPackQty,
          hasInternalInfusion: Boolean(cardState.internalInfusionProductId),
          hasExternalInfusion: Boolean(cardState.externalLiquidProductId || cardState.externalDryProductId),
          internalInfusionProductName:
            internalInfusionProducts.find((product) => product.id === cardState.internalInfusionProductId)?.name || null,
          infusionSettings: initialInfusionSettings,
          yields: yieldSettings,
        });
        const startingWeightUnit: "lb" | "g" = category === "flower" ? "lb" : "g";

        const copackConfig: ProductCardCopackConfig = {
          expanded: cardState.expanded,
          mode: cardState.mode,
          startingWeightLbs: cardState.startingWeightLbs,
          startingWeightGrams: cardState.startingWeightGrams,
          advancedTargetUnits: cardState.advancedTargetUnits,
          showAdvancedUnits: cardState.showAdvancedUnits,
          expectedRangeLabel: expectedRange.label,
          expectedDisclaimer: expectedRange.disclaimer,
          minimumOrderLabel: category === "concentrate" && apiMode === "bulk" && minOrder > 0
            ? `Minimum order: ${minOrder.toLocaleString()} g`
            : undefined,
          startingWeightLabel: startingWeightUnit === "lb" ? "Starting lbs" : "Starting grams",
          startingWeightUnit,
          unitSize: cardState.unitSize,
          packagingMode: cardState.packagingMode,
          packagingSkuId: cardState.packagingSkuId,
          secondaryPackagingSkuId: cardState.secondaryPackagingSkuId,
          preRollPackQty: cardState.preRollPackQty,
          preRollMode: cardState.preRollMode,
          allowedModes: category === "flower"
            ? (["bulk", "copack", ...(canUsePreRoll ? ["pre_roll" as const] : [])].filter((modeOption) => {
              if (modeOption === "bulk") return !!offer.allow_bulk;
              if (modeOption === "copack") return !!offer.allow_copack;
              return canUsePreRoll;
            }) as CardMode[])
            : (["bulk", "copack"].filter((modeOption) => (modeOption === "bulk" ? !!offer.allow_bulk : !!offer.allow_copack)) as CardMode[]),
          internalInfusionProductId: cardState.internalInfusionProductId,
          externalLiquidProductId: cardState.externalLiquidProductId,
          externalDryProductId: cardState.externalDryProductId,
          internalSummary: expectedRange.internalSummary,
          externalSummary: expectedRange.externalSummary,
          internalInfusionGPerLb: Number(expectedRange.internalInfusionGPerLb || initialInfusionSettings.internalGPerLb),
          externalDistillatePerUnit: Number(expectedRange.externalDistillatePerUnit || 0),
          externalKiefPerUnit: Number(expectedRange.externalKiefPerUnit || 0),
          externalFlowerPerUnit: Number(expectedRange.externalFlowerPerUnit || 0),
          internalInfusionOptions: internalInfusionProducts,
          externalLiquidOptions: externalLiquidProducts,
          externalDryOptions: externalDryProducts,
          notes: cardState.notes,
          frontFileName: cardState.frontFile?.name || "",
          backFileName: cardState.backFile?.name || "",
          requiresSecondaryBag,
          unitSizeOptions,
          secondaryPackagingLabel: "Secondary bag",
          packagingOptions: (category === "vape" ? vapeVesselOptions : filteredSkus).map((sku) => ({ id: String(sku.id), name: String(sku.name || "SKU") })),
          secondaryBagOptions: secondaryBagOptions.map((sku) => ({ id: String(sku.id), name: String(sku.name || "SKU") })),
          onExpandedChange: (next) => updateCardState(offer, (prev) => ({ ...prev, expanded: next })),
          onModeChange: (next) => {
            updateCardState(offer, (prev) => ({
              ...prev,
              mode: next,
              expanded: next === "bulk" ? category === "flower" : true,
              unitSize:
                next === "pre_roll"
                  ? (PRE_ROLL_UNIT_SIZES.includes(prev.unitSize as (typeof PRE_ROLL_UNIT_SIZES)[number]) ? prev.unitSize : PRE_ROLL_UNIT_SIZES[0])
                  : (CATEGORY_UNIT_SIZES[category] && CATEGORY_UNIT_SIZES[category].includes(prev.unitSize) ? prev.unitSize : unitSizeOptions[0]),
              packagingMode: next === "pre_roll" ? "jcrad" : prev.packagingMode,
              packagingSkuId: "",
              secondaryPackagingSkuId: "",
              preRollPackQty: next === "pre_roll" ? prev.preRollPackQty : 1,
              preRollMode: next === "pre_roll" ? prev.preRollMode : PRE_ROLL_MODES[0],
              internalInfusionProductId: next === "bulk" ? "" : prev.internalInfusionProductId,
              externalLiquidProductId: next === "pre_roll" ? prev.externalLiquidProductId : "",
              externalDryProductId: next === "pre_roll" ? prev.externalDryProductId : "",
            }));
            if (next !== "bulk") scrollOfferCardIntoView(id, "center");
          },
          onStartingWeightLbsChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            startingWeightLbs: Number.isFinite(next) ? next : prev.startingWeightLbs,
          })),
          onStartingWeightGramsChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            startingWeightGrams: Number.isFinite(next) ? next : prev.startingWeightGrams,
            startingWeightLbs: Number.isFinite(next) ? next / GRAMS_PER_LB : prev.startingWeightLbs,
          })),
          onAdvancedTargetUnitsChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            advancedTargetUnits: Number.isFinite(next) ? next : prev.advancedTargetUnits,
          })),
          onShowAdvancedUnitsChange: (next) => updateCardState(offer, (prev) => ({ ...prev, showAdvancedUnits: next })),
          onUnitSizeChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            unitSize: next,
            packagingSkuId: "",
            preRollPackQty: prev.mode === "pre_roll" && prev.preRollPackQty === 5 && next === "1g" ? 1 : prev.preRollPackQty,
          })),
          onPackagingModeChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            packagingMode: prev.mode === "pre_roll" ? "jcrad" : next,
          })),
          onPackagingSkuChange: (next) => updateCardState(offer, (prev) => ({ ...prev, packagingSkuId: next })),
          onSecondaryPackagingSkuChange: (next) => updateCardState(offer, (prev) => ({ ...prev, secondaryPackagingSkuId: next })),
          onPreRollPackQtyChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            preRollPackQty: next,
            packagingSkuId: "",
            secondaryPackagingSkuId: next >= 2 ? prev.secondaryPackagingSkuId : "",
          })),
          onPreRollModeChange: (next) => updateCardState(offer, (prev) => ({ ...prev, preRollMode: next })),
          onInternalInfusionProductChange: (next) => updateCardState(offer, (prev) => ({ ...prev, internalInfusionProductId: next })),
          onExternalLiquidProductChange: (next) => updateCardState(offer, (prev) => ({ ...prev, externalLiquidProductId: next })),
          onExternalDryProductChange: (next) => updateCardState(offer, (prev) => ({ ...prev, externalDryProductId: next })),
          onNotesChange: (next) => updateCardState(offer, (prev) => ({ ...prev, notes: next })),
          onFrontFileChange: (next) => updateCardState(offer, (prev) => ({ ...prev, frontFile: next })),
          onBackFileChange: (next) => updateCardState(offer, (prev) => ({ ...prev, backFile: next })),
        };

        return {
          id,
          title: normalizeWhitespace(String(offer.catalog_name || offer.products?.name || "Untitled Product")),
          href: `/menu/offer/${id}`,
          imageUrl: offer.image_url || null,
          videoUrl: offer.video_url || null,
          categoryLabel: categoryLabel.replace("_", "-"),
          badges: productBadgesForOffer(offer).map((label) => ({ label })),
          availabilityLabel: availabilityLabelForOffer(offer),
          pricingLabel: pricingLabelForOffer(offer),
          addDisabled: !addAllowed || Boolean(concentrateMinimumOrderError),
          addLoading: !!busyByOfferId[id],
          addButtonLabel: isEditingThisOffer ? "Save Changes" : "Add to Estimate",
          isEditing: isEditingThisOffer,
          errorText: errorByOfferId[id] || concentrateMinimumOrderError,
          copackConfig,
        };
      });
  }, [
    visibleOffers,
    preRollSourceOffers,
    selectedCategory,
    search,
    menuMode,
    busyByOfferId,
    errorByOfferId,
    flowerCultivationFilters,
    flowerGradeFilters,
    concentrateTypeFilters,
    vapeMediumFilters,
    preRollMaterialFilters,
    cardStateByOfferId,
    packagingSkus,
    initialInfusionSettings,
    internalInfusionProducts,
    externalLiquidProducts,
    externalDryProducts,
  ]);

  const offerById = useMemo(() => {
    const map = new Map<string, Offer>();
    for (const offer of visibleOffers) map.set(String(offer.id || ""), offer);
    return map;
  }, [visibleOffers]);

  const cartLines = estimateSummary.lines;
  const cartTotal = estimateSummary.total;
  const estimateHref = "/estimate";
  const hasCustomerPackagingInCart = useMemo(
    () => cartLines.some((line) => String(line.packagingMode || "").toLowerCase() === "customer"),
    [cartLines],
  );
  const preferredCustomerPackagingCategory = useMemo(() => {
    for (const line of cartLines) {
      if (String(line.packagingMode || "").toLowerCase() !== "customer") continue;
      if (!line.category) continue;
      return line.category;
    }
    return "";
  }, [cartLines]);
  const packagingReviewPending = hasCustomerPackagingInCart && estimateSummary.packagingReviewPending;
  const displayCartLines = useMemo(() => {
    return cartLines.map((line) => {
      const offer = offerById.get(String(line.offerId || ""));
      const category = normalizeCategory(offer?.catalog_category || offer?.products?.category);
      if (!category) return line;

      const isPreRoll = line.mode === "pre_roll" || Boolean(line.preRollMode);
      const unitSize = line.unitSize || "1g";
      const preRollPackQty = Math.max(1, Number(line.preRollPackQty || 1));
      const quantity = Math.max(0, Number(line.quantity || 0));
      const quantityUnit = String(line.quantityUnit || "").toLowerCase();
      const startingWeightLbs = quantityUnit === "lb" ? quantity : quantityUnit === "g" ? quantity / GRAMS_PER_LB : 0;
      const startingWeightGrams = quantityUnit === "g" ? quantity : quantityUnit === "lb" ? quantity * GRAMS_PER_LB : 0;
      const expected = deriveExpectedRange({
        category,
        mode: isPreRoll ? "pre_roll" : line.mode === "copack" ? "copack" : "bulk",
        startingWeightLbs,
        startingWeightGrams,
        unitSize,
        preRollPackQty,
        hasInternalInfusion: false,
        hasExternalInfusion: false,
        internalInfusionProductName: null,
        infusionSettings: initialInfusionSettings,
        yields: yieldSettings,
      });
      const lineText = `${String(line.title || "")} ${String(line.notes || "")}`.toLowerCase();
      const isHeatShrinkLine = /heat\s*shrink/.test(lineText);
      const isAddonLine = !String(line.offerId || "").trim() || isHeatShrinkLine;
      const showExpectedRange = line.mode !== "bulk" && !isAddonLine;
      const startingWeightLabel = category === "flower"
        ? `Starting weight: ${startingWeightLbs.toFixed(2)} lb`
        : category === "vape"
          ? `Starting volume: ${litersFromGrams(startingWeightGrams).toFixed(2)} L`
          : `Starting weight: ${startingWeightGrams.toFixed(0)} g`;
      return {
        ...line,
        expectedRangeLabel: showExpectedRange ? expected.label : undefined,
        startingWeightLabel,
      };
    });
  }, [cartLines, offerById, initialInfusionSettings, yieldSettings]);
  const menuEstimateCtaLabel = displayCartLines.length > 0 ? "View Estimate" : "Estimate Cart";

  async function addLineToEstimate(offer: Offer) {
    const cardState = cardStateForOffer(offer);
    const estimateId = await ensureEstimateId();
    const editingLine = editingLineId
      ? estimateSummary.lines.find((line) => line.id === editingLineId && line.offerId === String(offer.id || ""))
      : null;
    const category = normalizeCategory(offer.catalog_category || offer.products?.category);
    const mode = cardState.mode;
    const apiMode = mode === "pre_roll" ? "copack" : mode;
    const packagingMode = apiMode === "bulk" ? null : cardState.packagingMode;
    const minOrder = Math.max(0, Number(offer.min_order || 0));
    const expectedRange = deriveExpectedRange({
      category,
      mode,
      startingWeightLbs: cardState.startingWeightLbs,
      startingWeightGrams: cardState.startingWeightGrams,
      unitSize: cardState.unitSize,
      preRollPackQty: cardState.preRollPackQty,
      hasInternalInfusion: Boolean(cardState.internalInfusionProductId),
      hasExternalInfusion: Boolean(cardState.externalLiquidProductId || cardState.externalDryProductId),
      internalInfusionProductName:
        internalInfusionProducts.find((product) => product.id === cardState.internalInfusionProductId)?.name || null,
      infusionSettings: initialInfusionSettings,
      yields: yieldSettings,
    });
    const derivedUnits = Math.max(1, expectedRange.high);
    let requestUnits = cardState.showAdvancedUnits
      ? Math.max(1, Number(cardState.advancedTargetUnits || 0))
      : derivedUnits;
    if (mode === "copack" && category === "flower") {
      const maxUnits = Math.max(1, expectedRange.high);
      requestUnits = Math.min(requestUnits, maxUnits);
    }
    const hasInternalInfusion = Boolean(cardState.internalInfusionProductId);
    const hasExternalInfusion = Boolean(cardState.externalLiquidProductId || cardState.externalDryProductId);
    const resolvedPreRollMode = preRollModeFromInfusion({
      packQty: cardState.preRollPackQty,
      hasInternal: hasInternalInfusion,
      hasExternal: hasExternalInfusion,
    });
    const requiresSecondaryBag = apiMode === "copack"
      && packagingMode === "jcrad"
      && mode !== "pre_roll"
      && (
        category === "concentrate"
        || (
          category === "vape"
          && isVapeVesselSku(packagingSkus.find((sku) => String(sku.id) === String(cardState.packagingSkuId)))
        )
      );
    if (apiMode === "bulk" && !offer.allow_bulk) {
      throw new Error("This product is not available for bulk.");
    }
    if (apiMode === "copack" && !offer.allow_copack) {
      throw new Error("This product is not available for copack.");
    }
    if (mode === "pre_roll" && offer.allow_pre_roll === false) {
      throw new Error("This flower is marked unavailable for pre-roll.");
    }
    if (apiMode === "copack" && packagingMode === "jcrad" && !cardState.packagingSkuId) {
      throw new Error(category === "vape" ? "Select a vape vessel SKU (510 cart or AIO)." : "Select a packaging SKU.");
    }
    if (apiMode === "bulk" && category === "vape" && cardState.startingWeightGrams <= 0) {
      throw new Error("Bulk requires quantity liters > 0.");
    }
    if (apiMode === "bulk" && category === "concentrate" && cardState.startingWeightGrams <= 0) {
      throw new Error("Bulk requires quantity grams > 0.");
    }
    if (apiMode === "bulk" && category !== "vape" && cardState.startingWeightLbs <= 0) {
      throw new Error("Bulk requires quantity lbs > 0.");
    }
    if (apiMode === "bulk" && category === "concentrate" && minOrder > 0 && cardState.startingWeightGrams < minOrder) {
      throw new Error(`Minimum bulk order is ${minOrder.toLocaleString()} g.`);
    }
    if ((mode === "copack" || mode === "pre_roll") && category === "flower" && cardState.startingWeightLbs <= 0) {
      throw new Error("Starting lbs must be > 0.");
    }
    if ((mode === "copack" || mode === "pre_roll") && (category === "concentrate" || category === "vape") && cardState.startingWeightGrams <= 0) {
      throw new Error("Starting grams must be > 0.");
    }
    if (requiresSecondaryBag && !cardState.secondaryPackagingSkuId) {
      throw new Error("Select a secondary bag SKU.");
    }
    if (apiMode === "copack" && packagingMode === "jcrad" && category === "vape" && cardState.packagingSkuId) {
      const vesselSku = packagingSkus.find((sku) => String(sku.id) === String(cardState.packagingSkuId));
      if (!vesselSku || !isVapeVesselSku(vesselSku)) {
        throw new Error("Select a vape vessel SKU (510 cart or AIO).");
      }
      if (isVapeVesselSku(vesselSku) && cardState.secondaryPackagingSkuId) {
        const bagSku = packagingSkus.find((sku) => String(sku.id) === String(cardState.secondaryPackagingSkuId));
        if (!isValidSecondaryPackagingSku(bagSku, {
          category: "vape",
          isPreRoll: false,
          preRollPackQty: cardState.preRollPackQty,
          unitSizeGrams: Number(String(cardState.unitSize).replace("g", "")),
        })) {
          throw new Error("Select a valid secondary bag SKU for this unit size.");
        }
      }
    }
    if (mode === "pre_roll" && cardState.preRollPackQty === 5 && cardState.unitSize === "1g") {
      throw new Error("5-pack pre-rolls are only allowed in 0.5g or 0.75g.");
    }
    if (hasExternalInfusion && mode !== "pre_roll") {
      throw new Error("External infusion is only available for pre-roll lines.");
    }
    if (mode === "pre_roll" && hasExternalInfusion && (!cardState.externalLiquidProductId || !cardState.externalDryProductId)) {
      throw new Error("Select both external liquid and dry infusion inputs.");
    }

    let packagingSubmissionId: string | null = null;
    if (apiMode === "copack" && packagingMode === "customer") {
      if (!cardState.frontFile && !cardState.backFile && editingLine?.packagingSubmissionId) {
        packagingSubmissionId = editingLine.packagingSubmissionId;
      } else if (!cardState.frontFile || !cardState.backFile) {
        throw new Error("Upload both front and back artwork for client packaging.");
      } else {
        const packagingCategory = inferPackagingCategoryFromContext(mode, category);
        if (!packagingCategory) {
          throw new Error("Unable to infer packaging category for this product.");
        }
        const form = new FormData();
        form.set("estimate_id", estimateId);
        form.set("category", packagingCategory);
        form.set("notes", cardState.notes || "");
        form.set("front_file", cardState.frontFile);
        form.set("back_file", cardState.backFile);
        const submissionRes = await fetch("/api/packaging/submission/create", {
          method: "POST",
          body: form,
        });
        const submissionJson = await parseJsonSafe(submissionRes);
        if (!submissionRes.ok) {
          throw new Error(String(submissionJson?.error || `Packaging submission failed (${submissionRes.status})`));
        }
        packagingSubmissionId = String((submissionJson as any)?.submission?.id || "");
        if (!packagingSubmissionId) throw new Error("Packaging submission id missing.");
      }
    }

    const vapeBulkGrams = apiMode === "bulk" && category === "vape"
      ? Math.max(0, Number(cardState.startingWeightGrams || 0))
      : 0;
    const concentrateBulkGrams = apiMode === "bulk" && category === "concentrate"
      ? Math.max(0, Number(cardState.startingWeightGrams || 0))
      : 0;
    const payload: Record<string, unknown> = {
      estimate_id: estimateId,
      line_id: editingLine?.id || null,
      offer_id: offer.id,
      mode: apiMode,
      quantity_lbs: apiMode === "bulk" && (category === "vape" || category === "concentrate")
        ? (category === "vape" ? vapeBulkGrams : concentrateBulkGrams) / GRAMS_PER_LB
        : Math.max(0, Number(cardState.startingWeightLbs || 0)),
      quantity: (apiMode === "bulk" && (category === "vape" || category === "concentrate"))
        ? (category === "vape" ? vapeBulkGrams : concentrateBulkGrams)
        : (category === "concentrate" || category === "vape")
        ? Math.max(0, Number(cardState.startingWeightGrams || 0))
        : Math.max(0, Number(cardState.startingWeightLbs || 0)),
      quantity_unit: (apiMode === "bulk" && (category === "vape" || category === "concentrate"))
        ? "g"
        : (category === "concentrate" || category === "vape")
          ? "g"
          : "lb",
      starting_weight_lbs: category === "flower" ? Math.max(0, Number(cardState.startingWeightLbs || 0)) : null,
      starting_weight_g: (category === "concentrate" || category === "vape")
        ? Math.max(0, Number(cardState.startingWeightGrams || 0))
        : null,
      units: apiMode === "bulk" ? 0 : requestUnits,
      unit_size: cardState.unitSize,
      packaging_mode: packagingMode,
      packaging_sku_id: apiMode === "copack" && packagingMode === "jcrad" ? cardState.packagingSkuId || null : null,
      secondary_packaging_sku_id: requiresSecondaryBag ? cardState.secondaryPackagingSkuId || null : null,
      packaging_submission_id: packagingSubmissionId,
      extra_touch_points: 0,
      pre_roll_mode: mode === "pre_roll" ? resolvedPreRollMode : null,
      pre_roll_pack_qty: mode === "pre_roll" ? cardState.preRollPackQty : 1,
      notes: cardState.notes || "",
    };
    if (category === "vape") {
      payload.infusion_type = "none";
      payload.infusion_inputs = { internal: null, external: null };
      payload.internal_infusion_product_id = null;
    }
    if ((mode === "copack" || mode === "pre_roll") && category === "flower") {
      const internalProduct = internalInfusionProducts.find((p) => p.id === cardState.internalInfusionProductId) || null;
      const externalLiquidProduct = externalLiquidProducts.find((p) => p.id === cardState.externalLiquidProductId) || null;
      const externalDryProduct = externalDryProducts.find((p) => p.id === cardState.externalDryProductId) || null;
      payload.infusion_type = hasExternalInfusion ? "external" : hasInternalInfusion ? "internal" : "none";
      payload.infusion_inputs = {
        internal: hasInternalInfusion
          ? {
            product_id: internalProduct?.id || cardState.internalInfusionProductId,
            product_name: internalProduct?.name || "",
            g_per_lb: Number(initialInfusionSettings.internalGPerLb || 80),
          }
          : null,
        external: hasExternalInfusion
          ? {
            liquid_product_id: externalLiquidProduct?.id || cardState.externalLiquidProductId,
            liquid_product_name: externalLiquidProduct?.name || "",
            dry_product_id: externalDryProduct?.id || cardState.externalDryProductId,
            dry_product_name: externalDryProduct?.name || "",
            dist_per_1g: Number(initialInfusionSettings.externalDistillatePer1g || 0.1),
            dry_per_1g: Number(initialInfusionSettings.externalKiefPer1g || 0.15),
          }
          : null,
      };
    }

    const res = await fetch("/api/estimate/add-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json?.error || `Add line failed (${res.status})`));
    const returnedEstimateId = String((json as any)?.estimate_id || estimateId);
    if (returnedEstimateId) setEstimateId(returnedEstimateId);
    await loadEstimateSummary(returnedEstimateId);
    if (editingLine) setEditingLineId(null);
  }

  async function onAdd(offerId: string) {
    const offer = offerById.get(offerId);
    if (!offer) return;

    setBusyByOfferId((prev) => ({ ...prev, [offerId]: true }));
    setErrorByOfferId((prev) => ({ ...prev, [offerId]: "" }));

    try {
      await addLineToEstimate(offer);
    } catch (error: unknown) {
      setErrorByOfferId((prev) => ({
        ...prev,
        [offerId]: error instanceof Error ? error.message : "Failed to add line.",
      }));
    } finally {
      setBusyByOfferId((prev) => ({ ...prev, [offerId]: false }));
    }
  }

  function onSendEstimatePdf() {
    const estimateId = getEstimateId();
    if (!estimateId) {
      router.push("/estimate");
      return;
    }
    const href = `/estimate/${encodeURIComponent(estimateId)}/print`;
    router.push(href);
  }

  function onRequestOrder() {
    if (packagingReviewPending) {
      router.push("/estimate");
      return;
    }
    if (complianceComplete) {
      router.push("/estimate");
      return;
    }
    router.push("/portal/onboarding");
  }

  const branding = (
    <div className="flex items-center gap-4">
      <img src="/brand/greyscale.png" alt="Motley Terpz" className="h-12 w-auto" />
      <div className="hidden sm:block text-sm text-[#2f4654]">Wholesale • Copack • Fast turnaround</div>
    </div>
  );
  const requestSamplesHref = "/marketing/contact";
  const emptyMessage = canShowDraft && showDraftOffers
    ? "No published or draft offers in this category yet. More dropping soon."
    : "No published offers in this category yet. More dropping soon.";

  const cartPanel = (
    <EstimateCartPanel
      lines={displayCartLines}
      total={cartTotal}
      estimateHref={estimateHref}
      onRemoveLine={removeEstimateLine}
      onEditLine={startEditingLine}
      onCancelEdit={cancelEditingLine}
      removingLineId={removingLineId}
      editingLineId={editingLineId}
      onSendEstimatePdf={onSendEstimatePdf}
      onRequestOrder={onRequestOrder}
      requestOrderLocked={!complianceComplete || packagingReviewPending}
      requestOrderLockReason={
        packagingReviewPending
          ? "Packaging approval is required before requesting an order."
          : "Complete compliance docs before requesting an order."
      }
      complianceIncomplete={!complianceComplete}
      complianceHref="/portal/onboarding"
      hasCustomerPackaging={hasCustomerPackagingInCart}
      packagingReviewPending={packagingReviewPending}
      packagingUploadHref={
        preferredCustomerPackagingCategory
          ? `/dashboard/packaging?category=${encodeURIComponent(preferredCustomerPackagingCategory)}&returnTo=%2Fmenu`
          : "/dashboard/packaging?returnTo=%2Fmenu"
      }
    />
  );

  return (
    <MenuLayout
      branding={branding}
      valueStrip="Wholesale • Copack • Fast turnaround • Compliance-first"
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href={requestSamplesHref}
            className="inline-flex rounded-full border border-[#decee9] px-3 py-2 text-xs font-semibold text-[#2a4655] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
          >
            Request Samples / Book Call
          </Link>
          <Link
            href={estimateHref}
            className="inline-flex rounded-full bg-[#8f52dc] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-95"
          >
            {menuEstimateCtaLabel} ({displayCartLines.length})
          </Link>
        </div>
      }
      mobileHeaderActions={
        <Link
          href={estimateHref}
          className="inline-flex rounded-full bg-[#8f52dc] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95"
        >
          View Estimate
        </Link>
      }
      searchValue={search}
      onSearchChange={setSearch}
      mode={menuMode}
      onModeChange={setMenuMode}
      onOpenCart={() => setMobileCartOpen(true)}
      cartCount={displayCartLines.length}
      categories={CATEGORY_OPTIONS}
      selectedCategory={selectedCategory}
      onSelectCategory={setSelectedCategory}
      mobileCartOpen={mobileCartOpen}
      onCloseMobileCart={() => setMobileCartOpen(false)}
      cartPanel={cartPanel}
      main={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dce6eb] bg-white p-3 text-sm text-[#5a7282] shadow-[0_14px_24px_-24px_rgba(16,24,40,0.55)]">
            <div className="flex items-center gap-3">
              <span>{offerCards.length} products</span>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d4e3e3] bg-[#eef7f6] px-3 py-1 text-xs font-medium text-[#6f32b5]">
                <span>{displayCartLines.length} in estimate</span>
                <span aria-hidden="true" className="text-[#7aa7a3]">•</span>
                <span>{asMoney(cartTotal)}</span>
              </div>
              {canShowDraft ? (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#4f6877]">
                  <input
                    type="checkbox"
                    checked={showDraftOffers}
                    onChange={(e) => setShowDraftOffers(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cbd8e1] text-[#8f52dc] focus:ring-[#8f52dc]"
                  />
                  Show Draft Offers
                </label>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Link href={requestSamplesHref} className="text-[#6f32b5] underline">
                Request Samples
              </Link>
              <Link href={estimateHref} className="font-semibold text-[#6f32b5] underline underline-offset-2">
                Open Estimate
              </Link>
            </div>
          </div>
          {routeRunnerEstimateMessage ? (
            <div className="rounded-2xl border border-[#dce6eb] bg-[#fffafd] px-3 py-2 text-sm text-[#4f6877] shadow-[0_14px_24px_-24px_rgba(16,24,40,0.55)]">
              {routeRunnerEstimateMessage}
            </div>
          ) : null}
          <FilterChipBar groups={filterGroups} onClear={clearActiveFilters} />
          <ProductGrid items={offerCards} onAdd={onAdd} emptyMessage={emptyMessage} />
        </div>
      }
    />
  );
}
