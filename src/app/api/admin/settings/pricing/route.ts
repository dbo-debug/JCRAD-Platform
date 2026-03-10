import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type PricingResponse = {
  default_margin_pct: number;
  target_markup_pct: number;
  coa_base_cost_usd: number;
  extra_touch_point_cost_usd: number;
};
type AppSettingRow = { key: string | null; value_json: unknown };

const DEFAULTS = {
  default_margin_pct: 20,
  target_markup_pct: 20,
  coa_base_cost_usd: 450,
  extra_touch_point_cost_usd: 0.1,
} as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readPctPercent(valueJson: unknown, fallbackPercent: number, maxDecimal = 1): number {
  const raw = Number(asObject(valueJson).pct);
  if (!Number.isFinite(raw) || raw < 0 || raw > maxDecimal) return fallbackPercent;
  return Math.round(raw * 10000) / 100;
}

function readUsd(valueJson: unknown, fallbackUsd: number): number {
  const raw = Number(asObject(valueJson).usd);
  if (!Number.isFinite(raw) || raw < 0) return fallbackUsd;
  return raw;
}

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", ["default_margin_pct", "target_markup_pct", "coa_base_cost", "extra_touch_point_cost"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, unknown>();
  for (const row of (data ?? []) as AppSettingRow[]) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  const response: PricingResponse = {
    default_margin_pct: readPctPercent(byKey.get("default_margin_pct"), DEFAULTS.default_margin_pct),
    target_markup_pct: readPctPercent(
      byKey.get("target_markup_pct"),
      DEFAULTS.target_markup_pct,
      5
    ),
    coa_base_cost_usd: readUsd(byKey.get("coa_base_cost"), DEFAULTS.coa_base_cost_usd),
    extra_touch_point_cost_usd: readUsd(
      byKey.get("extra_touch_point_cost"),
      DEFAULTS.extra_touch_point_cost_usd
    ),
  };

  return NextResponse.json(response);
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const defaultMarginPct = Number(body?.default_margin_pct);
  const targetMarkupPct = Number(body?.target_markup_pct);
  const coaBaseCostUsd = Number(body?.coa_base_cost_usd);
  const extraTouchPointCostUsd = Number(body?.extra_touch_point_cost_usd);

  if (!Number.isFinite(defaultMarginPct) || defaultMarginPct < 0 || defaultMarginPct > 100) {
    return NextResponse.json({ error: "default_margin_pct must be a number between 0 and 100" }, { status: 400 });
  }
  if (!Number.isFinite(targetMarkupPct) || targetMarkupPct < 0 || targetMarkupPct > 500) {
    return NextResponse.json({ error: "target_markup_pct must be a number between 0 and 500" }, { status: 400 });
  }
  if (!Number.isFinite(coaBaseCostUsd) || coaBaseCostUsd < 0) {
    return NextResponse.json({ error: "coa_base_cost_usd must be a number >= 0" }, { status: 400 });
  }
  if (!Number.isFinite(extraTouchPointCostUsd) || extraTouchPointCostUsd < 0) {
    return NextResponse.json({ error: "extra_touch_point_cost_usd must be a number >= 0" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = [
    {
      key: "default_margin_pct",
      value_json: { pct: Math.round((defaultMarginPct / 100) * 10000) / 10000 },
      updated_at: now,
    },
    {
      key: "target_markup_pct",
      value_json: { pct: Math.round((targetMarkupPct / 100) * 10000) / 10000 },
      updated_at: now,
    },
    {
      key: "coa_base_cost",
      value_json: { usd: coaBaseCostUsd },
      updated_at: now,
    },
    {
      key: "extra_touch_point_cost",
      value_json: { usd: extraTouchPointCostUsd },
      updated_at: now,
    },
  ];

  const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const response: PricingResponse = {
    default_margin_pct: defaultMarginPct,
    target_markup_pct: targetMarkupPct,
    coa_base_cost_usd: coaBaseCostUsd,
    extra_touch_point_cost_usd: extraTouchPointCostUsd,
  };
  return NextResponse.json(response);
}
