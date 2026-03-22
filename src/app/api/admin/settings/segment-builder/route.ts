import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SEGMENT_BUILDER_SETTINGS_FIELDS,
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
    .in("key", SEGMENT_BUILDER_SETTINGS_FIELDS.map((field) => field.key));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(valuesFromRows(SEGMENT_BUILDER_SETTINGS_FIELDS, (data || []) as AppSettingRow[]));
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  for (const field of SEGMENT_BUILDER_SETTINGS_FIELDS) {
    const validationError = validateSettingValue(field, body?.[field.key]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const payload = SEGMENT_BUILDER_SETTINGS_FIELDS.map((field) => ({
    key: field.key,
    value_json: serializeSettingValue(field, body?.[field.key]),
    updated_at: now,
  }));

  const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    Object.fromEntries(SEGMENT_BUILDER_SETTINGS_FIELDS.map((field) => [field.key, body?.[field.key] ?? field.defaultValue])),
  );
}
