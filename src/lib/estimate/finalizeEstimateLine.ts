import { laborUnitCost, money } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = ReturnType<typeof createAdminClient>;
type AppSettingRow = { key: string | null; value_json: unknown };
type OfferRow = {
  id: string;
  material_cost_per_g: number | null;
  bulk_cost_per_lb: number | null;
  products: { category: string | null } | null;
};
type PackagingSkuRow = { id: string; packaging_type: string | null; unit_cost: number | null };

const LB_TO_G = 453.592;
const DEFAULT_COA_BASE_COST_USD = 450;
const DEFAULT_MARGIN_PCT_DECIMAL = 0.2;
const DEFAULT_EXTRA_TOUCH_POINT_COST_USD = 0.1;

type FinalizedFields = {
  estimate_line_id: string;
  finished_units: number;
  final_line_total: number;
  packaging_total_final: number;
  labor_total_final: number;
  coa_total: number;
  material_total: number;
  final_cost_total: number;
};

function parseUsd(valueJson: unknown, fallback: number): number {
  const obj = valueJson && typeof valueJson === "object" ? (valueJson as Record<string, unknown>) : {};
  const raw = Number(obj.usd);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}

function parseMarginPct(valueJson: unknown): number {
  const obj = valueJson && typeof valueJson === "object" ? (valueJson as Record<string, unknown>) : {};
  const raw = Number(obj.pct);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_MARGIN_PCT_DECIMAL;
  return raw;
}

function toMarginDecimal(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function isUnknownColumnError(error: unknown, columnName: string): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "").toLowerCase();
  return message.includes("column") && message.includes(columnName.toLowerCase());
}

function toFiniteNonNegative(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function inferPackagingType(category: string): "flower_in_bag" | "concentrate" | "vape" {
  if (category === "concentrate") return "concentrate";
  if (category === "vape") return "vape";
  return "flower_in_bag";
}

async function loadPricingSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", ["default_margin_pct", "coa_base_cost", "extra_touch_point_cost"]);

  if (error) throw new Error(error.message);

  const byKey = new Map<string, unknown>();
  for (const row of (data ?? []) as AppSettingRow[]) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  return {
    defaultMarginPctDecimal: parseMarginPct(byKey.get("default_margin_pct")),
    coaBaseCostUsd: parseUsd(byKey.get("coa_base_cost"), DEFAULT_COA_BASE_COST_USD),
    extraTouchPointCostUsd: parseUsd(byKey.get("extra_touch_point_cost"), DEFAULT_EXTRA_TOUCH_POINT_COST_USD),
  };
}

async function applyFinalizeUpdate(args: {
  supabase: SupabaseClient;
  estimateLineId: string;
  payload: Record<string, unknown>;
}) {
  const requiredColumns = ["finished_units", "final_line_total"];
  const removableColumns = [
    "packaging_total_final",
    "labor_total_final",
    "final_cost_total",
    "finalized_at",
  ];
  const workingPayload = { ...args.payload };

  while (true) {
    const { data, error } = await args.supabase
      .from("estimate_lines")
      .update(workingPayload)
      .eq("id", args.estimateLineId)
      .select("*")
      .single();

    if (!error) return data;

    const missingRequired = requiredColumns.filter((col) => isUnknownColumnError(error, col));
    if (missingRequired.length > 0) {
      throw new Error(
        `Missing required estimate_lines columns: ${missingRequired.join(", ")}. Add these columns to support line finalization.`
      );
    }

    const unknownOptional = removableColumns.find((col) => isUnknownColumnError(error, col));
    if (!unknownOptional) {
      throw new Error(error.message);
    }

    delete (workingPayload as Record<string, unknown>)[unknownOptional];
  }
}

