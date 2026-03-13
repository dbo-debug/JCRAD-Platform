"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import EstimateCartPanel from "@/components/menu/EstimateCartPanel";
import FilterChipBar from "@/components/menu/FilterChipBar";
import MenuLayout from "@/components/menu/MenuLayout";
import ProductGrid from "@/components/menu/ProductGrid";
import { LIQUID_INFUSION_MEDIA } from "@/lib/infusion-config";
import { type PackagingCategory } from "@/lib/packaging/category";
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
const INFUSION_GRAMS_PER_LB = 454;

type PackagingSku = {
  id: string;
  name: string;
  category?: string | null;
  applies_to?: string | null;
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
};

type InfusionSettings = {
  internalGPerLb: number;
  externalDistillatePer1g: number;
  externalKiefPer1g: number;
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

function packagingCategoryForSku(sku: PackagingSku): MenuCategory | "" {
  return normalizeCategory(sku.applies_to || sku.category);
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

function isVapeVesselSku(sku: PackagingSku): boolean {
  const t = normalizedLower(sku.packaging_type);
  return t === "vape_510_cart" || t === "vape_all_in_one";
}

function isMylar35Sku(sku: PackagingSku): boolean {
  const t = normalizedLower(sku.packaging_type);
  const size = Number(sku.size_grams || 0);
  const active = sku.active === true;
  return active && t === "flower_in_bag" && Math.abs(size - 3.5) < 1e-9;
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
  return {
    expanded: false,
    mode,
    startingWeightLbs: Math.max(1, Number(offer.min_order || 1)),
    startingWeightGrams: 1000,
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

function modeFromLine(modeRaw: unknown, preRollModeRaw: unknown): MenuMode | "pre_roll" {
  const mode = String(modeRaw || "bulk").toLowerCase();
  if (mode !== "copack") return "bulk";
  return String(preRollModeRaw || "").trim() ? "pre_roll" : "copack";
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
    infusionSettings,
    yields,
  } = args;
  const gramsPerUnit = gramsFromUnitSize(unitSize) * (mode === "pre_roll" ? Math.max(1, preRollPackQty) : 1);
  const internalSummary = hasInternalInfusion ? "Internal infusion selected" : undefined;
  const externalSummary = hasExternalInfusion ? "External infusion selected" : undefined;
  if (category === "flower") {
    if (mode === "pre_roll" && (hasInternalInfusion || hasExternalInfusion)) {
      const startFlowerG = Math.max(0, startingWeightLbs) * INFUSION_GRAMS_PER_LB;
      const gPerLb = Math.max(0, Number(infusionSettings.internalGPerLb || 80));
      const internalAddedG = hasInternalInfusion ? Math.max(0, startingWeightLbs) * gPerLb : 0;
      const flowerBlendTotalG = startFlowerG + internalAddedG;
      const jointG = gramsFromUnitSize(unitSize);
      const packQty = Math.max(1, preRollPackQty);
      const distPerJoint = hasExternalInfusion
        ? Math.max(0, Number(infusionSettings.externalDistillatePer1g || 0.1)) * jointG
        : 0;
      const kiefPerJoint = hasExternalInfusion
        ? Math.max(0, Number(infusionSettings.externalKiefPer1g || 0.15)) * jointG
        : 0;
      const flowerBlendPerJoint = jointG - distPerJoint - kiefPerJoint;
      if (hasExternalInfusion && flowerBlendPerJoint <= 0) {
        return {
          low: 0,
          high: 0,
          label: "Expected units: 0-0",
          internalSummary,
          externalSummary,
          internalInfusionGPerLb: gPerLb,
          externalDistillatePerUnit: distPerJoint * packQty,
          externalKiefPerUnit: kiefPerJoint * packQty,
          externalFlowerPerUnit: 0,
        };
      }
      const flowerBlendPerPack = Math.max(1e-9, flowerBlendPerJoint * packQty);
      const unitsHigh = Math.max(0, Math.floor(flowerBlendTotalG / flowerBlendPerPack));
      const pct = clampYieldPct(yields.prerollYieldPct);
      const unitsLow = Math.max(0, Math.floor(unitsHigh * pct));
      return {
        low: unitsLow,
        high: unitsHigh,
        label: `Expected units: ${unitsLow.toLocaleString()}-${unitsHigh.toLocaleString()}`,
        internalSummary,
        externalSummary,
        internalInfusionGPerLb: gPerLb,
        externalDistillatePerUnit: distPerJoint * packQty,
        externalKiefPerUnit: kiefPerJoint * packQty,
        externalFlowerPerUnit: flowerBlendPerPack,
      };
    }
    const startG = Math.max(0, startingWeightLbs) * GRAMS_PER_LB;
    const high = Math.max(0, Math.floor(startG / Math.max(1e-9, gramsPerUnit)));
    const pct = clampYieldPct(mode === "pre_roll" ? yields.prerollYieldPct : yields.flowerYieldPct);
    const low = Math.max(0, Math.floor((startG * pct) / Math.max(1e-9, gramsPerUnit)));
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
};

function mapEstimateLine(line: any): EstimateCartLine {
  const mode = modeFromLine(line?.mode, line?.pre_roll_mode);
  const category = String(line?.pre_roll_mode || "").trim()
    ? "pre_roll"
    : normalizeCategory(line?.offers?.products?.category) || null;
  const quantityLabel = lineQuantityLabel(line, mode, category);
  const lineTotalRaw = Number(line?.line_sell_total);
  const fallbackTotalRaw = Number(line?.line_total);

  return {
    id: String(line?.id || crypto.randomUUID()),
    offerId: String(line?.offer_id || ""),
    title: String(line?.notes || "Estimate line"),
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
  const [estimateSummary, setEstimateSummary] = useState<EstimateSummary>({
    lines: [],
    total: 0,
    packagingReviewPending: false,
  });
  const [cardStateByOfferId, setCardStateByOfferId] = useState<Record<string, OfferCardState>>({});
  const [packagingSkus, setPackagingSkus] = useState<PackagingSku[]>([]);
  const [complianceComplete] = useState(false);
  const yieldSettings = initialYields;

  async function ensureEstimateId() {
    const existing = getEstimateId();
    if (existing) return existing;

    const res = await fetch("/api/estimate/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json?.error || `Estimate create failed (${res.status})`));

    const estimateId = String((json as any)?.estimate?.id || "");
    if (!estimateId) throw new Error("Estimate id missing");
    setEstimateId(estimateId);
    return estimateId;
  }

  async function loadEstimateSummary(id: string) {
    if (!id) return;

    const res = await fetch(`/api/estimate/get?id=${encodeURIComponent(id)}`);
    const json = await parseJsonSafe(res);
    if (!res.ok) return;

    const linesRaw = Array.isArray((json as any)?.lines) ? (json as any).lines : [];
    const lines = linesRaw.map(mapEstimateLine);
    const total = Number((json as any)?.estimate?.total || 0);
    const packagingReviewPending = Boolean((json as any)?.estimate?.packaging_review_pending);
    setEstimateSummary({
      lines,
      total: Number.isFinite(total) ? total : 0,
      packagingReviewPending,
    });
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
    } catch (err) {
      console.error("[menu] remove line failed", err);
    } finally {
      setRemovingLineId(null);
    }
  }

  useEffect(() => {
    const id = getEstimateId();
    if (id) {
      void loadEstimateSummary(id);
    }
  }, []);

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
        const allowCopack = (offer as any).allow_copack;
        return allowCopack !== false;
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
        if (current.mode !== desiredMode) {
          next[offerId] = {
            ...current,
            mode: desiredMode,
            packagingMode: desiredMode === "pre_roll" ? "jcrad" : current.packagingMode,
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
    const allowCopackFalse = visibleOffers.filter((offer) => {
      const category = normalizeCategory(offer.catalog_category || offer.products?.category);
      return category === "flower" && (offer as any).allow_copack === false;
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
        allowCopackFalse,
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
    setCardStateByOfferId((prev) => {
      const current = prev[offerId] || defaultCardState(offer, selectedCategory, menuMode);
      return { ...prev, [offerId]: updater(current) };
    });
  }

  function cardStateForOffer(offer: Offer): OfferCardState {
    return cardStateByOfferId[String(offer.id || "")] || defaultCardState(offer, selectedCategory, menuMode);
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
        const addAllowed = apiMode === "bulk" ? !!offer.allow_bulk : !!offer.allow_copack;
        const isPreRoll = cardMode === "pre_roll";
        const unitSizeOptions = isPreRoll
          ? [...PRE_ROLL_UNIT_SIZES]
          : CATEGORY_UNIT_SIZES[category] && CATEGORY_UNIT_SIZES[category].length > 0
            ? CATEGORY_UNIT_SIZES[category]
            : ["3.5g"];
        const filteredSkus = packagingSkus.filter((sku) => {
          const skuCategory = packagingCategoryForSku(sku);
          if (isPreRoll) {
            if (skuCategory && skuCategory !== "pre_roll") return false;
            const skuSize = Number(sku.size_grams || 0);
            const skuQty = Number(sku.pack_qty || 0);
            const requestSize = Number(String(cardState.unitSize).replace("g", ""));
            if (skuSize > 0 && Math.abs(skuSize - requestSize) > 1e-9) return false;
            if (skuQty > 0 && skuQty !== cardState.preRollPackQty) return false;
            return true;
          }
          if (skuCategory && skuCategory !== category) return false;
          return true;
        });
        const vapeVesselOptions = category === "vape"
          ? filteredSkus.filter((sku) => isVapeVesselSku(sku))
          : [];
        const secondaryBagOptions = packagingSkus.filter((sku) => {
          const packagingType = normalizedLower(sku.packaging_type);
          const sizeGrams = Number(sku.size_grams || 0);
          const active = sku.active === true;
          if (!active || packagingType !== "flower_in_bag" || Math.abs(sizeGrams - 3.5) > 1e-9) return false;
          const role = normalizedLower(sku.packaging_role || "");
          if (role && role !== "secondary") return false;
          const contexts = Array.isArray(sku.workflow_contexts)
            ? sku.workflow_contexts.map((v) => normalizedLower(v))
            : [];
          const appliesTo = normalizedLower(sku.applies_to || sku.category || "");
          return contexts.includes("concentrate") || appliesTo === "concentrate";
        });
        const vapeMylarBagOptions = packagingSkus.filter((sku) => isMylar35Sku(sku));
        const requiresSecondaryBag = apiMode === "copack"
          && cardState.packagingMode === "jcrad"
          && (
            (category === "concentrate")
            || (category === "vape" && cardState.unitSize === "3.5g")
          )
          && !isPreRoll;
        const expectedRange = deriveExpectedRange({
          category,
          mode: cardState.mode,
          startingWeightLbs: cardState.startingWeightLbs,
          startingWeightGrams: cardState.startingWeightGrams,
          unitSize: cardState.unitSize,
          preRollPackQty: cardState.preRollPackQty,
          hasInternalInfusion: Boolean(cardState.internalInfusionProductId),
          hasExternalInfusion: Boolean(cardState.externalLiquidProductId || cardState.externalDryProductId),
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
          startingWeightLabel: startingWeightUnit === "lb" ? "Starting lbs" : "Starting grams",
          startingWeightUnit,
          unitSize: cardState.unitSize,
          packagingMode: cardState.packagingMode,
          packagingSkuId: cardState.packagingSkuId,
          secondaryPackagingSkuId: cardState.secondaryPackagingSkuId,
          preRollPackQty: cardState.preRollPackQty,
          preRollMode: cardState.preRollMode,
          allowedModes: category === "flower" ? ["bulk", "copack", "pre_roll"] : ["bulk", "copack"],
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
          secondaryPackagingLabel: category === "vape" ? "3.5g mylar bag" : "Secondary bag",
          packagingOptions: (category === "vape" ? vapeVesselOptions : filteredSkus).map((sku) => ({ id: String(sku.id), name: String(sku.name || "SKU") })),
          secondaryBagOptions: (category === "vape" ? vapeMylarBagOptions : secondaryBagOptions).map((sku) => ({ id: String(sku.id), name: String(sku.name || "SKU") })),
          onExpandedChange: (next) => updateCardState(offer, (prev) => ({ ...prev, expanded: next })),
          onModeChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            mode: next,
            expanded: next === "bulk" ? prev.expanded : true,
            packagingMode: next === "pre_roll" ? "jcrad" : prev.packagingMode,
            preRollPackQty: next === "pre_roll" ? prev.preRollPackQty : 1,
            preRollMode: next === "pre_roll" ? prev.preRollMode : PRE_ROLL_MODES[0],
            internalInfusionProductId: next === "bulk" ? "" : prev.internalInfusionProductId,
            externalLiquidProductId: next === "pre_roll" ? prev.externalLiquidProductId : "",
            externalDryProductId: next === "pre_roll" ? prev.externalDryProductId : "",
          })),
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
          onUnitSizeChange: (next) => updateCardState(offer, (prev) => ({ ...prev, unitSize: next })),
          onPackagingModeChange: (next) => updateCardState(offer, (prev) => ({
            ...prev,
            packagingMode: prev.mode === "pre_roll" ? "jcrad" : next,
          })),
          onPackagingSkuChange: (next) => updateCardState(offer, (prev) => ({ ...prev, packagingSkuId: next })),
          onSecondaryPackagingSkuChange: (next) => updateCardState(offer, (prev) => ({ ...prev, secondaryPackagingSkuId: next })),
          onPreRollPackQtyChange: (next) => updateCardState(offer, (prev) => ({ ...prev, preRollPackQty: next })),
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
          addDisabled: !addAllowed,
          addLoading: !!busyByOfferId[id],
          errorText: errorByOfferId[id] || "",
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

  async function addLineToEstimate(offer: Offer) {
    const cardState = cardStateForOffer(offer);
    const estimateId = await ensureEstimateId();
    const category = normalizeCategory(offer.catalog_category || offer.products?.category);
    const mode = cardState.mode;
    const apiMode = mode === "pre_roll" ? "copack" : mode;
    const packagingMode = apiMode === "bulk" ? null : cardState.packagingMode;
    const expectedRange = deriveExpectedRange({
      category,
      mode,
      startingWeightLbs: cardState.startingWeightLbs,
      startingWeightGrams: cardState.startingWeightGrams,
      unitSize: cardState.unitSize,
      preRollPackQty: cardState.preRollPackQty,
      hasInternalInfusion: Boolean(cardState.internalInfusionProductId),
      hasExternalInfusion: Boolean(cardState.externalLiquidProductId || cardState.externalDryProductId),
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
        || (category === "vape" && cardState.unitSize === "3.5g")
      );

    if (apiMode === "bulk" && !offer.allow_bulk) {
      throw new Error("This product is not available for bulk.");
    }
    if (apiMode === "copack" && !offer.allow_copack) {
      throw new Error("This product is not available for copack.");
    }
    if (apiMode === "copack" && packagingMode === "jcrad" && !cardState.packagingSkuId) {
      throw new Error(category === "vape" ? "Select a vape vessel SKU (510 cart or AIO)." : "Select a packaging SKU.");
    }
    if (apiMode === "bulk" && category === "vape" && cardState.startingWeightGrams <= 0) {
      throw new Error("Bulk requires quantity liters > 0.");
    }
    if (apiMode === "bulk" && category !== "vape" && cardState.startingWeightLbs <= 0) {
      throw new Error("Bulk requires quantity lbs > 0.");
    }
    if ((mode === "copack" || mode === "pre_roll") && category === "flower" && cardState.startingWeightLbs <= 0) {
      throw new Error("Starting lbs must be > 0.");
    }
    if ((mode === "copack" || mode === "pre_roll") && (category === "concentrate" || category === "vape") && cardState.startingWeightGrams <= 0) {
      throw new Error("Starting grams must be > 0.");
    }
    if (requiresSecondaryBag && !cardState.secondaryPackagingSkuId) {
      throw new Error(category === "vape" ? "Select a 3.5g mylar bag SKU." : "Select a secondary bag for concentrate copack.");
    }
    if (apiMode === "copack" && packagingMode === "jcrad" && category === "vape") {
      const vesselSku = packagingSkus.find((sku) => String(sku.id) === String(cardState.packagingSkuId));
      if (!vesselSku || !isVapeVesselSku(vesselSku)) {
        throw new Error("Select a vape vessel SKU (510 cart or AIO).");
      }
      if (cardState.unitSize === "3.5g") {
        const bagSku = packagingSkus.find((sku) => String(sku.id) === String(cardState.secondaryPackagingSkuId));
        if (!bagSku || !isMylar35Sku(bagSku)) {
          throw new Error("Select a 3.5g mylar bag SKU.");
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
      if (!cardState.frontFile || !cardState.backFile) {
        throw new Error("Upload both front and back artwork for client packaging.");
      }
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

    const vapeBulkGrams = apiMode === "bulk" && category === "vape"
      ? Math.max(0, Number(cardState.startingWeightGrams || 0))
      : 0;
    const payload: Record<string, unknown> = {
      estimate_id: estimateId,
      offer_id: offer.id,
      mode: apiMode,
      quantity_lbs: apiMode === "bulk" && category === "vape"
        ? vapeBulkGrams / GRAMS_PER_LB
        : Math.max(0, Number(cardState.startingWeightLbs || 0)),
      quantity: (apiMode === "bulk" && category === "vape")
        ? vapeBulkGrams
        : (category === "concentrate" || category === "vape")
        ? Math.max(0, Number(cardState.startingWeightGrams || 0))
        : Math.max(0, Number(cardState.startingWeightLbs || 0)),
      quantity_unit: (apiMode === "bulk" && category === "vape")
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
    window.open(href, "_blank", "noopener,noreferrer");
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
      <img src="/brand/PRIMARY.png" alt="JC RAD Inc." className="h-12 w-auto" />
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
      onRemoveLine={removeEstimateLine}
      removingLineId={removingLineId}
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
            className="inline-flex rounded-full border border-[#cfe0e7] px-3 py-2 text-xs font-semibold text-[#2a4655] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Request Samples / Book Call
          </Link>
          <Link
            href="/estimate"
            className="inline-flex rounded-full bg-[#14b8a6] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-95"
          >
            Estimate Cart ({displayCartLines.length})
          </Link>
        </div>
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
              {canShowDraft ? (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#4f6877]">
                  <input
                    type="checkbox"
                    checked={showDraftOffers}
                    onChange={(e) => setShowDraftOffers(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cbd8e1] text-[#14b8a6] focus:ring-[#14b8a6]"
                  />
                  Show Draft Offers
                </label>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Link href={requestSamplesHref} className="text-[#0f766e] underline">
                Request Samples
              </Link>
              <Link href="/estimate" className="text-[#0f766e] underline">
                Open Estimate Cart
              </Link>
            </div>
          </div>
          <FilterChipBar groups={filterGroups} onClear={clearActiveFilters} />
          <ProductGrid items={offerCards} onAdd={onAdd} emptyMessage={emptyMessage} />
        </div>
      }
    />
  );
}
