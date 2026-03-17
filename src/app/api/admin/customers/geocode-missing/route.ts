import { NextResponse } from "next/server";
import { geocodeCustomerRow } from "@/lib/customerGeocode";
import { hasSufficientAddress } from "@/lib/geocode";
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
  const mode = body.mode === "retry_failed" ? "retry_failed" : "default";

  const admin = createAdminClient();
  let query = admin
    .from("customers")
    .select("id, address_1, city, state, postal_code, latitude, longitude, geocode_status, last_geocoded_at, updated_at")
    .or("latitude.is.null,longitude.is.null")
    .order("last_geocoded_at", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: true })
    .limit(limit * 3);

  if (mode === "retry_failed") {
    query = query.eq("geocode_status", "failed");
  } else {
    query = query.or("geocode_status.is.null,geocode_status.eq.missing_address");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((data || []) as Array<Record<string, unknown>>)
    .filter((row) =>
      hasSufficientAddress({
        address1: asText(row.address_1),
        city: asText(row.city),
        state: asText(row.state),
        postalCode: asText(row.postal_code),
      })
    )
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
    mode,
    attempted,
    geocoded,
    failed,
    missing_address: missingAddress,
  });
}
