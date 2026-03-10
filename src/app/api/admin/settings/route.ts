import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminSettingsResponse = {
  default_margin_pct: number;
  max_discount_pct: number;
  extra_touch_point_cost: number;
  ca_symbol_sticker_cost: number;
  coa_base_cost: number;
};
type AppSettingRow = { key: string | null; value_json: unknown };

const SETTINGS_KEYS = {
  default_margin_pct: "default_margin_pct",
  max_discount_pct: "max_discount_pct",
  extra_touch_point_cost: "extra_touch_point_cost",
  ca_symbol_sticker_cost: "ca_symbol_sticker_cost",
  coa_base_cost: "coa_base_cost",
} as const;

const DEFAULTS: AdminSettingsResponse = {
  default_margin_pct: 0.2,
  max_discount_pct: 0.3,
  extra_touch_point_cost: 0.1,
  ca_symbol_sticker_cost: 0.1,
  coa_base_cost: 450,
};

function asNumberOrFallback(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctValue(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  return asNumberOrFallback(obj.pct, fallback);
}

function usdValue(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  return asNumberOrFallback(obj.usd, fallback);
}

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", Object.values(SETTINGS_KEYS));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, unknown>();
  for (const row of (data ?? []) as AppSettingRow[]) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  const result: AdminSettingsResponse = {
    default_margin_pct: pctValue(byKey.get(SETTINGS_KEYS.default_margin_pct), DEFAULTS.default_margin_pct),
    max_discount_pct: pctValue(byKey.get(SETTINGS_KEYS.max_discount_pct), DEFAULTS.max_discount_pct),
    extra_touch_point_cost: usdValue(byKey.get(SETTINGS_KEYS.extra_touch_point_cost), DEFAULTS.extra_touch_point_cost),
    ca_symbol_sticker_cost: usdValue(byKey.get(SETTINGS_KEYS.ca_symbol_sticker_cost), DEFAULTS.ca_symbol_sticker_cost),
    coa_base_cost: usdValue(byKey.get(SETTINGS_KEYS.coa_base_cost), DEFAULTS.coa_base_cost),
  };

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const updates: Array<{ key: string; value_json: Record<string, number>; updated_at: string }> = [];
  const now = new Date().toISOString();

  if (body?.default_margin_pct != null) {
    const value = Number(body.default_margin_pct);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "default_margin_pct must be >= 0" }, { status: 400 });
    }
    updates.push({ key: SETTINGS_KEYS.default_margin_pct, value_json: { pct: value }, updated_at: now });
  }

  if (body?.max_discount_pct != null) {
    const value = Number(body.max_discount_pct);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "max_discount_pct must be >= 0" }, { status: 400 });
    }
    updates.push({ key: SETTINGS_KEYS.max_discount_pct, value_json: { pct: value }, updated_at: now });
  }

  if (body?.extra_touch_point_cost != null) {
    const value = Number(body.extra_touch_point_cost);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "extra_touch_point_cost must be >= 0" }, { status: 400 });
    }
    updates.push({ key: SETTINGS_KEYS.extra_touch_point_cost, value_json: { usd: value }, updated_at: now });
  }

  if (body?.ca_symbol_sticker_cost != null) {
    const value = Number(body.ca_symbol_sticker_cost);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "ca_symbol_sticker_cost must be >= 0" }, { status: 400 });
    }
    updates.push({ key: SETTINGS_KEYS.ca_symbol_sticker_cost, value_json: { usd: value }, updated_at: now });
  }

  if (body?.coa_base_cost != null) {
    const value = Number(body.coa_base_cost);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "coa_base_cost must be >= 0" }, { status: 400 });
    }
    updates.push({ key: SETTINGS_KEYS.coa_base_cost, value_json: { usd: value }, updated_at: now });
  }

  if (updates.length > 0) {
    const { error } = await supabase.from("app_settings").upsert(updates, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", Object.values(SETTINGS_KEYS));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, unknown>();
  for (const row of (data ?? []) as AppSettingRow[]) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  return NextResponse.json({
    default_margin_pct: pctValue(byKey.get(SETTINGS_KEYS.default_margin_pct), DEFAULTS.default_margin_pct),
    max_discount_pct: pctValue(byKey.get(SETTINGS_KEYS.max_discount_pct), DEFAULTS.max_discount_pct),
    extra_touch_point_cost: usdValue(byKey.get(SETTINGS_KEYS.extra_touch_point_cost), DEFAULTS.extra_touch_point_cost),
    ca_symbol_sticker_cost: usdValue(byKey.get(SETTINGS_KEYS.ca_symbol_sticker_cost), DEFAULTS.ca_symbol_sticker_cost),
    coa_base_cost: usdValue(byKey.get(SETTINGS_KEYS.coa_base_cost), DEFAULTS.coa_base_cost),
  } satisfies AdminSettingsResponse);
}
