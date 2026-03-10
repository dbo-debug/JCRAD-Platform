import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type YieldSettings = {
  flower_yield_pct: number;
  concentrate_yield_pct: number;
  preroll_yield_pct: number;
  vape_fill_yield_pct: number;
};

const DEFAULTS: YieldSettings = {
  flower_yield_pct: 0.92,
  concentrate_yield_pct: 0.95,
  preroll_yield_pct: 0.92,
  vape_fill_yield_pct: 0.97,
};

function pctValue(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const raw = Number(obj.pct);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

export async function GET() {
  const supabase = createAdminClient();
  const keys = Object.keys(DEFAULTS) as Array<keyof YieldSettings>;

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", keys as string[]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, unknown>();
  for (const row of data ?? []) {
    byKey.set(String((row as any).key || ""), (row as any).value_json);
  }

  const result: YieldSettings = {
    flower_yield_pct: pctValue(byKey.get("flower_yield_pct"), DEFAULTS.flower_yield_pct),
    concentrate_yield_pct: pctValue(byKey.get("concentrate_yield_pct"), DEFAULTS.concentrate_yield_pct),
    preroll_yield_pct: pctValue(byKey.get("preroll_yield_pct"), DEFAULTS.preroll_yield_pct),
    vape_fill_yield_pct: pctValue(byKey.get("vape_fill_yield_pct"), DEFAULTS.vape_fill_yield_pct),
  };

  return NextResponse.json(result);
}

