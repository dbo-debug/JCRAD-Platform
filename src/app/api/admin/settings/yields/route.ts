import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type YieldResponse = {
  flower_yield_pct: number;
  concentrate_yield_pct: number;
  preroll_yield_pct: number;
  vape_fill_yield_pct: number;
};
type AppSettingRow = { key: string | null; value_json: unknown };

const DEFAULTS_DECIMAL = {
  flower_yield_pct: 0.92,
  concentrate_yield_pct: 0.95,
  preroll_yield_pct: 0.92,
  vape_fill_yield_pct: 0.97,
} as const;

const YIELD_KEYS = Object.keys(DEFAULTS_DECIMAL) as Array<keyof typeof DEFAULTS_DECIMAL>;

function decimalFromValueJson(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const n = Number(obj.pct);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

function toPercent(decimal: number): number {
  return Math.round(decimal * 10000) / 100;
}

function toDecimal(percent: number): number {
  return Math.round((percent / 100) * 10000) / 10000;
}

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", YIELD_KEYS as string[]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, unknown>();
  for (const row of (data ?? []) as AppSettingRow[]) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  const response: YieldResponse = {
    flower_yield_pct: toPercent(decimalFromValueJson(byKey.get("flower_yield_pct"), DEFAULTS_DECIMAL.flower_yield_pct)),
    concentrate_yield_pct: toPercent(
      decimalFromValueJson(byKey.get("concentrate_yield_pct"), DEFAULTS_DECIMAL.concentrate_yield_pct)
    ),
    preroll_yield_pct: toPercent(decimalFromValueJson(byKey.get("preroll_yield_pct"), DEFAULTS_DECIMAL.preroll_yield_pct)),
    vape_fill_yield_pct: toPercent(
      decimalFromValueJson(byKey.get("vape_fill_yield_pct"), DEFAULTS_DECIMAL.vape_fill_yield_pct)
    ),
  };

  return NextResponse.json(response);
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const flower = Number(body?.flower_yield_pct);
  const concentrate = Number(body?.concentrate_yield_pct);
  const preroll = Number(body?.preroll_yield_pct);
  const vape = Number(body?.vape_fill_yield_pct);

  const fields = [
    { key: "flower_yield_pct", value: flower },
    { key: "concentrate_yield_pct", value: concentrate },
    { key: "preroll_yield_pct", value: preroll },
    { key: "vape_fill_yield_pct", value: vape },
  ] as const;

  for (const f of fields) {
    if (!Number.isFinite(f.value) || f.value < 0 || f.value > 100) {
      return NextResponse.json({ error: `${f.key} must be a number between 0 and 100` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const payload = fields.map((f) => ({
    key: f.key,
    value_json: { pct: toDecimal(f.value) },
    updated_at: now,
  }));

  const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const response: YieldResponse = {
    flower_yield_pct: flower,
    concentrate_yield_pct: concentrate,
    preroll_yield_pct: preroll,
    vape_fill_yield_pct: vape,
  };
  return NextResponse.json(response);
}
