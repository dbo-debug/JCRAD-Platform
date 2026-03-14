import { NextResponse } from "next/server";
import { logPlatformEvent } from "@/lib/events/logPlatformEvent";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATEGORY_UNIT_SIZES,
  PRE_ROLL_UNIT_SIZES,
  gramsFromUnitSize,
  laborUnitCost,
  lbsFromEstimateLine,
  money,
  selectPackagingTier,
} from "@/lib/pricing";
import { getEstimatePackagingReviewState } from "@/lib/packaging/reviewStatus";

type SupabaseClient = ReturnType<typeof createAdminClient>;

type OfferWithProduct = {
  id: string;
  product_id: string;
  min_order: number | null;
  material_cost_per_g: number | null;
  material_cost_basis: string | null;
  material_cost_input: number | null;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number | null;
  allow_bulk: boolean | null;
  allow_copack: boolean | null;
  products: {
    id: string;
    name: string | null;
    category: string | null;
    type: string | null;
    tier: string | null;
    inventory_qty: number | null;
    inventory_unit: string | null;
  } | null;
};

const LB_TO_G = 453.592;
const INFUSION_LB_TO_G = 454;
const DEFAULT_HEAT_SHRINK_UNIT_PRICE = 0.03;
const DEFAULT_CONE_UNIT_COST_USD = 0.1;
const DEFAULT_COA_BASE_COST_USD = 450;
const DEFAULT_STICKER_UNIT_COST_USD = 0.02;
const DEFAULT_STICKERS_PER_UNIT = 3;
const DEFAULT_EXTRA_TOUCH_POINT_COST_USD = 0.1;
const DEFAULT_TARGET_MARKUP_PCT = 0.2;
const DEFAULT_INTERNAL_INFUSION_G_PER_LB = 80;
const DEFAULT_EXTERNAL_DISTILLATE_PER_UNIT_1G = 0.15;
const DEFAULT_EXTERNAL_KIEF_PER_UNIT_1G = 0.1;
const DEFAULT_EXTERNAL_INFUSION_LOSS_PCT = 0;
const DEFAULT_YIELD_PCTS = {
  flower: 0.92,
  concentrate: 0.95,
  preroll: 0.92,
  vape: 0.97,
} as const;

function toLb(value: number, unit: string | null | undefined): number {
  const normalized = String(unit || "lb").toLowerCase();
  if (normalized === "g") {
    return value / 453.592;
  }
  return value;
}

function isPreRollLine(mode: string, productCategory: string, preRollMode: string | null): boolean {
  return mode === "copack" && productCategory === "flower" && !!preRollMode;
}

function validateUnitSize({
  mode,
  category,
  unitSize,
  isPreRoll,
}: {
  mode: string;
  category: string;
  unitSize: string;
  isPreRoll: boolean;
}) {
  if (mode !== "copack") return;

  if (isPreRoll) {
    if (!PRE_ROLL_UNIT_SIZES.includes(unitSize as (typeof PRE_ROLL_UNIT_SIZES)[number])) {
      throw new Error("unit_size must be 0.5g, 0.75g, or 1g for pre-roll");
    }
    return;
  }

  const allowed = CATEGORY_UNIT_SIZES[category] || [];
  if (!allowed.includes(unitSize)) {
    throw new Error(`unit_size must be one of: ${allowed.join(", ")}`);
  }
}

function parseUsd(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const raw = Number(obj.usd);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}

