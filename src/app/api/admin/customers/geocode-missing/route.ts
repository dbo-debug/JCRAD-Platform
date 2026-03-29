import { NextResponse } from "next/server";
import { geocodeCustomerRow } from "@/lib/customerGeocode";
import { classifyGeocodeFailure, hasSufficientAddress, type GeocodeFailureReason, type GeocodeStatus } from "@/lib/geocode";
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

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
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
  const requestedCustomerIds = normalizeIds(body.customer_ids).slice(0, limit);
  const mode = requestedCustomerIds.length > 0 ? "visible_results" : body.mode === "retry_failed" ? "retry_failed" : "default";

  const admin = createAdminClient();
  let query = admin
    .from("customers")
    .select("id, address_1, city, state, postal_code, latitude, longitude, geocode_status, last_geocoded_at, updated_at")
    .or("latitude.is.null,longitude.is.null")
    .limit(requestedCustomerIds.length > 0 ? requestedCustomerIds.length : limit * 3);

  if (mode === "visible_results") {
    query = query.in("id", requestedCustomerIds);
  } else if (mode === "retry_failed") {
    query = query.eq("geocode_status", "failed");
  } else {
    query = query.or("geocode_status.is.null,geocode_status.eq.missing_address");
  }

  if (mode !== "visible_results") {
    query = query.order("last_geocoded_at", { ascending: true, nullsFirst: true }).order("updated_at", { ascending: true });
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
  let needsReview = 0;
  const statusCounts: Record<GeocodeStatus, number> = {
    geocoded: 0,
    missing_address: 0,
    failed: 0,
    needs_review: 0,
  };
  const reasonCounts: Record<GeocodeFailureReason | "update_failed", number> = {
    unsupported_provider: 0,
    transport_failed: 0,
    no_match: 0,
    multiple_matches: 0,
    invalid_coordinates: 0,
    unknown: 0,
    update_failed: 0,
  };
  const sampleErrors: string[] = [];

  function pushSampleError(message: string) {
    const normalized = message.trim();
    if (!normalized || sampleErrors.includes(normalized) || sampleErrors.length >= 5) return;
    sampleErrors.push(normalized);
  }

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
      statusCounts.failed += 1;
      reasonCounts.update_failed += 1;
      pushSampleError(`Customer update failed: ${updateError.message}`);
      continue;
    }

    statusCounts[geocode.status] += 1;

    if (geocode.status === "geocoded") {
      geocoded += 1;
    } else if (geocode.status === "missing_address") {
      missingAddress += 1;
    } else if (geocode.status === "needs_review") {
      needsReview += 1;
      const reason = classifyGeocodeFailure(geocode);
      if (reason) reasonCounts[reason] += 1;
      pushSampleError(geocode.errorMessage || "Geocode needs review");
    } else {
      failed += 1;
      const reason = classifyGeocodeFailure(geocode);
      if (reason) reasonCounts[reason] += 1;
      pushSampleError(geocode.errorMessage || "Geocode failed");
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    attempted,
    geocoded,
    failed,
    needs_review: needsReview,
    missing_address: missingAddress,
    status_counts: statusCounts,
    reason_counts: reasonCounts,
    sample_errors: sampleErrors,
  });
}
