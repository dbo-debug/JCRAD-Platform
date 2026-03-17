import { NextResponse } from "next/server";
import { buildPlannedRoute } from "@/lib/routePlanning";
import { getStaffContext } from "@/lib/getStaffContext";

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
  const stops = (Array.isArray(body.stops) ? body.stops : []) as Array<Record<string, unknown>>;

  if (!routeDate || !plannedStartTime) {
    return NextResponse.json({ error: "route_date and planned_start_time are required" }, { status: 400 });
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
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));

  const plan = await buildPlannedRoute({
    stops: normalizedStops,
    routeDate,
    startTime: plannedStartTime,
  });

  return NextResponse.json({ ok: true, plan });
}