export async function finalizeEstimateLine(args: {
  supabase: SupabaseClient;
  estimateLineId: string;
  finishedUnits: number;
}): Promise<FinalizedFields> {
  const { supabase, estimateLineId } = args;
  const finishedUnits = Math.floor(Number(args.finishedUnits));

  if (!Number.isFinite(finishedUnits) || finishedUnits < 0) {
    throw new Error("finished_units must be an integer >= 0");
  }

  const { data: line, error: lineError } = await supabase
    .from("estimate_lines")
    .select("*")
    .eq("id", estimateLineId)
    .single();

  if (lineError || !line) {
    throw new Error(lineError?.message || "Estimate line not found");
  }
  const lineRow = line as Record<string, unknown>;

  const offerId = String(lineRow.offer_id || "");
  if (!offerId) {
    throw new Error("Estimate line is missing offer_id");
  }

  const [{ defaultMarginPctDecimal, coaBaseCostUsd, extraTouchPointCostUsd }, offerResult] = await Promise.all([
    loadPricingSettings(supabase),
    supabase
      .from("offers")
      .select("id, material_cost_per_g, bulk_cost_per_lb, products:product_id(category)")
      .eq("id", offerId)
      .single(),
  ]);

  if (offerResult.error || !offerResult.data) {
    throw new Error(offerResult.error?.message || "Offer not found for estimate line");
  }

  const offer = offerResult.data as unknown as OfferRow;
  const category = String(offer?.products?.category || "").toLowerCase();
  const materialCostPerGValue = Number(offer?.material_cost_per_g ?? NaN);
  const bulkCostPerLb = Number(offer?.bulk_cost_per_lb ?? NaN);
  const materialCostPerG =
    Number.isFinite(materialCostPerGValue) && materialCostPerGValue >= 0
      ? materialCostPerGValue
      : Number.isFinite(bulkCostPerLb)
        ? bulkCostPerLb / LB_TO_G
        : null;

  const storedMaterialTotal = toFiniteNonNegative(lineRow.material_total);
  let materialTotal = storedMaterialTotal ?? 0;
  if (storedMaterialTotal == null) {
    if (materialCostPerG == null) {
      throw new Error("material_total is missing and material cost cannot be derived from offer");
    }

    const quantity = Number(lineRow.quantity ?? NaN);
    const quantityUnit = String(lineRow.quantity_unit || "").toLowerCase();
    const quantityLbs = Number(lineRow.quantity_lbs ?? NaN);
    let sourceGrams = 0;

    if (Number.isFinite(quantity) && quantity >= 0 && quantityUnit === "lb") {
      sourceGrams = quantity * LB_TO_G;
    } else if (Number.isFinite(quantity) && quantity >= 0 && quantityUnit === "g") {
      sourceGrams = quantity;
    } else if (Number.isFinite(quantityLbs) && quantityLbs >= 0) {
      sourceGrams = quantityLbs * LB_TO_G;
    } else {
      const quotedUnits = Math.max(0, Number(lineRow.units || 0));
      const unitSize = Number(String(lineRow.unit_size || "1").replace(/[^0-9.]/g, ""));
      const gramsPerUnit = Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1;
      sourceGrams = quotedUnits * gramsPerUnit;
    }

    materialTotal = money(materialCostPerG * sourceGrams);
  }

  const coaTotal = money(toFiniteNonNegative(lineRow.coa_total) ?? coaBaseCostUsd);
  const marginPctDecimal = toMarginDecimal(lineRow.margin_pct, defaultMarginPctDecimal);

  let packagingUnitCost = toFiniteNonNegative(lineRow.packaging_unit_cost) ?? 0;
  let packagingType = "flower_in_bag";

  const isJcRadPackaging = String(lineRow.packaging_mode || "").toLowerCase() === "jcrad";
  const packagingSkuId = String(lineRow.packaging_sku_id || "");
  if (isJcRadPackaging && packagingSkuId) {
    const { data: sku, error: skuError } = await supabase
      .from("packaging_skus")
      .select("id, packaging_type, unit_cost")
      .eq("id", packagingSkuId)
      .single();
    if (skuError || !sku) {
      throw new Error(skuError?.message || "Packaging SKU not found for estimate line");
    }
    const skuRow = sku as unknown as PackagingSkuRow;

    packagingType = String(skuRow.packaging_type || "flower_in_bag");
    if (toFiniteNonNegative(lineRow.packaging_unit_cost) == null) {
      packagingUnitCost = money(Number(skuRow.unit_cost || 0));
    }
  } else {
    packagingType = inferPackagingType(category);
    if (String(lineRow.packaging_mode || "").toLowerCase() === "customer") {
      packagingUnitCost = 0;
    }
  }

  const isPreRoll = String(lineRow.mode || "").toLowerCase() === "copack" && category === "flower" && !!lineRow.pre_roll_mode;
  const laborUnitCostValue = money(
    laborUnitCost({
      category,
      packagingType,
      preRollMode: String(lineRow.pre_roll_mode || ""),
      isPreRoll,
      customerPackaging: String(lineRow.packaging_mode || "").toLowerCase() === "customer",
      extraTouchPoints: Number(lineRow.extra_touch_points || 0),
      extraTouchPointCostUsd,
    })
  );

  const packagingTotalFinal = money(packagingUnitCost * finishedUnits);
  const laborTotalFinal = money(laborUnitCostValue * finishedUnits);
  const finalCostTotal = money(materialTotal + coaTotal + packagingTotalFinal + laborTotalFinal);
  const finalLineTotal = money(finalCostTotal * (1 + marginPctDecimal));

  await applyFinalizeUpdate({
    supabase,
    estimateLineId,
    payload: {
      finished_units: finishedUnits,
      packaging_total_final: packagingTotalFinal,
      labor_total_final: laborTotalFinal,
      final_cost_total: finalCostTotal,
      final_line_total: finalLineTotal,
      finalized_at: new Date().toISOString(),
    },
  });

  return {
    estimate_line_id: estimateLineId,
    finished_units: finishedUnits,
    final_line_total: finalLineTotal,
    packaging_total_final: packagingTotalFinal,
    labor_total_final: laborTotalFinal,
    coa_total: coaTotal,
    material_total: materialTotal,
    final_cost_total: finalCostTotal,
  };
}

export async function getEstimateLineFinalizationView(args: { supabase: SupabaseClient; estimateLineId: string }) {
  const { data, error } = await args.supabase
    .from("estimate_lines")
    .select("*")
    .eq("id", args.estimateLineId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Estimate line not found");
  }

  return data;
}
