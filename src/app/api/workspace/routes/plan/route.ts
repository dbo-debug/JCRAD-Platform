import { NextResponse } from "next/server";
import { buildPlannedRoute } from "@/lib/routePlanning";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRouteEligibleCustomer } from "@/lib/routeEligibility";
import { NAMELESS_WORKSPACE_KEY } from "@/lib/namelessWorkspace";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const routeDate = asText(body.route_date);
  const plannedStartTime = asText(body.planned_start_time);
  const requiredReturnBy = asText(body.required_return_by);
  const stopDurationMinutes = asNumber(body.stop_duration_minutes);
  const lunchMinutes = asNumber(body.lunch_minutes);
  const stops = (Array.isArray(body.stops) ? body.stops : []) as Array<Record<string, unknown>>;

  if (!routeDate) {
    return NextResponse.json({ error: "route_date is required" }, { status: 400 });
  }

  const normalizedStops = stops
    .map((stop) => {
      const customerId = asText(stop.customer_id);
      const customerName = asText(stop.customer_name);
      const latitude = asNumber(stop.latitude);
      const longitude = asNumber(stop.longitude);
      if (!customerId || !customerName || latitude === null || longitude === null) return null;
      return {
        customerId,
        customerName,
        territoryCode: asText(stop.territory_code),
        routeDay: asText(stop.route_day),
        latitude,
        longitude,
        queueId: asText(stop.queue_id),
        locked: stop.locked === true,
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));

  const customerIds = Array.from(new Set(normalizedStops.map((stop) => stop.customerId)));
  if (customerIds.length === 0) {
    const plan = await buildPlannedRoute({
      stops: [],
      routeDate,
      startTime: plannedStartTime,
      requiredReturnByTime: requiredReturnBy,
      visitMinutes: stopDurationMinutes,
      lunchMinutes,
    });
    return NextResponse.json({ ok: true, plan });
  }

  const supabase = createAdminClient();
  const { data: customerRows, error: customerError } = await supabase
    .from("customers")
    .select("id, workspace_key, address_1, city, state, postal_code, latitude, longitude, geocode_status")
    .in("id", customerIds);

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }

  const eligibleCustomerIds = new Set(
    ((customerRows || []) as Array<Record<string, unknown>>)
      .filter((row) => {
        const workspaceKey = String(row.workspace_key || "").trim().toLowerCase();
        if (workspaceKey && workspaceKey !== NAMELESS_WORKSPACE_KEY) return false;
        return isRouteEligibleCustomer({
          address1: asText(row.address_1),
          city: asText(row.city),
          state: asText(row.state),
          postalCode: asText(row.postal_code),
          latitude: asNumber(row.latitude),
          longitude: asNumber(row.longitude),
          geocodeStatus: asText(row.geocode_status) as "geocoded" | "missing_address" | "failed" | "needs_review" | null,
        });
      })
      .map((row) => asText(row.id))
      .filter((value): value is string => Boolean(value))
  );

  const eligibleStops = normalizedStops.filter((stop) => eligibleCustomerIds.has(stop.customerId));

  const plan = await buildPlannedRoute({
    stops: eligibleStops,
    routeDate,
    startTime: plannedStartTime,
    requiredReturnByTime: requiredReturnBy,
    visitMinutes: stopDurationMinutes,
    lunchMinutes,
  });

  return NextResponse.json({ ok: true, plan });
}
