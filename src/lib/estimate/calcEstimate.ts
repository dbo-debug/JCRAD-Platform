import { createAdminClient } from "@/lib/supabase/admin";

type PricingDefaults = {
  default_margin_pct: number;
  touchpoint_cost: number;
  ca_symbol_sticker_cost: number;
  max_discount_pct: number;
};

const DEFAULTS: PricingDefaults = {
  default_margin_pct: 0,
  touchpoint_cost: 0,
  ca_symbol_sticker_cost: 0,
  max_discount_pct: 0,
};

const SETTINGS_KEY = "pricing_defaults";

export type CalcEstimateInput = {
  qty_units: number;
  packaging_sku_id: string;
  labor_codes: string | string[];
  margin_pct?: number | null;
  discount_pct?: number | null;
  discount_amount?: number | null;
};

export type CalcEstimateResult = {
  qty_units: number;
  packaging_sku_id: string;
  labor_codes: string[];
  margin_pct: number;
  discount_pct: number;
  discount_amount: number;
  packaging_total: number;
  labor_total: number;
  total_cost: number;
  list_total: number;
  final_total: number;
};

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function finiteOr(n: unknown, fallback: number): number {
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function loadPricingDefaults(): Promise<PricingDefaults> {
  const supabase = createAdminClient();

  const withJson = await supabase.from("app_settings").select("key, value_json").eq("key", SETTINGS_KEY).maybeSingle();
  if (!withJson.error) {
    const obj = (withJson.data?.value_json ?? {}) as Record<string, unknown>;
    return {
      default_margin_pct: finiteOr(obj.default_margin_pct, DEFAULTS.default_margin_pct),
      touchpoint_cost: finiteOr(obj.touchpoint_cost, DEFAULTS.touchpoint_cost),
      ca_symbol_sticker_cost: finiteOr(obj.ca_symbol_sticker_cost, DEFAULTS.ca_symbol_sticker_cost),
      max_discount_pct: finiteOr(obj.max_discount_pct, DEFAULTS.max_discount_pct),
    };
  }

  const withValue = await supabase.from("app_settings").select("key, value").eq("key", SETTINGS_KEY).maybeSingle();
  if (!withValue.error) {
    const obj = (withValue.data?.value ?? {}) as Record<string, unknown>;
    return {
      default_margin_pct: finiteOr(obj.default_margin_pct, DEFAULTS.default_margin_pct),
      touchpoint_cost: finiteOr(obj.touchpoint_cost, DEFAULTS.touchpoint_cost),
      ca_symbol_sticker_cost: finiteOr(obj.ca_symbol_sticker_cost, DEFAULTS.ca_symbol_sticker_cost),
      max_discount_pct: finiteOr(obj.max_discount_pct, DEFAULTS.max_discount_pct),
    };
  }

  return DEFAULTS;
}

export async function calcEstimate(input: CalcEstimateInput): Promise<CalcEstimateResult> {
  const qty_units = Number(input.qty_units || 0);
  if (!Number.isFinite(qty_units) || qty_units <= 0) {
    throw new Error("qty_units must be > 0");
  }

  const packaging_sku_id = String(input.packaging_sku_id || "").trim();
  if (!packaging_sku_id) {
    throw new Error("packaging_sku_id required");
  }

  const labor_codes = (Array.isArray(input.labor_codes) ? input.labor_codes : [input.labor_codes])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (labor_codes.length === 0) {
    throw new Error("At least one labor code is required");
  }

  const supabase = createAdminClient();

  const [{ data: packagingRow, error: packagingErr }, { data: laborRows, error: laborErr }, defaults] = await Promise.all([
    supabase.from("packaging_skus").select("id, unit_cost").eq("id", packaging_sku_id).single(),
    supabase.from("labor_profiles").select("code, base_cost").in("code", labor_codes),
    loadPricingDefaults(),
  ]);

  if (packagingErr || !packagingRow) {
    throw new Error(packagingErr?.message || "Packaging SKU not found");
  }
  if (laborErr) {
    throw new Error(laborErr.message);
  }

  const packagingRecord = packagingRow as Record<string, unknown>;
  const packagingUnitCost = finiteOr(packagingRecord.unit_cost, 0);
  const laborByCode = new Map<string, number>();
  for (const row of (laborRows || []) as Record<string, unknown>[]) {
    laborByCode.set(String(row.code || ""), finiteOr(row.base_cost, 0));
  }

  const missingLaborCodes = labor_codes.filter((code) => !laborByCode.has(code));
  if (missingLaborCodes.length > 0) {
    throw new Error(`Missing labor_profiles codes: ${missingLaborCodes.join(", ")}`);
  }

  const laborUnitCost = labor_codes.reduce((sum, code) => sum + finiteOr(laborByCode.get(code), 0), 0);

  const margin_pct = input.margin_pct == null ? defaults.default_margin_pct : finiteOr(input.margin_pct, defaults.default_margin_pct);
  const safeMarginPct = Math.max(0, margin_pct);

  const packaging_total = money(packagingUnitCost * qty_units);
  const labor_total = money(laborUnitCost * qty_units);
  const total_cost = money(packaging_total + labor_total);
  const list_total = money(total_cost * (1 + safeMarginPct / 100));

  const requestedDiscountPct = finiteOr(input.discount_pct, 0);
  const cappedDiscountPct = clamp(requestedDiscountPct, 0, Math.max(0, defaults.max_discount_pct));

  const requestedDiscountAmount = finiteOr(input.discount_amount, 0);
  const discount_amount =
    requestedDiscountAmount > 0
      ? clamp(requestedDiscountAmount, 0, list_total)
      : money(list_total * (cappedDiscountPct / 100));

  const discount_pct = list_total > 0 ? money((discount_amount / list_total) * 100) : 0;
  const final_total = money(Math.max(0, list_total - discount_amount));

  return {
    qty_units,
    packaging_sku_id,
    labor_codes,
    margin_pct: money(safeMarginPct),
    discount_pct,
    discount_amount: money(discount_amount),
    packaging_total,
    labor_total,
    total_cost,
    list_total,
    final_total,
  };
}