function parsePct(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const raw = Number(obj.pct);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseSettingNumber(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const candidates = [
    obj.value,
    obj.usd,
    obj.qty,
    obj.amount,
    obj.g_per_lb,
    obj.g_per_unit_1g,
    obj.grams,
    obj.number,
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

function isWholePositiveInteger(n: number): boolean {
  return Number.isFinite(n) && n > 0 && Math.abs(n - Math.round(n)) < 1e-9;
}

function normalizePackagingCategory(value: unknown): "flower" | "concentrate" | "vape" | "pre_roll" | "" {
  const raw = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (raw === "flower" || raw === "concentrate" || raw === "vape" || raw === "pre_roll") return raw;
  return "";
}

function normalizePackagingType(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function packagingCategoryForSku(row: { category?: unknown; applies_to?: unknown; packaging_type?: unknown }) {
  const explicit = normalizePackagingCategory(row.applies_to || row.category);
  if (explicit) return explicit;

  const packagingType = normalizePackagingType(row.packaging_type);
  if (packagingType === "pre_roll_tube" || packagingType === "pre_roll_jar" || packagingType === "pre_roll_pack") {
    return "pre_roll" as const;
  }

  return "";
}

type InfusionType = "none" | "internal" | "external";

function normalizeInfusionType(value: unknown): InfusionType {
  const raw = String(value || "").toLowerCase();
  if (raw === "internal" || raw === "external") return raw;
  return "none";
}

function isUnknownColumnError(error: any, columnName: string): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const col = columnName.toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  if (!col) return false;
  if (code === "PGRST204" && msg.includes(col)) return true;
  if (msg.includes("could not find the") && msg.includes(col)) return true;
  if (msg.includes("schema cache") && msg.includes(col)) return true;
  if (msg.includes("column") && msg.includes(col)) return true;
  return false;
}

function hasWorkflowContext(row: any, value: string): boolean {
  const target = String(value || "").toLowerCase();
  const contexts = Array.isArray(row?.workflow_contexts) ? row.workflow_contexts : [];
  return contexts.map((v: unknown) => String(v || "").toLowerCase()).includes(target);
}

function isMylar35SecondarySku(row: any): boolean {
  const secondaryType = String(row?.packaging_type || "").toLowerCase();
  const secondarySize = Number(row?.size_grams || 0);
  const secondaryActive = row?.active === true;
  const secondaryRole = String(row?.packaging_role || "").toLowerCase();
  return (
    secondaryActive &&
    secondaryType === "flower_in_bag" &&
    Math.abs(secondarySize - 3.5) < 1e-9 &&
    (!secondaryRole || secondaryRole === "secondary")
  );
}

type OfferPricingRow = {
  id: string;
  product_id: string;
  material_cost_per_g: number | null;
  material_sell_per_g?: number | null;
  material_cost_basis: string | null;
  material_cost_input: number | null;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number | null;
  status: string | null;
  products: {
    id: string;
    name: string | null;
    inventory_unit: string | null;
  } | null;
};

type ResolvedOfferPricing = {
  productName: string | null;
  costPerG: number | null;
  costPerLb: number | null;
  sellPerG: number | null;
  sellPerLb: number | null;
  sellDerivedFromCost: boolean;
};

function materialCostPerGFromOffer(offer: OfferPricingRow): number | null {
  const inventoryUnit = String(offer?.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
  const materialCostPerG = Number(offer.material_cost_per_g ?? NaN);
  const materialCostBasis = String(offer.material_cost_basis || "").toLowerCase();
  const materialCostInput = Number(offer.material_cost_input ?? NaN);
  const bulkCostPerLb = Number(offer.bulk_cost_per_lb ?? NaN);
  const costPerGFromBasis =
    materialCostBasis === "per_g" && Number.isFinite(materialCostInput) && materialCostInput > 0
      ? materialCostInput
      : materialCostBasis === "per_lb" && Number.isFinite(materialCostInput) && materialCostInput > 0
        ? materialCostInput / INFUSION_LB_TO_G
        : null;
  if (costPerGFromBasis != null) return costPerGFromBasis;
  if (Number.isFinite(materialCostPerG) && materialCostPerG > 0) return materialCostPerG;
  if (Number.isFinite(bulkCostPerLb) && bulkCostPerLb > 0) {
    return inventoryUnit === "g" ? bulkCostPerLb : bulkCostPerLb / INFUSION_LB_TO_G;
  }
  return null;
}

function materialCostPerLbFromOffer(offer: OfferPricingRow): number | null {
  const inventoryUnit = String(offer?.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
  const materialCostPerG = Number(offer.material_cost_per_g ?? NaN);
  const materialCostBasis = String(offer.material_cost_basis || "").toLowerCase();
  const materialCostInput = Number(offer.material_cost_input ?? NaN);
  const bulkCostPerLb = Number(offer.bulk_cost_per_lb ?? NaN);
  if (materialCostBasis === "per_lb" && Number.isFinite(materialCostInput) && materialCostInput > 0) {
    return materialCostInput;
  }
  if (materialCostBasis === "per_g" && Number.isFinite(materialCostInput) && materialCostInput > 0) {
    return materialCostInput * LB_TO_G;
  }
  if (Number.isFinite(materialCostPerG) && materialCostPerG > 0) return materialCostPerG * LB_TO_G;
  if (Number.isFinite(bulkCostPerLb) && bulkCostPerLb > 0) {
    return inventoryUnit === "g" ? bulkCostPerLb * LB_TO_G : bulkCostPerLb;
  }
  return null;
}

function materialSellPerGFromOfferRaw(offer: OfferPricingRow): number | null {
  const inventoryUnit = String(offer?.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
  const materialSellPerG = Number(offer.material_sell_per_g ?? NaN);
  const bulkSellPerLb = Number(offer.bulk_sell_per_lb ?? NaN);
  const materialCostBasis = String(offer.material_cost_basis || "").toLowerCase();
  if (Number.isFinite(materialSellPerG) && materialSellPerG > 0) return materialSellPerG;
  if (Number.isFinite(bulkSellPerLb) && bulkSellPerLb > 0) {
    if (inventoryUnit === "g" || materialCostBasis === "per_g") return bulkSellPerLb;
    return bulkSellPerLb / INFUSION_LB_TO_G;
  }
  return null;
}

function materialSellPerLbFromOfferRaw(offer: OfferPricingRow): number | null {
  const inventoryUnit = String(offer?.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
  const materialSellPerG = Number(offer.material_sell_per_g ?? NaN);
  const bulkSellPerLb = Number(offer.bulk_sell_per_lb ?? NaN);
  const materialCostBasis = String(offer.material_cost_basis || "").toLowerCase();
  if (Number.isFinite(bulkSellPerLb) && bulkSellPerLb > 0) {
    if (inventoryUnit === "g" || materialCostBasis === "per_g") return bulkSellPerLb * LB_TO_G;
    return bulkSellPerLb;
  }
  if (Number.isFinite(materialSellPerG) && materialSellPerG > 0) {
    return materialSellPerG * LB_TO_G;
  }
  return null;
}

async function getLatestPublishedOfferForProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<OfferPricingRow | null> {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return null;
  const primarySelect =
    "id, product_id, status, material_cost_per_g, material_sell_per_g, material_cost_basis, material_cost_input, bulk_cost_per_lb, bulk_sell_per_lb, products:product_id(id, name, inventory_unit)";
  const fallbackSelect =
    "id, product_id, status, material_cost_per_g, material_cost_basis, material_cost_input, bulk_cost_per_lb, bulk_sell_per_lb, products:product_id(id, name, inventory_unit)";
  let rows: unknown[] | null = null;
  let error: any = null;
  ({ data: rows, error } = await supabase
    .from("offers")
    .select(primarySelect)
    .eq("product_id", normalizedProductId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1));
  if (error && isUnknownColumnError(error, "material_sell_per_g")) {
    ({ data: rows, error } = await supabase
      .from("offers")
      .select(fallbackSelect)
      .eq("product_id", normalizedProductId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1));
  }
  if (error) throw new Error(error.message);
  const row = (rows ?? [])[0] as OfferPricingRow | undefined;
  return row ?? null;
}

function resolveOfferPricing(offer: OfferPricingRow, targetMarkupPct: number): ResolvedOfferPricing {
  const multiplier = 1 + Math.max(0, targetMarkupPct);
  const costPerG = materialCostPerGFromOffer(offer);
  const costPerLb = materialCostPerLbFromOffer(offer);
  const sellPerGRaw = materialSellPerGFromOfferRaw(offer);
  const sellPerLbRaw = materialSellPerLbFromOfferRaw(offer);
  let sellDerivedFromCost = false;
  let sellPerG = sellPerGRaw;
  let sellPerLb = sellPerLbRaw;

  if (sellPerG == null && costPerG != null) {
    sellPerG = costPerG * multiplier;
    sellDerivedFromCost = true;
  }
  if (sellPerLb == null && costPerLb != null) {
    sellPerLb = costPerLb * multiplier;
    sellDerivedFromCost = true;
  }
  if (sellPerG == null && sellPerLb != null) {
    sellPerG = sellPerLb / INFUSION_LB_TO_G;
  }
  if (sellPerLb == null && sellPerG != null) {
    sellPerLb = sellPerG * LB_TO_G;
  }

  return {
    productName: offer?.products?.name ? String(offer.products.name) : null,
    costPerG,
    costPerLb,
    sellPerG,
    sellPerLb,
    sellDerivedFromCost,
  };
}

async function resolveProductPricing(args: {
  supabase: SupabaseClient;
  productId: string;
  targetMarkupPct: number;
  fallbackOffer?: OfferPricingRow | null;
}): Promise<ResolvedOfferPricing | null> {
  const { supabase, productId, targetMarkupPct, fallbackOffer } = args;
  const publishedOffer = await getLatestPublishedOfferForProduct(supabase, productId);
  const chosenOffer = publishedOffer ?? fallbackOffer ?? null;
  if (!chosenOffer) return null;
  return resolveOfferPricing(chosenOffer, targetMarkupPct);
}

function parseCanonicalSettingNumber(args: {
  settings: Map<string, unknown>;
  canonicalKey: string;
  legacyKeys: string[];
  fallback: number;
}): number {
  const { settings, canonicalKey, legacyKeys, fallback } = args;
  if (settings.has(canonicalKey)) {
    return parseSettingNumber(settings.get(canonicalKey), fallback);
  }
  for (const key of legacyKeys) {
    if (settings.has(key)) return parseSettingNumber(settings.get(key), fallback);
  }
  return fallback;
}

function runInfusedPrerollSeedReconciliation(requestId: string) {
  const billedLbs = 5;
  const unitsHigh = 3560;
  const internalGPerLb = 80;
  const distGPerUnit = 0.15;
  const dryGPerUnit = 0.1;
  const sellPerLb = 26;
  const internalSellPerG = 1.56;
  const distSellPerG = 0.96;
  const drySellPerG = 1.08;
  const flowerTotal = money(billedLbs * sellPerLb);
  const internalG = money(billedLbs * internalGPerLb);
  const distBaseG = money(unitsHigh * distGPerUnit);
  const dryBaseG = money(unitsHigh * dryGPerUnit);
  const internalTotal = money(internalG * internalSellPerG);
  const distTotal = money(distBaseG * distSellPerG);
  const dryTotal = money(dryBaseG * drySellPerG);
  console.log(`[add-line:${requestId}] seed-infused-preroll`, {
    billed_lbs: billedLbs,
    units_high: unitsHigh,
    internal_g_per_lb: internalGPerLb,
    dist_g_per_unit: distGPerUnit,
    dry_g_per_unit: dryGPerUnit,
    sell_per_lb: sellPerLb,
    internal_sell_per_g: internalSellPerG,
    dist_sell_per_g: distSellPerG,
    dry_sell_per_g: drySellPerG,
    expected_flower_total: flowerTotal,
    expected_internal_total: internalTotal,
    expected_dist_total: distTotal,
    expected_dry_total: dryTotal,
    expected_dist_base_g: distBaseG,
    expected_dry_base_g: dryBaseG,
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms)),
  ]);
}

type UpsertLineRow = {
  id: string | null;
  [key: string]: unknown;
};

type PostgrestErrorLike = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

async function upsertLineWithFallback(args: {
  supabase: SupabaseClient;
  estimateId: string;
  lineId: string | null;
  offerId: string;
  mode: string;
  payloadBase: Record<string, unknown>;
  payloadOptional: Record<string, unknown>;
  optionalColumns: string[];
  requestId?: string;
}): Promise<UpsertLineRow | null> {
  const { supabase, estimateId, lineId, offerId, mode, payloadBase, payloadOptional, optionalColumns, requestId } = args;
  const workingPayload = { ...payloadOptional };
  console.log(`[add-line:${requestId}] upsert args`, {
    hasOptionalColumns: Array.isArray(optionalColumns),
    optionalColumnsLen: Array.isArray(optionalColumns) ? optionalColumns.length : null,
  });
  let attempt = 0;
  let lastError: any = null;

  while (attempt < 10) {
    attempt++;
    console.log(`[add-line:${requestId}] upsert attempt ${attempt}`, {
      lineId,
      keys: Object.keys(workingPayload),
    });
    const query = lineId
      ? supabase.from("estimate_lines").update(workingPayload).eq("id", lineId).eq("estimate_id", estimateId)
      : supabase.from("estimate_lines").insert(workingPayload);

    const result = await withTimeout(
      query.select("*").single(),
      15000,
      `estimate_lines upsert (attempt ${attempt})`
    ) as { data: UpsertLineRow | null; error: { message: string } | null };
    const { data, error } = result;
    if (!error) return data;
    lastError = error;
    console.error(`[add-line:${requestId}] upsert error (attempt ${attempt})`, {
      message: error.message,
    });

    const unknownCol = optionalColumns.find((col) => isUnknownColumnError(error, col));
    if (unknownCol) {
      console.warn(`[add-line:${requestId}] removing missing column`, { unknownCol });
      delete (workingPayload as Record<string, unknown>)[unknownCol];
      console.warn(`[add-line:${requestId}] retrying without`, {
        removed: unknownCol,
        remainingKeys: Object.keys(workingPayload).length,
      });
      continue;
    }

    const fallbackQuery = lineId
      ? supabase.from("estimate_lines").update(payloadBase).eq("id", lineId).eq("estimate_id", estimateId)
      : supabase.from("estimate_lines").insert(payloadBase);
    const fallback = await withTimeout(
      fallbackQuery.select("*").single(),
      15000,
      `estimate_lines fallback upsert (attempt ${attempt})`
    ) as { data: UpsertLineRow | null; error: PostgrestErrorLike | null };
    if (!fallback.error) return fallback.data;

    const err = fallback.error as PostgrestErrorLike;
    const detail = JSON.stringify({
      message: err.message,
      details: err.details,
      hint: err.hint,
      code: err.code,
      mode,
      estimateId,
      offerId,
      lineId,
    });
    throw new Error(`estimate_lines upsert failed: ${detail}`);
  }
  const err = lastError as PostgrestErrorLike | null;
  const detail = JSON.stringify({
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    code: err?.code,
    mode,
    estimateId,
    offerId,
    lineId,
  });
  throw new Error(`estimate_lines upsert failed: ${detail}`);
}

async function recalcEstimate(supabase: SupabaseClient, estimateId: string) {
  const { data: lines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("line_sell_total, line_total")
    .eq("estimate_id", estimateId);

  if (linesErr) throw new Error(linesErr.message);

  const subtotal = money(
    (lines ?? []).reduce((sum: number, l: any) => sum + Number((l.line_sell_total ?? l.line_total) || 0), 0)
  );
  const packagingState = await getEstimatePackagingReviewState(supabase, estimateId);
  const hasPackagingPending = packagingState.hasUnapprovedCustomerPackaging;

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("adjustments")
    .eq("id", estimateId)
    .single();

  if (estErr) throw new Error(estErr.message);

  const adjustments = Number(estimate?.adjustments || 0);
  const total = money(subtotal + adjustments);

  const { error: updErr } = await supabase
    .from("estimates")
    .update({
      subtotal,
      total,
      packaging_review_pending: hasPackagingPending,
    })
    .eq("id", estimateId);

  if (updErr) throw new Error(updErr.message);

  return { subtotal, adjustments, total, packaging_review_pending: hasPackagingPending };
}

async function ensureEstimate(supabase: SupabaseClient, estimateId?: string | null) {
  if (estimateId) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id")
      .eq("id", estimateId)
      .single();
    if (!error && data?.id) return data.id as string;
  }

  const { data, error } = await supabase
    .from("estimates")
    .insert({
      status: "draft",
      subtotal: 0,
      adjustments: 0,
      total: 0,
      packaging_review_pending: false,
    })
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(error?.message || "Failed to create estimate");
  return data.id as string;
}

async function validateInventoryAvailable(args: {
  supabase: SupabaseClient;
  estimateId: string;
  lineId: string | null;
  productId: string;
  productInventoryQty: number;
  productInventoryUnit: string | null;
  requestedLb: number;
}) {
  const { supabase, estimateId, lineId, productId, productInventoryQty, productInventoryUnit, requestedLb } = args;

  const availableLb = toLb(productInventoryQty, productInventoryUnit);

  const { data: estimateLines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("id, offer_id, mode, quantity_lbs, units, unit_size, pre_roll_mode, pre_roll_pack_qty")
    .eq("estimate_id", estimateId);

  if (linesErr) throw new Error(linesErr.message);

  const existingLines = (estimateLines ?? []).filter((l: any) => String(l.id) !== String(lineId || ""));
  const existingOfferIds = Array.from(new Set(existingLines.map((l: any) => String(l.offer_id || "")).filter(Boolean)));

  let existingConsumptionLb = 0;

  if (existingOfferIds.length > 0) {
    const { data: offersForLines, error: offersErr } = await supabase
      .from("offers")
      .select("id, product_id")
      .in("id", existingOfferIds);

    if (offersErr) throw new Error(offersErr.message);

    const productByOfferId = new Map<string, string>();
    for (const row of offersForLines || []) {
      productByOfferId.set(String((row as any).id), String((row as any).product_id || ""));
    }

    for (const line of existingLines) {
      const lineProductId = productByOfferId.get(String((line as any).offer_id || ""));
      if (lineProductId !== productId) continue;
      existingConsumptionLb += lbsFromEstimateLine(line as any);
    }
  }

  const totalRequestedLb = existingConsumptionLb + requestedLb;

  if (totalRequestedLb > availableLb + 1e-9) {
    throw new Error(
      `Insufficient inventory for this product. Requested ${totalRequestedLb.toFixed(3)} lb, available ${availableLb.toFixed(3)} lb.`
    );
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();
  const isDev = process.env.NODE_ENV !== "production";
  let eventEstimateId: string | null = null;
  let eventOfferId: string | null = null;
  let eventMode: string | null = null;
  const debugRequested = (() => {
    try {
      return new URL(req.url).searchParams.get("debug") === "1";
    } catch {
      return false;
    }
  })();
  const debug = (label: string, payload?: Record<string, unknown>) => {
    if (!isDev) return;
    console.log(`[add-line:${requestId}] ${label}`, payload || {});
  };
  const respond = (payload: unknown, init?: ResponseInit) => {
    if (isDev) {
      console.log(`[add-line:${requestId}] response`, { status: init?.status || 200, ms: Date.now() - t0 });
    }
    const statusCode = init?.status || 200;
    if (statusCode >= 400) {
      const errorMessage = String((payload as any)?.error || "unknown").slice(0, 300);
      void logPlatformEvent({
        eventType: "estimate_add_line_failed",
        metadata: {
          estimate_id: eventEstimateId,
          offer_id: eventOfferId,
          mode: eventMode,
          status: statusCode,
          error: errorMessage,
        },
      });
    }
    return NextResponse.json(payload, init);
  };
  const mark = (label: string) => console.log(`[add-line:${requestId}] ${label}`, { ms: Date.now() - t0 });
  debug("hit", { url: req.url });
  try {
    if (isDev && debugRequested) runInfusedPrerollSeedReconciliation(requestId);
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    debug("payload", {
      estimate_id: body?.estimate_id ?? null,
      mode: body?.mode ?? null,
      offer_id: body?.offer_id ?? null,
      units: body?.units ?? null,
      starting_weight_lbs: body?.starting_weight_lbs ?? body?.starting_weight_lb ?? null,
      starting_weight_g: body?.starting_weight_g ?? body?.starting_weight_grams ?? null,
      packaging_sku_id: body?.packaging_sku_id ?? null,
      quantity: body?.quantity ?? null,
      quantity_unit: body?.quantity_unit ?? null,
    });

    const estimate_id = await ensureEstimate(supabase, body?.estimate_id ? String(body.estimate_id) : null);
    eventEstimateId = estimate_id;
    mark("after ensureEstimate");
    const line_id = body?.line_id ? String(body.line_id) : null;

    const offer_id = body?.offer_id ? String(body.offer_id) : null;
    eventOfferId = offer_id;
    const mode = String(body?.mode || "bulk").toLowerCase();
    eventMode = mode;

    if (!offer_id) return respond({ error: "offer_id required" }, { status: 400 });
    if (mode !== "bulk" && mode !== "copack") {
      return respond({ error: "mode must be bulk or copack" }, { status: 400 });
    }

    const { data: offerRow, error: offerErr } = await supabase
      .from("offers")
      .select(
        "id, product_id, min_order, material_cost_per_g, material_cost_basis, material_cost_input, bulk_cost_per_lb, bulk_sell_per_lb, allow_bulk, allow_copack, products:product_id(id, name, category, type, tier, inventory_qty, inventory_unit)"
      )
      .eq("id", offer_id)
      .single();
    mark("after offers select");

    if (offerErr || !offerRow) {
      return respond({ error: offerErr?.message || "Offer not found" }, { status: 404 });
    }

    const offer = offerRow as unknown as OfferWithProduct;
    const productCategory = String(offer?.products?.category || "").toLowerCase();

    if (!["flower", "concentrate", "vape"].includes(productCategory)) {
      return respond({ error: "Offer product category must be flower, concentrate, or vape" }, { status: 400 });
    }

    if (mode === "bulk" && !offer.allow_bulk) {
      return respond({ error: "Bulk not allowed for this offer" }, { status: 400 });
    }
    if (mode === "copack" && !offer.allow_copack) {
      return respond({ error: "Copack not allowed for this offer" }, { status: 400 });
    }

    let quantity_lbs = Number(body?.quantity_lbs || 0);
    let quantity = 0;
    let quantity_unit: "lb" | "g" | "units" = "lb";
    let units = Number(body?.units || 0);
    const unit_size = body?.unit_size ? String(body.unit_size).toLowerCase() : "3.5g";
    let pre_roll_pack_qty = mode === "copack" ? Number(body?.pre_roll_pack_qty ?? 1) : 1;
    const starting_weight_lbs = Number(body?.starting_weight_lbs ?? body?.starting_weight_lb ?? NaN);
    const starting_weight_g = Number(body?.starting_weight_g ?? body?.starting_weight_grams ?? NaN);
    const providedQuantity = Number(body?.quantity ?? NaN);
    const providedQuantityUnit = String(body?.quantity_unit || "").toLowerCase();

    const packaging_mode = body?.packaging_mode ? String(body.packaging_mode) : "jcrad";
    const packaging_sku_id = body?.packaging_sku_id ? String(body.packaging_sku_id) : null;
    const secondary_packaging_sku_id = body?.secondary_packaging_sku_id
      ? String(body.secondary_packaging_sku_id)
      : null;
    const packaging_submission_id = body?.packaging_submission_id ? String(body.packaging_submission_id) : null;
    const extra_touch_points = Number(body?.extra_touch_points || 0);
    const pre_roll_mode = body?.pre_roll_mode ? String(body.pre_roll_mode) : null;
    const internal_infusion_product_id = body?.internal_infusion_product_id
      ? String(body.internal_infusion_product_id).trim()
      : "";
    const discount_pct = Number.isFinite(Number(body?.discount_pct)) ? Math.max(0, Number(body.discount_pct)) : 0;
    const infusion_type = normalizeInfusionType(body?.infusion_type);
    const infusion_inputs = body?.infusion_inputs && typeof body.infusion_inputs === "object"
      ? (body.infusion_inputs as Record<string, unknown>)
      : {};

    let notes = body?.notes ? String(body.notes) : "";

    const productInventoryUnit = String(offer?.products?.inventory_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
    const material_cost_per_g_value = Number(offer.material_cost_per_g ?? NaN);
    const material_cost_basis = String(offer.material_cost_basis || "").toLowerCase();
    const material_cost_input = Number(offer.material_cost_input ?? NaN);
    const bulk_cost_per_unit = Number(offer.bulk_cost_per_lb ?? NaN);
    const costPerLbFromBasis =
      material_cost_basis === "per_g" && Number.isFinite(material_cost_input) && material_cost_input > 0
        ? material_cost_input * LB_TO_G
        : material_cost_basis === "per_lb" && Number.isFinite(material_cost_input) && material_cost_input > 0
          ? material_cost_input
          : null;
    const materialCostPerLb = costPerLbFromBasis != null
      ? costPerLbFromBasis
      : Number.isFinite(material_cost_per_g_value) && material_cost_per_g_value > 0
        ? material_cost_per_g_value * LB_TO_G
        : Number.isFinite(bulk_cost_per_unit) && bulk_cost_per_unit > 0
          ? productInventoryUnit === "g"
            ? bulk_cost_per_unit * LB_TO_G
            : bulk_cost_per_unit
          : null;

    const { data: pricingRows, error: pricingErr } = await supabase
      .from("app_settings")
      .select("key, value_json")
      .in("key", [
        "coa_base_cost",
        "coa_fee_per_run",
        "extra_touch_point_cost",
        "heat_shrink_unit_cost",
        "heat_shrink_unit_price",
        "cone_unit_cost",
        "sticker_unit_cost",
        "stickers_per_unit",
        "target_markup_pct",
        "flower_yield_pct",
        "concentrate_yield_pct",
        "preroll_yield_pct",
        "vape_fill_yield_pct",
        "infusion_internal_dry_g_per_lb",
        "internal_infusion_g_per_lb",
        "internal_thca_g_per_lb",
        "infusion_external_dist_g_per_unit_1g",
        "infusion_external_dry_g_per_unit_1g",
        "infusion_external_dist_g_per_1g_unit",
        "infusion_external_kief_g_per_1g_unit",
        "infusion_external_dist_loss_pct",
        "infusion_external_dry_loss_pct",
        "external_infusion_distillate_g_per_unit_1g",
        "external_distillate_g_per_unit_1g",
        "external_infusion_kief_g_per_unit_1g",
        "external_kief_g_per_unit_1g",
      ]);
    mark("after app_settings select");
    if (pricingErr) return respond({ error: pricingErr.message }, { status: 500 });
    const pricingByKey = new Map<string, unknown>();
    for (const row of pricingRows ?? []) {
      pricingByKey.set(String((row as any).key || ""), (row as any).value_json);
    }

    const coaBaseObj = (pricingByKey.get("coa_base_cost") && typeof pricingByKey.get("coa_base_cost") === "object"
      ? pricingByKey.get("coa_base_cost")
      : {}) as Record<string, unknown>;
    const coaFeeObj = (pricingByKey.get("coa_fee_per_run") && typeof pricingByKey.get("coa_fee_per_run") === "object"
      ? pricingByKey.get("coa_fee_per_run")
      : {}) as Record<string, unknown>;
    const coaBaseUsd = Number(coaBaseObj.usd);
    const coaFeeRunAmount = Number(coaFeeObj.amount);
    const coa_run_cost_usd = Number.isFinite(coaBaseUsd) && coaBaseUsd >= 0
      ? coaBaseUsd
      : Number.isFinite(coaFeeRunAmount) && coaFeeRunAmount >= 0
        ? coaFeeRunAmount
        : DEFAULT_COA_BASE_COST_USD;
    const sticker_unit_cost_usd = parseSettingNumber(
      pricingByKey.get("sticker_unit_cost"),
      DEFAULT_STICKER_UNIT_COST_USD
    );
    const stickers_per_unit = parseSettingNumber(
      pricingByKey.get("stickers_per_unit"),
      DEFAULT_STICKERS_PER_UNIT
    );
    const extra_touch_point_cost_usd = parseUsd(
      pricingByKey.get("extra_touch_point_cost"),
      DEFAULT_EXTRA_TOUCH_POINT_COST_USD
    );
    const heatShrinkUsd = parseSettingNumber(
      pricingByKey.get("heat_shrink_unit_cost") ?? pricingByKey.get("heat_shrink_unit_price"),
      DEFAULT_HEAT_SHRINK_UNIT_PRICE
    );
    const coneUnitCostUsd = parseSettingNumber(
      pricingByKey.get("cone_unit_cost"),
      DEFAULT_CONE_UNIT_COST_USD
    );
    const targetMarkupRaw = Number(
      ((pricingByKey.get("target_markup_pct") as Record<string, unknown> | null)?.pct ?? DEFAULT_TARGET_MARKUP_PCT)
    );
    const targetMarkupPct = Number.isFinite(targetMarkupRaw)
      ? Math.min(5, Math.max(0, targetMarkupRaw))
      : DEFAULT_TARGET_MARKUP_PCT;
    const markupMultiplier = 1 + targetMarkupPct;
    const internalInfusionDryGPerLb = parseSettingNumber(
      pricingByKey.get("infusion_internal_dry_g_per_lb")
      ?? pricingByKey.get("internal_infusion_g_per_lb")
      ?? pricingByKey.get("internal_thca_g_per_lb"),
      DEFAULT_INTERNAL_INFUSION_G_PER_LB
    );
    const externalDistillatePerUnit1g = parseCanonicalSettingNumber({
      settings: pricingByKey,
      canonicalKey: "infusion_external_dist_g_per_unit_1g",
      legacyKeys: [
        "infusion_external_dist_g_per_1g_unit",
        "external_infusion_distillate_g_per_unit_1g",
        "external_distillate_g_per_unit_1g",
      ],
      fallback: DEFAULT_EXTERNAL_DISTILLATE_PER_UNIT_1G,
    });
    const externalDryPerUnit1g = parseCanonicalSettingNumber({
      settings: pricingByKey,
      canonicalKey: "infusion_external_dry_g_per_unit_1g",
      legacyKeys: [
        "infusion_external_kief_g_per_1g_unit",
        "external_infusion_kief_g_per_unit_1g",
        "external_kief_g_per_unit_1g",
      ],
      fallback: DEFAULT_EXTERNAL_KIEF_PER_UNIT_1G,
    });
    const externalDistLossPct = parsePct(
      pricingByKey.get("infusion_external_dist_loss_pct"),
      DEFAULT_EXTERNAL_INFUSION_LOSS_PCT
    );
    const externalDryLossPct = parsePct(
      pricingByKey.get("infusion_external_dry_loss_pct"),
      DEFAULT_EXTERNAL_INFUSION_LOSS_PCT
    );

    const isPreRoll = isPreRollLine(mode, productCategory, pre_roll_mode);
    const yieldPct = isPreRoll
      ? parsePct(pricingByKey.get("preroll_yield_pct"), DEFAULT_YIELD_PCTS.preroll)
      : productCategory === "flower"
        ? parsePct(pricingByKey.get("flower_yield_pct"), DEFAULT_YIELD_PCTS.flower)
        : productCategory === "concentrate"
          ? parsePct(pricingByKey.get("concentrate_yield_pct"), DEFAULT_YIELD_PCTS.concentrate)
          : parsePct(pricingByKey.get("vape_fill_yield_pct"), DEFAULT_YIELD_PCTS.vape);
    const fallbackOfferPricingRow: OfferPricingRow = {
      id: String(offer.id),
      product_id: String(offer.product_id),
      material_cost_per_g: offer.material_cost_per_g,
      material_cost_basis: offer.material_cost_basis,
      material_cost_input: offer.material_cost_input,
      bulk_cost_per_lb: offer.bulk_cost_per_lb,
      bulk_sell_per_lb: offer.bulk_sell_per_lb,
      status: "selected",
      products: offer.products
        ? {
          id: String(offer.products.id),
          name: offer.products.name,
          inventory_unit: offer.products.inventory_unit,
        }
        : null,
    };
    const baseProductPricing = await resolveProductPricing({
      supabase,
      productId: String(offer.product_id),
      targetMarkupPct,
      fallbackOffer: fallbackOfferPricingRow,
    });
    if (!baseProductPricing) {
      return respond({ error: "Unable to resolve pricing for selected product offer." }, { status: 400 });
    }
    const resolvedMaterialSellPerLb = baseProductPricing.sellPerLb;
    if (resolvedMaterialSellPerLb == null || resolvedMaterialSellPerLb <= 0) {
      return respond({ error: "Material sell price missing for this offer/product." }, { status: 400 });
    }

    let material_unit_cost = 0;
    let packaging_unit_cost = 0;
    let labor_unit_cost_value = 0;
    let coa_unit_cost = 0;
    let material_total = 0;
    let packaging_total = 0;
    let labor_total = 0;
    let coa_total = 0;
    let material_cost_total = 0;
    let material_sell_total = 0;
    let packaging_cost_total = 0;
    let packaging_sell_total = 0;
    let packaging_base_sell_total = 0;
    let packaging_primary_cost_total = 0;
    let packaging_primary_sell_total = 0;
    let packaging_secondary_cost_total = 0;
    let packaging_secondary_sell_total = 0;
    let packaging_primary_label = "";
    let packaging_secondary_label = "";
    let sticker_sell_total = 0;
    let heat_shrink_sell_total = 0;
    let cone_sell_total = 0;
    let labor_cost_total = 0;
    let labor_sell_total = 0;
    let coa_cost_total = 0;
    let coa_sell_total = 0;
    let line_cost_total = 0;
    let line_sell_total = 0;
    let material_flower_cost_total = 0;
    let material_flower_sell_total = 0;
    let material_infusion_cost_total = 0;
    let material_infusion_sell_total = 0;
    let material_infusion_internal_sell_total = 0;
    let material_infusion_external_dist_sell_total = 0;
    let material_infusion_external_dry_sell_total = 0;
    let material_flower_unit_cost = 0;
    let material_infusion_unit_cost = 0;
    let persistedInfusionType: InfusionType = "none";
    let persistedInfusionInputs: Record<string, unknown> | null = null;
    let flower_grams_per_unit: number | null = null;
    let infusion_grams_total: number | null = null;
    let mix_grams_total: number | null = null;
    let unit_range_low: number | null = null;
    let unit_range_high: number | null = null;
    let hasInternalInfusionSelection = false;
    let hasExternalInfusionSelection = false;
    let material_infusion_internal_cost_total = 0;
    let material_infusion_external_dist_cost_total = 0;
    let material_infusion_external_dry_cost_total = 0;
    let packaging_base_cost_total = 0;
    let heat_shrink_cost_total = 0;
    let sticker_cost_total = 0;
    let cone_cost_total = 0;
    let flowerStartingLbsForBilling = 0;
    let internalAddedGComputed = 0;
    let distBaseGComputed = 0;
    let distTotalGComputed = 0;
    let dryBaseGComputed = 0;
    let dryTotalGComputed = 0;
    let internalSellPerGApplied = 0;
    let distSellPerGApplied = 0;
    let drySellPerGApplied = 0;

    if (mode === "bulk") {
      const defaultBulkUnit: "lb" | "g" = productInventoryUnit === "g" ? "g" : "lb";
      const selectedBulkUnit: "lb" | "g" =
        providedQuantityUnit === "g" || providedQuantityUnit === "lb"
          ? providedQuantityUnit
          : Number.isFinite(providedQuantity)
            ? defaultBulkUnit
            : body?.quantity_lbs != null
              ? "lb"
              : defaultBulkUnit;

      if (Number.isFinite(providedQuantity) && providedQuantity > 0) {
        quantity = providedQuantity;
      } else {
        quantity = quantity_lbs;
      }
      quantity_unit = selectedBulkUnit;
      quantity_lbs = quantity_unit === "g" ? quantity / LB_TO_G : quantity;
      if (productCategory === "flower") {
        if (!isWholePositiveInteger(quantity_lbs)) {
          return respond({ error: "Flower must be ordered in whole pounds." }, { status: 400 });
        }
        quantity_lbs = Math.round(quantity_lbs);
        flowerStartingLbsForBilling = quantity_lbs;
        quantity = quantity_lbs;
        quantity_unit = "lb";
      }

      if (quantity_lbs <= 0 || quantity <= 0) {
        return respond({ error: "quantity_lbs must be > 0" }, { status: 400 });
      }
      if (Number(offer.min_order || 0) > 0 && quantity_lbs < Number(offer.min_order || 0)) {
        return respond({ error: `Minimum bulk order is ${offer.min_order} lbs` }, { status: 400 });
      }
      if (Number.isFinite(material_cost_per_g_value) && material_cost_per_g_value > 0) {
        material_cost_total = money(material_cost_per_g_value * LB_TO_G * quantity_lbs);
      } else if (materialCostPerLb != null) {
        material_cost_total = money(materialCostPerLb * quantity_lbs);
      } else {
        return respond({ error: "Material cost missing for this offer" }, { status: 400 });
      }
      material_sell_total = money(resolvedMaterialSellPerLb * quantity_lbs);
      material_unit_cost = quantity_lbs > 0 ? money(material_sell_total / quantity_lbs) : 0;
      material_total = material_sell_total;
      material_flower_cost_total = material_cost_total;
      material_flower_sell_total = material_sell_total;
      material_infusion_cost_total = 0;
      material_infusion_sell_total = 0;
      material_flower_unit_cost = quantity_lbs > 0 ? money(material_flower_cost_total / quantity_lbs) : 0;
      material_infusion_unit_cost = 0;
      units = 0;
      pre_roll_pack_qty = 1;
    } else {
      if (units <= 0 && !(Number.isFinite(starting_weight_lbs) && starting_weight_lbs > 0) && !(Number.isFinite(starting_weight_g) && starting_weight_g > 0)) {
        return respond({ error: "starting weight or units must be > 0 for copack" }, { status: 400 });
      }

      try {
        validateUnitSize({ mode, category: productCategory, unitSize: unit_size, isPreRoll });
      } catch (e: any) {
        return respond({ error: e?.message || "Invalid unit size" }, { status: 400 });
      }

      if (isPreRoll) {
        if (pre_roll_pack_qty !== 1 && pre_roll_pack_qty !== 5) {
          return respond({ error: "pre_roll_pack_qty must be 1 or 5" }, { status: 400 });
        }
        if (pre_roll_pack_qty === 5 && unit_size === "1g") {
          return respond(
            { error: "5-pack pre-rolls are only allowed in 0.5g or 0.75g (not 1g)" },
            { status: 400 }
          );
        }
      } else {
        pre_roll_pack_qty = 1;
      }

      const unit_size_grams = gramsFromUnitSize(unit_size);
      const grams_per_unit = isPreRoll ? unit_size_grams * pre_roll_pack_qty : unit_size_grams;
      const derivedStartingWeightG = units * grams_per_unit;
      const derivedStartingWeightLb = derivedStartingWeightG / LB_TO_G;
      const hasStartingLbs = Number.isFinite(starting_weight_lbs) && starting_weight_lbs > 0;
      const hasStartingG = Number.isFinite(starting_weight_g) && starting_weight_g > 0;

      let startingWeightGForCalc = 0;
      let startingWeightLbForCalc = 0;
      if (productCategory === "concentrate") {
        const startingWeightG = hasStartingG
          ? starting_weight_g
          : providedQuantityUnit === "g" && Number.isFinite(providedQuantity) && providedQuantity > 0
            ? providedQuantity
            : providedQuantityUnit === "lb" && Number.isFinite(providedQuantity) && providedQuantity > 0
              ? providedQuantity * LB_TO_G
              : derivedStartingWeightG;
        startingWeightGForCalc = startingWeightG;
        startingWeightLbForCalc = startingWeightG / LB_TO_G;
        quantity = startingWeightG;
        quantity_unit = "g";
      } else if (productCategory === "vape") {
        const startingWeightG = hasStartingG
          ? starting_weight_g
          : providedQuantityUnit === "g" && Number.isFinite(providedQuantity) && providedQuantity > 0
            ? providedQuantity
            : providedQuantityUnit === "lb" && Number.isFinite(providedQuantity) && providedQuantity > 0
              ? providedQuantity * LB_TO_G
              : derivedStartingWeightG;
        startingWeightGForCalc = startingWeightG;
        startingWeightLbForCalc = startingWeightG / LB_TO_G;
        quantity = startingWeightG;
        quantity_unit = "g";
      } else {
        const startingWeightLb = hasStartingLbs
          ? starting_weight_lbs
          : providedQuantityUnit === "lb" && Number.isFinite(providedQuantity) && providedQuantity > 0
            ? providedQuantity
            : providedQuantityUnit === "g" && Number.isFinite(providedQuantity) && providedQuantity > 0
              ? providedQuantity / LB_TO_G
              : derivedStartingWeightLb;
        if (!isWholePositiveInteger(startingWeightLb)) {
          return respond({ error: "Flower must be ordered in whole pounds." }, { status: 400 });
        }
        flowerStartingLbsForBilling = Math.round(startingWeightLb);
        startingWeightGForCalc = flowerStartingLbsForBilling * LB_TO_G;
        startingWeightLbForCalc = flowerStartingLbsForBilling;
        quantity = flowerStartingLbsForBilling;
        quantity_unit = "lb";
      }

      const targetUnitG = gramsFromUnitSize(unit_size);
      let computedHighUnits = Math.max(0, Math.floor(startingWeightGForCalc / Math.max(1e-9, grams_per_unit)));
      let computedLowUnits = Math.max(0, Math.floor((startingWeightGForCalc * yieldPct) / Math.max(1e-9, grams_per_unit)));
      let internalInfusionProductIdForPricing = "";
      let externalLiquidProductIdForPricing = "";
      let externalDryProductIdForPricing = "";

      const internalInput = infusion_inputs.internal && typeof infusion_inputs.internal === "object"
        ? (infusion_inputs.internal as Record<string, unknown>)
        : null;
      const externalInput = infusion_inputs.external && typeof infusion_inputs.external === "object"
        ? (infusion_inputs.external as Record<string, unknown>)
        : null;
      const internalInputProductId = internalInput?.product_id ? String(internalInput.product_id).trim() : "";
      internalInfusionProductIdForPricing = internal_infusion_product_id || internalInputProductId;
      const externalLiquidProductIdRaw =
        externalInput?.liquid_product_id
        ?? externalInput?.distillate_product_id
        ?? body?.external_liquid_product_id
        ?? body?.external_distillate_product_id
        ?? "";
      const externalDryProductIdRaw =
        externalInput?.dry_product_id
        ?? externalInput?.kief_product_id
        ?? body?.external_dry_product_id
        ?? body?.external_kief_product_id
        ?? "";
      externalLiquidProductIdForPricing = String(externalLiquidProductIdRaw).trim();
      externalDryProductIdForPricing = String(externalDryProductIdRaw).trim();
      const hasInternalInfusion = Boolean(internal_infusion_product_id || internalInputProductId);
      const hasExternalInfusion = Boolean(
        externalInput?.liquid_product_id
          || externalInput?.dry_product_id
          || externalInput?.liquid_product_name
          || externalInput?.dry_product_name
          || infusion_type === "external"
      );
      hasInternalInfusionSelection = hasInternalInfusion;
      hasExternalInfusionSelection = hasExternalInfusion;

      if (hasInternalInfusion || hasExternalInfusion) {
        if (productCategory !== "flower") {
          return respond({ error: "Infusion is currently only supported for flower lines." }, { status: 400 });
        }
        if (hasExternalInfusion && !isPreRoll) {
          return respond({ error: "External infusion is currently only supported for pre-roll lines." }, { status: 400 });
        }

        const startFlowerG = startingWeightLbForCalc * INFUSION_LB_TO_G;
        const gPerLb = internalInfusionDryGPerLb;
        const internalAddedG = hasInternalInfusion ? flowerStartingLbsForBilling * gPerLb : 0;
        internalAddedGComputed = internalAddedG;
        const flowerBlendTotalG = startFlowerG + internalAddedG;

        if (isPreRoll) {
          const packQty = Math.max(1, pre_roll_pack_qty);
          const jointG = targetUnitG;
          const distPer1g = externalDistillatePerUnit1g;
          const dryPer1g = externalDryPerUnit1g;
          const distPerJoint = hasExternalInfusion ? distPer1g * jointG : 0;
          const dryPerJoint = hasExternalInfusion ? dryPer1g * jointG : 0;
          const flowerBlendPerJoint = jointG - distPerJoint - dryPerJoint;
          if (hasExternalInfusion && (!Number.isFinite(flowerBlendPerJoint) || flowerBlendPerJoint <= 0)) {
            return respond({ error: "Invalid external infusion ratios for selected unit size." }, { status: 400 });
          }
          const flowerBlendPerPack = flowerBlendPerJoint * packQty;
          const packsHigh = Math.max(0, Math.floor(flowerBlendTotalG / Math.max(1e-9, flowerBlendPerPack)));
          const packsLow = Math.max(0, Math.floor(packsHigh * yieldPct));
          const distBaseG = packsHigh * distPer1g;
          const dryBaseG = packsHigh * dryPer1g;
          const distPullG = distBaseG * (1 + externalDistLossPct);
          const dryPullG = dryBaseG * (1 + externalDryLossPct);
          distTotalGComputed = distPullG;
          dryTotalGComputed = dryPullG;
          computedHighUnits = packsHigh;
          computedLowUnits = packsLow;
          persistedInfusionType = hasExternalInfusion ? "external" : "internal";
          persistedInfusionInputs = {
            ...infusion_inputs,
            internal: hasInternalInfusion
              ? {
                ...internalInput,
                g_per_lb: gPerLb,
                added_g: money(internalAddedG),
              }
              : null,
            external: hasExternalInfusion
              ? {
                ...externalInput,
                dist_per_1g: distPer1g,
                dry_per_1g: dryPer1g,
                joint_g: jointG,
                joints_per_pack: packQty,
                dist_per_joint: distPerJoint,
                dry_per_joint: dryPerJoint,
                flower_blend_per_joint: flowerBlendPerJoint,
                flower_blend_per_pack: flowerBlendPerPack,
                dist_base_g: money(distBaseG),
                dry_base_g: money(dryBaseG),
                dist_loss_pct: externalDistLossPct,
                dry_loss_pct: externalDryLossPct,
                dist_total_g: money(distPullG),
                dry_total_g: money(dryPullG),
              }
              : null,
            flower_blend_total_g: money(flowerBlendTotalG),
          };
          infusion_grams_total = money(internalAddedG + distPullG + dryPullG);
          mix_grams_total = money(packsHigh * jointG * packQty);
          flower_grams_per_unit = money(flowerBlendPerPack);
        } else {
          const mixG = flowerBlendTotalG;
          computedHighUnits = Math.max(0, Math.floor(mixG / Math.max(1e-9, grams_per_unit)));
          computedLowUnits = Math.max(0, Math.floor((mixG * yieldPct) / Math.max(1e-9, grams_per_unit)));
          persistedInfusionType = "internal";
          persistedInfusionInputs = {
            ...infusion_inputs,
            internal: {
              ...internalInput,
              g_per_lb: gPerLb,
              added_g: money(internalAddedG),
            },
            external: null,
            flower_blend_total_g: money(flowerBlendTotalG),
          };
          infusion_grams_total = money(internalAddedG);
          mix_grams_total = money(mixG);
          flower_grams_per_unit = computedHighUnits > 0 ? money(startFlowerG / computedHighUnits) : 0;
        }
      }

      if (computedHighUnits < 1) {
        return respond(
          { error: "Starting weight must produce at least 1 quoted unit at the selected unit size." },
          { status: 400 }
        );
      }
      if (productCategory === "flower" && !isPreRoll && units > computedHighUnits) {
        return respond({ error: "Requested units exceed available material." }, { status: 400 });
      }
      units = computedHighUnits;
      unit_range_low = computedLowUnits;
      unit_range_high = computedHighUnits;
      if (flower_grams_per_unit == null) {
        flower_grams_per_unit = money(grams_per_unit);
      }

      if (productCategory === "flower" && quantity_unit === "lb") {
        if (materialCostPerLb == null) {
          return respond({ error: "Material cost missing for this offer" }, { status: 400 });
        }
        const flowerLbsBilled = Math.max(0, flowerStartingLbsForBilling || Number(quantity || 0));
        material_flower_cost_total = money(materialCostPerLb * flowerLbsBilled);
      } else if (Number.isFinite(material_cost_per_g_value) && material_cost_per_g_value > 0) {
        material_flower_cost_total = money(material_cost_per_g_value * startingWeightGForCalc);
      } else if (materialCostPerLb != null) {
        material_flower_cost_total = money(materialCostPerLb * startingWeightLbForCalc);
      } else {
        return respond({ error: "Material cost missing for this offer" }, { status: 400 });
      }
      if (productCategory === "flower") {
        const flowerLbsBilledForSell = Math.max(0, flowerStartingLbsForBilling || Number(quantity || 0));
        material_flower_sell_total = money(resolvedMaterialSellPerLb * flowerLbsBilledForSell);
      } else if ((baseProductPricing.sellPerG ?? 0) > 0) {
        material_flower_sell_total = money(startingWeightGForCalc * Number(baseProductPricing.sellPerG || 0));
      } else {
        material_flower_sell_total = money(material_flower_cost_total * markupMultiplier);
      }

      if (isPreRoll && hasExternalInfusionSelection) {
        distBaseGComputed = money(units * externalDistillatePerUnit1g);
        dryBaseGComputed = money(units * externalDryPerUnit1g);
        distTotalGComputed = money(distBaseGComputed * (1 + externalDistLossPct));
        dryTotalGComputed = money(dryBaseGComputed * (1 + externalDryLossPct));
        persistedInfusionInputs = {
          ...(persistedInfusionInputs || infusion_inputs || {}),
          external: hasExternalInfusionSelection
            ? {
              ...(((persistedInfusionInputs?.external as Record<string, unknown>) || externalInput || {}) as Record<string, unknown>),
              dist_per_1g: externalDistillatePerUnit1g,
              dry_per_1g: externalDryPerUnit1g,
              dist_base_g: distBaseGComputed,
              dry_base_g: dryBaseGComputed,
              dist_loss_pct: externalDistLossPct,
              dry_loss_pct: externalDryLossPct,
              dist_total_g: distTotalGComputed,
              dry_total_g: dryTotalGComputed,
            }
            : null,
        };
      }

      material_infusion_cost_total = 0;
      if (internalInfusionProductIdForPricing) {
        const internalPricing = await resolveProductPricing({
          supabase,
          productId: internalInfusionProductIdForPricing,
          targetMarkupPct,
        });
        if (!internalPricing) {
          return respond(
            { error: "Infusion product selected but no published offer exists for pricing." },
            { status: 400 }
          );
        }
        if (internalPricing.sellPerG == null || internalPricing.sellPerG <= 0) {
          return respond({ error: "Internal infusion sell price missing for selected product." }, { status: 400 });
        }
        internalSellPerGApplied = internalPricing.sellPerG;
        material_infusion_internal_cost_total = money(internalAddedGComputed * Number(internalPricing.costPerG || 0));
        material_infusion_internal_sell_total = money(internalAddedGComputed * internalPricing.sellPerG);
        material_infusion_cost_total = money(material_infusion_cost_total + material_infusion_internal_cost_total);
        persistedInfusionInputs = {
          ...(persistedInfusionInputs || infusion_inputs),
          internal: {
            ...(persistedInfusionInputs?.internal as Record<string, unknown> || internalInput || {}),
            product_id: internalInfusionProductIdForPricing,
            product_name:
              String((persistedInfusionInputs?.internal as Record<string, unknown> | null)?.product_name || "").trim()
              || internalPricing.productName
              || null,
          },
        };
      }
      if (externalLiquidProductIdForPricing || externalDryProductIdForPricing) {
        if (externalLiquidProductIdForPricing) {
          const liquidPricing = await resolveProductPricing({
            supabase,
            productId: externalLiquidProductIdForPricing,
            targetMarkupPct,
          });
          if (!liquidPricing) {
            return respond(
              { error: "Infusion product selected but no published offer exists for pricing." },
              { status: 400 }
            );
          }
          if (liquidPricing.sellPerG == null || liquidPricing.sellPerG <= 0) {
            return respond({ error: "External distillate sell price missing for selected product." }, { status: 400 });
          }
          distSellPerGApplied = liquidPricing.sellPerG;
          material_infusion_external_dist_cost_total = money(distBaseGComputed * Number(liquidPricing.costPerG || 0));
          material_infusion_external_dist_sell_total = money(distBaseGComputed * liquidPricing.sellPerG);
          material_infusion_cost_total = money(
            material_infusion_cost_total + material_infusion_external_dist_cost_total
          );
          persistedInfusionInputs = {
            ...(persistedInfusionInputs || infusion_inputs),
            external: {
              ...(persistedInfusionInputs?.external as Record<string, unknown> || externalInput || {}),
              liquid_product_id: externalLiquidProductIdForPricing,
              liquid_product_name:
                String((persistedInfusionInputs?.external as Record<string, unknown> | null)?.liquid_product_name || "").trim()
                || liquidPricing.productName
                || null,
            },
          };
        }
        if (externalDryProductIdForPricing) {
          const dryPricing = await resolveProductPricing({
            supabase,
            productId: externalDryProductIdForPricing,
            targetMarkupPct,
          });
          if (!dryPricing) {
            return respond(
              { error: "Infusion product selected but no published offer exists for pricing." },
              { status: 400 }
            );
          }
          if (dryPricing.sellPerG == null || dryPricing.sellPerG <= 0) {
            return respond({ error: "External dry sell price missing for selected product." }, { status: 400 });
          }
          drySellPerGApplied = dryPricing.sellPerG;
          material_infusion_external_dry_cost_total = money(dryBaseGComputed * Number(dryPricing.costPerG || 0));
          material_infusion_external_dry_sell_total = money(dryBaseGComputed * dryPricing.sellPerG);
          material_infusion_cost_total = money(
            material_infusion_cost_total + material_infusion_external_dry_cost_total
          );
          persistedInfusionInputs = {
            ...(persistedInfusionInputs || infusion_inputs),
            external: {
              ...(persistedInfusionInputs?.external as Record<string, unknown> || externalInput || {}),
              dry_product_id: externalDryProductIdForPricing,
              dry_product_name:
                String((persistedInfusionInputs?.external as Record<string, unknown> | null)?.dry_product_name || "").trim()
                || dryPricing.productName
                || null,
            },
          };
        }
      }

      material_infusion_sell_total = money(
        material_infusion_internal_sell_total
        + material_infusion_external_dist_sell_total
        + material_infusion_external_dry_sell_total
      );
      material_cost_total = money(material_flower_cost_total + material_infusion_cost_total);
      material_sell_total = money(material_flower_sell_total + material_infusion_sell_total);
      material_unit_cost = units > 0 ? money(material_sell_total / units) : 0;
      material_total = material_sell_total;
      material_flower_unit_cost = units > 0 ? money(material_flower_cost_total / units) : 0;
      material_infusion_unit_cost = units > 0 ? money(material_infusion_cost_total / units) : 0;

      let packagingType = "flower_in_bag";

      if (packaging_mode === "jcrad") {
        if (!packaging_sku_id) {
          return respond({ error: "packaging_sku_id required for JC RAD packaging" }, { status: 400 });
        }

        const { data: sku, error: skuErr } = await supabase
          .from("packaging_skus")
          .select("id, name, packaging_type, category, size_grams, pack_qty, vape_device, vape_fill_grams, applies_to, unit_cost")
          .eq("id", packaging_sku_id)
          .single();
        mark("after packaging_skus select");

        if (skuErr || !sku) {
          return respond({ error: skuErr?.message || "Packaging SKU not found" }, { status: 404 });
        }

        const skuCategory = packagingCategoryForSku(
          sku as { category?: unknown; applies_to?: unknown; packaging_type?: unknown }
        );
        if (isPreRoll) {
          if (skuCategory && skuCategory !== "pre_roll") {
            return respond({ error: "Pre-roll lines require pre_roll packaging SKUs" }, { status: 400 });
          }

          const skuSize = Number((sku as any).size_grams || 0);
          const skuQty = Number((sku as any).pack_qty || 0);
          const requestSize = gramsFromUnitSize(unit_size);
          if ((skuSize > 0 && Math.abs(skuSize - requestSize) > 1e-9) || (skuQty > 0 && skuQty !== pre_roll_pack_qty)) {
            return respond({ error: "Selected packaging SKU does not match pre-roll size/qty" }, { status: 400 });
          }
        } else if (skuCategory && skuCategory !== productCategory) {
          return respond({ error: `Selected packaging SKU category must be ${productCategory}` }, { status: 400 });
        }

        const { data: skuPriceTiers, error: skuPriceErr } = await supabase
          .from("packaging_price_tiers")
          .select("moq, unit_price")
          .eq("packaging_sku_id", packaging_sku_id);
        mark("after packaging_price_tiers select");

        const pricingTierTableMissing = String(skuPriceErr?.message || "").toLowerCase().includes("packaging_price_tiers");
        if (skuPriceErr && !pricingTierTableMissing) {
          return respond({ error: skuPriceErr.message }, { status: 500 });
        }

        const selectedTier = selectPackagingTier(
          units,
          (skuPriceTiers ?? []).map((tier: any) => ({ moq: Number(tier.moq || 0), unit_price: Number(tier.unit_price || 0) }))
        );

        packagingType = String((sku as any).packaging_type || "flower_in_bag");
        void selectedTier;
        let packagingUnitCostInternal = money(Number((sku as any).unit_cost || 0));
        packaging_primary_cost_total = packagingUnitCostInternal;
        const isVapeHardwarePackaging =
          productCategory === "vape" && (packagingType === "vape_510_cart" || packagingType === "vape_all_in_one");
        if (isVapeHardwarePackaging) {
          packaging_primary_label = String((sku as any).name || "Vape hardware");
        }

        if (productCategory === "concentrate" || isVapeHardwarePackaging) {
          if (!secondary_packaging_sku_id) {
            return respond(
              {
                error: productCategory === "vape"
                  ? "Secondary bag (required) must be selected for vape JC RAD packaging."
                  : "Secondary bag (required) must be selected for concentrate JC RAD packaging.",
              },
              { status: 400 }
            );
          }

          const { data: secondarySku, error: secondaryErr } = await supabase
            .from("packaging_skus")
            .select(
              "id, name, packaging_type, size_grams, active, applies_to, workflow_contexts, packaging_role, unit_cost"
            )
            .eq("id", secondary_packaging_sku_id)
            .single();

          if (secondaryErr || !secondarySku) {
            return respond({ error: secondaryErr?.message || "Secondary packaging SKU not found" }, { status: 404 });
          }

          const secondaryAppliesTo = String((secondarySku as any).applies_to || "").toLowerCase();
          const secondaryContextOk =
            productCategory === "vape"
              ? true
              : hasWorkflowContext(secondarySku, "concentrate") || secondaryAppliesTo === "concentrate";

          if (
            !isMylar35SecondarySku(secondarySku) ||
            !secondaryContextOk
          ) {
            return respond(
              {
                error: productCategory === "vape"
                  ? "Secondary bag must be an active 3.5g flower_in_bag SKU for vape hardware jobs."
                  : "Secondary bag must be an active 3.5g flower_in_bag SKU valid for concentrate context.",
              },
              { status: 400 }
            );
          }

          packaging_secondary_cost_total = money(Number((secondarySku as any).unit_cost || 0));
          if (isVapeHardwarePackaging) {
            packaging_secondary_label = String((secondarySku as any).name || "3.5g mylar bag");
          }
          packagingUnitCostInternal = money(packagingUnitCostInternal + packaging_secondary_cost_total);
        }

        packaging_base_cost_total = money(packagingUnitCostInternal * units);
        packaging_primary_sell_total = money(packaging_primary_cost_total * units * markupMultiplier);
        packaging_secondary_sell_total = money(packaging_secondary_cost_total * units * markupMultiplier);
        packaging_cost_total = packaging_base_cost_total;
        if (isPreRoll) {
          const heatShrinkQty = Math.max(
            0,
            Math.floor(Number.isFinite(Number(unit_range_high)) ? Number(unit_range_high) : Number(units || 0))
          );
          heat_shrink_cost_total = money(heatShrinkUsd * heatShrinkQty);
          packaging_cost_total = money(packaging_cost_total + heat_shrink_cost_total);
        }
      } else {
        if (isPreRoll) {
          return respond({ error: "Customer packaging is not available for pre-roll mode" }, { status: 400 });
        }

        packaging_base_cost_total = 0;
        heat_shrink_cost_total = 0;
        packaging_cost_total = 0;
        if (!notes.includes("Packaging Review Pending")) {
          notes = notes ? `${notes}\nPackaging Review Pending` : "Packaging Review Pending";
        }
      }

      let laborUnitCostRaw = money(
        laborUnitCost({
          category: offer?.products?.category,
          packagingType,
          preRollMode: pre_roll_mode,
          isPreRoll,
          customerPackaging: packaging_mode === "customer",
          extraTouchPoints: packaging_mode === "customer" ? extra_touch_points : 0,
          extraTouchPointCostUsd: extra_touch_point_cost_usd,
        })
      );
      if (isPreRoll && hasInternalInfusionSelection && hasExternalInfusionSelection) {
        // Combined internal+external pre-roll labor override (sell/pass-through rate).
        laborUnitCostRaw = 1.43;
      }
      labor_cost_total = money(laborUnitCostRaw * units);
      labor_sell_total = labor_cost_total;
      labor_unit_cost_value = units > 0 ? money(labor_sell_total / units) : 0;
      labor_total = labor_sell_total;
      quantity_lbs = quantity_unit === "g" ? quantity / LB_TO_G : quantity_unit === "lb" ? quantity : derivedStartingWeightLb;
    }

    const quotedUnitsHighRaw = Number.isFinite(Number(unit_range_high)) ? Number(unit_range_high) : Number(units || 0);
    const quotedUnitsHigh = Math.max(0, Math.floor(quotedUnitsHighRaw));
    const excludeJcRadPackagingCosts = mode === "copack" && packaging_mode === "customer";
    const stickerQty = !excludeJcRadPackagingCosts && quotedUnitsHigh > 0
      ? quotedUnitsHigh * Math.max(0, stickers_per_unit)
      : 0;
    sticker_cost_total = money(stickerQty * Math.max(0, sticker_unit_cost_usd));
    const coneQty = !excludeJcRadPackagingCosts && isPreRoll ? quotedUnitsHigh : 0;
    cone_cost_total = money(coneQty * Math.max(0, coneUnitCostUsd));
    packaging_cost_total = money(packaging_cost_total + sticker_cost_total + cone_cost_total);
    packaging_base_sell_total = money(packaging_base_cost_total * markupMultiplier);
    sticker_sell_total = sticker_cost_total;
    heat_shrink_sell_total = heat_shrink_cost_total;
    cone_sell_total = cone_cost_total;
    packaging_sell_total = money(
      packaging_base_sell_total + sticker_sell_total + heat_shrink_sell_total + cone_sell_total
    );
    packaging_unit_cost = quotedUnitsHigh > 0 ? money(packaging_sell_total / quotedUnitsHigh) : 0;
    packaging_total = packaging_sell_total;

    if (quotedUnitsHigh > 0) {
      coa_cost_total = money(coa_run_cost_usd);
      coa_sell_total = coa_cost_total;
      coa_total = coa_sell_total;
      coa_unit_cost = money(coa_total / quotedUnitsHigh);
    } else {
      coa_cost_total = 0;
      coa_sell_total = 0;
      coa_total = 0;
      coa_unit_cost = 0;
    }

    if (mode === "copack" && !quantity_unit) {
      quantity_unit = "lb";
      if (!Number.isFinite(quantity) || quantity <= 0) {
        const payloadStartingLbs = Number(body?.starting_weight_lbs ?? body?.starting_weight_lb ?? NaN);
        quantity = Number.isFinite(payloadStartingLbs) && payloadStartingLbs > 0 ? payloadStartingLbs : Number(quantity_lbs || 0);
      }
    } else if (mode === "bulk" && !quantity_unit) {
      quantity_unit = "lb";
    }
    if (material_infusion_cost_total > 0 || persistedInfusionInputs || isPreRoll || quotedUnitsHigh > 0) {
      const materialInfusionInternalSell = material_infusion_internal_sell_total;
      const materialInfusionExternalDistSell = material_infusion_external_dist_sell_total;
      const materialInfusionExternalDrySell = material_infusion_external_dry_sell_total;
      const materialFlowerSell = material_flower_sell_total;
      const packagingBaseSell = packaging_base_sell_total;
      const stickerSell = sticker_sell_total;
      const heatShrinkSell = heat_shrink_sell_total;
      const coneSell = cone_sell_total;
      const packagingPrimarySell = packaging_primary_sell_total;
      const packagingSecondarySell = packaging_secondary_sell_total;
      const lineCostComputed = money(material_cost_total + packaging_cost_total + labor_cost_total + coa_cost_total);
      const lineSellComputed = money(material_sell_total + packaging_sell_total + labor_sell_total + coa_sell_total);
      if (isDev && debugRequested && productCategory === "flower") {
        console.log(`[add-line:${requestId}] reconciliation`, {
          units_high: quotedUnitsHigh,
          dist_base_g: distBaseGComputed,
          dry_base_g: dryBaseGComputed,
          dist_pull_g: distTotalGComputed,
          dry_pull_g: dryTotalGComputed,
          dist_sell_per_g: distBaseGComputed > 0
            ? money(materialInfusionExternalDistSell / distBaseGComputed)
            : 0,
          dry_sell_per_g: dryBaseGComputed > 0
            ? money(materialInfusionExternalDrySell / dryBaseGComputed)
            : 0,
          flower_lbs_billed: flowerStartingLbsForBilling || Number(quantity || 0),
          flower_sell_per_lb: resolvedMaterialSellPerLb,
          flower_sell_total: material_flower_sell_total,
        });
        console.log(`[add-line:${requestId}] flower-infusion-debug`, {
          flowerStartingLbsForBilling,
          flower_cost_per_lb: materialCostPerLb,
          flower_cost_total: material_flower_cost_total,
          flower_sell_total: material_flower_sell_total,
          quotedUnitsHigh,
          dist_base_g: distBaseGComputed,
          dist_pull_g: distTotalGComputed,
          dist_sell_per_g: distBaseGComputed > 0
            ? money(materialInfusionExternalDistSell / distBaseGComputed)
            : 0,
          dist_sell_total: materialInfusionExternalDistSell,
          dry_base_g: dryBaseGComputed,
          dry_pull_g: dryTotalGComputed,
          dry_sell_per_g: dryBaseGComputed > 0
            ? money(materialInfusionExternalDrySell / dryBaseGComputed)
            : 0,
          dry_sell_total: materialInfusionExternalDrySell,
        });
      }
      if (isDev && isPreRoll && quotedUnitsHigh === 3560) {
        console.log(`[add-line:${requestId}] sanity-check`, {
          labor_unit_sell_expected_1_43: money(labor_sell_total / Math.max(1, quotedUnitsHigh)),
          coa_total_expected_450: coa_sell_total,
          cone_unit_expected_0_10: money(cone_sell_total / Math.max(1, quotedUnitsHigh)),
        });
      }
      persistedInfusionInputs = {
        ...(persistedInfusionInputs || infusion_inputs || {}),
        material_breakdown: {
          flower_cost_total: money(material_flower_cost_total),
          infusion_cost_total: money(material_infusion_cost_total),
          flower_unit_cost: money(material_flower_unit_cost),
          infusion_unit_cost: money(material_infusion_unit_cost),
        },
        cost_breakdown: {
          material: {
            flower_cost_total: money(material_flower_cost_total),
            flower_sell_total: materialFlowerSell,
            internal_infusion_cost_total: money(material_infusion_internal_cost_total),
            internal_infusion_sell_total: materialInfusionInternalSell,
            internal_infusion_grams: money(internalAddedGComputed),
            external_distillate_cost_total: money(material_infusion_external_dist_cost_total),
            external_distillate_sell_total: materialInfusionExternalDistSell,
            external_distillate_grams_base: money(distBaseGComputed),
            external_distillate_grams_to_pull: money(distTotalGComputed),
            external_distillate_sell_per_g: distBaseGComputed > 0
              ? money(materialInfusionExternalDistSell / distBaseGComputed)
              : 0,
            external_dry_cost_total: money(material_infusion_external_dry_cost_total),
            external_dry_sell_total: materialInfusionExternalDrySell,
            external_dry_grams_base: money(dryBaseGComputed),
            external_dry_grams_to_pull: money(dryTotalGComputed),
            external_dry_sell_per_g: dryBaseGComputed > 0
              ? money(materialInfusionExternalDrySell / dryBaseGComputed)
              : 0,
            total_cost_total: money(material_cost_total),
            total_sell_total: money(material_sell_total),
          },
          packaging: {
            base_cost_total: money(packaging_base_cost_total),
            base_sell_total: packagingBaseSell,
            primary_label: packaging_primary_label,
            primary_cost_total: money(packaging_primary_cost_total * units),
            primary_sell_total: packagingPrimarySell,
            secondary_label: packaging_secondary_label,
            secondary_cost_total: money(packaging_secondary_cost_total * units),
            secondary_sell_total: packagingSecondarySell,
            stickers_cost_total: money(sticker_cost_total),
            stickers_sell_total: stickerSell,
            heat_shrink_cost_total: money(heat_shrink_cost_total),
            heat_shrink_sell_total: heatShrinkSell,
            cone_cost_total: money(cone_cost_total),
            cone_sell_total: coneSell,
            total_cost_total: money(packaging_cost_total),
            total_sell_total: money(packaging_sell_total),
          },
          labor: {
            cost_total: money(labor_cost_total),
            sell_total: money(labor_sell_total),
            unit_cost: quotedUnitsHigh > 0 ? money(labor_cost_total / quotedUnitsHigh) : 0,
            unit_sell: quotedUnitsHigh > 0 ? money(labor_sell_total / quotedUnitsHigh) : 0,
          },
          coa: {
            cost_total: money(coa_cost_total),
            sell_total: money(coa_sell_total),
            unit_cost: quotedUnitsHigh > 0 ? money(coa_cost_total / quotedUnitsHigh) : 0,
            unit_sell: quotedUnitsHigh > 0 ? money(coa_sell_total / quotedUnitsHigh) : 0,
          },
          line: {
            cost_total: lineCostComputed,
            sell_total: lineSellComputed,
            unit_sell: quotedUnitsHigh > 0 ? money(lineSellComputed / quotedUnitsHigh) : 0,
            unit_label: quotedUnitsHigh > 0 ? "unit" : quantity_unit,
            unit_count: quotedUnitsHigh > 0 ? quotedUnitsHigh : Number(quantity || 0),
          },
        },
      };
    }
    if (!quantity_unit) quantity_unit = "units";
    if (!Number.isFinite(quantity) || quantity < 0) {
      return respond({ error: "quantity must be a finite number >= 0" }, { status: 400 });
    }
    const requiredLinePayload = {
      quantity,
      quantity_unit: (quantity_unit || "units") as "lb" | "g" | "units",
    };

    const requestedLb = mode === "copack"
      ? quantity_unit === "lb"
        ? Number(quantity || 0)
        : quantity_unit === "g"
          ? Number(quantity || 0) / LB_TO_G
          : lbsFromEstimateLine({
            mode,
            quantity_lbs,
            units,
            unit_size,
            pre_roll_mode,
            pre_roll_pack_qty,
          })
      : lbsFromEstimateLine({
        mode,
        quantity_lbs,
        units,
        unit_size,
        pre_roll_mode,
        pre_roll_pack_qty,
      });

    try {
      await validateInventoryAvailable({
        supabase,
        estimateId: estimate_id,
        lineId: line_id,
        productId: String(offer.product_id),
        productInventoryQty: Number(offer?.products?.inventory_qty || 0),
        productInventoryUnit: offer?.products?.inventory_unit || "lb",
        requestedLb,
      });
      mark("after validateInventoryAvailable");
    } catch (e: any) {
      return respond({ error: e?.message || "Insufficient inventory" }, { status: 400 });
    }

    line_cost_total = money(material_cost_total + packaging_cost_total + labor_cost_total + coa_cost_total);
    line_sell_total = money(material_sell_total + packaging_sell_total + labor_sell_total + coa_sell_total);
    const line_total = line_sell_total;

    const linePayloadBase = {
      estimate_id,
      offer_id,
      mode,
      ...requiredLinePayload,
      quantity_lbs,
      units,
      unit_size,
      packaging_mode,
      packaging_sku_id,
      secondary_packaging_sku_id: packaging_mode === "jcrad" && productCategory === "concentrate"
        ? secondary_packaging_sku_id
        : null,
      packaging_submission_id,
      extra_touch_points: packaging_mode === "customer" ? Math.max(0, extra_touch_points) : 0,
      pre_roll_mode,
      pre_roll_pack_qty,
      infusion_type: persistedInfusionType,
      infusion_inputs: persistedInfusionInputs,
      flower_grams_per_unit,
      infusion_grams_total,
      mix_grams_total,
      unit_range_low,
      unit_range_high,
      material_unit_cost,
      packaging_unit_cost,
      labor_unit_cost: labor_unit_cost_value,
      material_total,
      packaging_total,
      labor_total,
      coa_total,
      coa_unit_cost,
      material_cost_total,
      material_sell_total,
      packaging_cost_total,
      packaging_sell_total,
      line_cost_total,
      line_sell_total,
      target_markup_pct_applied: targetMarkupPct,
      discount_pct,
      line_total,
      notes,
    };
    const linePayloadWithOptional = {
      ...linePayloadBase,
      material_flower_cost_total,
      material_infusion_cost_total,
      material_flower_unit_cost,
      material_infusion_unit_cost,
    };
    const line = await upsertLineWithFallback({
      supabase,
      estimateId: estimate_id,
      lineId: line_id,
      offerId: offer_id,
      mode,
      payloadBase: linePayloadBase,
      payloadOptional: linePayloadWithOptional,
      optionalColumns: [
        "secondary_packaging_sku_id",
        "infusion_type",
        "infusion_inputs",
        "flower_grams_per_unit",
        "infusion_grams_total",
        "mix_grams_total",
        "unit_range_low",
        "unit_range_high",
        "material_flower_cost_total",
        "material_infusion_cost_total",
        "material_flower_unit_cost",
        "material_infusion_unit_cost",
      ],
      requestId,
    });
    mark("after upsertLineWithFallback");

    const totals = await recalcEstimate(supabase, estimate_id);
    mark("after recalcEstimate");
    console.log(`[add-line:${requestId}] success`, { ms: Date.now() - t0, estimate_id, line_id: line?.id ?? null });
    await logPlatformEvent({
      eventType: "estimate_line_added",
      metadata: {
        estimate_id,
        line_id: String((line as any)?.id || ""),
        offer_id,
        mode,
        quantity_unit,
        units: Number(units || 0),
      },
    });
    mark("final return");
    const debugPayload = debugRequested
      ? {
        billed_lbs: money(
          Math.max(
            0,
            flowerStartingLbsForBilling
            || (quantity_unit === "lb" ? Number(quantity || 0) : Number(quantity_lbs || 0))
          )
        ),
        units_high: quotedUnitsHigh,
        internal_g: money(internalAddedGComputed),
        dist_base_g: money(distBaseGComputed),
        dry_base_g: money(dryBaseGComputed),
        sell_per_lb: money(resolvedMaterialSellPerLb),
        internal_sell_per_g: money(internalSellPerGApplied),
        dist_sell_per_g: money(distSellPerGApplied),
        dry_sell_per_g: money(drySellPerGApplied),
        totals: {
          material_flower_sell_total: money(material_flower_sell_total),
          material_infusion_internal_sell_total: money(material_infusion_internal_sell_total),
          material_infusion_external_dist_sell_total: money(material_infusion_external_dist_sell_total),
          material_infusion_external_dry_sell_total: money(material_infusion_external_dry_sell_total),
          material_sell_total: money(material_sell_total),
          packaging_sell_total: money(packaging_sell_total),
          labor_sell_total: money(labor_sell_total),
          coa_sell_total: money(coa_sell_total),
          line_sell_total: money(line_sell_total),
        },
      }
      : null;
    return respond({ estimate_id, line, totals, ...(debugPayload ? { debug: debugPayload } : {}) });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("TIMEOUT:")) {
      console.error(`[add-line:${requestId}] error`, { ms: Date.now() - t0, err });
      return respond({ error: err.message }, { status: 504 });
    }
    console.error(`[add-line:${requestId}] error`, { ms: Date.now() - t0, err });
    const errorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
    const errorName = err instanceof Error ? err.name : undefined;
    const errorStack = err instanceof Error ? err.stack : undefined;
    if (isDev) {
      return respond(
        {
          error: errorMessage,
          debug: {
            message: errorMessage,
            stack: errorStack,
            name: errorName,
          },
        },
        { status: 500 }
      );
    }
    return respond(
      { error: "Unable to add this line right now. Please try again or contact JC RAD Inc. if the issue continues." },
      { status: 500 }
    );
  }
}
