import { NextResponse } from "next/server";
import { geocodeCustomerRow } from "@/lib/customerGeocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requesterProfile, error: requesterError } = await supabase.from("profiles").select("role").eq("id", authData.user.id).single();
  if (requesterError || requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limitInput = Number(body.limit);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitInput) ? limitInput : 20));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id, address_1, city, state, postal_code, latitude, longitude")
    .or("latitude.is.null,longitude.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit * 3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((data || []) as Array<Record<string, unknown>>)
    .filter((row) => Boolean(asText(row.address_1) || asText(row.city) || asText(row.state) || asText(row.postal_code)))
    .slice(0, limit);

  let attempted = 0;
  let geocoded = 0;
  let failed = 0;
  let missingAddress = 0;

  for (const row of candidates) {
    attempted += 1;
    const geocode = await geocodeCustomerRow({
      address_1: asText(row.address_1),
      city: asText(row.city),
      state: asText(row.state),
      postal_code: asText(row.postal_code),
      latitude: asNullableNumber(row.latitude),
      longitude: asNullableNumber(row.longitude),
    });

    const payload: Record<string, string | number | null> = {
      geocode_status: geocode.status,
      geocoded_address: geocode.normalizedAddress,
      geocode_provider: geocode.provider,
      geocode_source: geocode.provider,
      last_geocoded_at: geocode.status === "missing_address" ? null : new Date().toISOString(),
      geocoded_at: geocode.status === "missing_address" ? null : new Date().toISOString(),
      latitude: geocode.ok ? geocode.latitude : null,
      longitude: geocode.ok ? geocode.longitude : null,
    };

    const { error: updateError } = await admin.from("customers").update(payload).eq("id", String(row.id || ""));
    if (updateError) {
      failed += 1;
      continue;
    }

    if (geocode.status === "geocoded") geocoded += 1;
    else if (geocode.status === "missing_address") missingAddress += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    attempted,
    geocoded,
    failed,
    missing_address: missingAddress,
  });
}
