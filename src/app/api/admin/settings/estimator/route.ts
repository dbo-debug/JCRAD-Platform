import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ESTIMATOR_SETTINGS_FIELDS,
  serializeSettingValue,
  validateSettingValue,
  valuesFromRows,
  type AppSettingRow,
} from "@/lib/appSettingsRegistry";

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in(
      "key",
      Array.from(new Set(ESTIMATOR_SETTINGS_FIELDS.flatMap((field) => [field.key, ...(field.aliases || [])]))),
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(valuesFromRows(ESTIMATOR_SETTINGS_FIELDS, (data || []) as AppSettingRow[]));
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  for (const field of ESTIMATOR_SETTINGS_FIELDS) {
    const validationError = validateSettingValue(field, body?.[field.key]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const payload = ESTIMATOR_SETTINGS_FIELDS.map((field) => ({
    key: field.key,
    value_json: serializeSettingValue(field, body?.[field.key]),
    updated_at: now,
  }));

  const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    Object.fromEntries(ESTIMATOR_SETTINGS_FIELDS.map((field) => [field.key, body?.[field.key] ?? field.defaultValue])),
  );
}
