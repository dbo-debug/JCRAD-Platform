import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

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
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = asText(body.name);
  const territoryCode = asText(body.territory_code);
  const originName = asText(body.origin_name);
  const originAddress = asText(body.origin_address);
  const assignedUserId = asText(body.assigned_user_id);
  const routeDate = asText(body.route_date);
  const plannedStartTime = asText(body.planned_start_time);
  const status = asText(body.status) || "assigned";
  const notes = asText(body.notes);
  const maxStops = asNullableNumber(body.max_stops);
  const estimatedDriveMinutes = asNullableNumber(body.estimated_drive_minutes) || 0;
  const estimatedVisitMinutes = asNullableNumber(body.estimated_visit_minutes) || 0;
  const estimatedTotalMinutes = asNullableNumber(body.estimated_total_minutes) || 0;
  const originLatitude = asNullableNumber(body.origin_latitude);
  const originLongitude = asNullableNumber(body.origin_longitude);
  const queueIds = Array.isArray(body.queue_ids)
    ? Array.from(new Set(body.queue_ids.map((value: unknown) => asText(value)).filter((value: string | null): value is string => Boolean(value))))
    : [];
  const stops = (Array.isArray(body.stops) ? body.stops : []) as Array<Record<string, unknown>>;

  if (!name || !originName || !originAddress || !assignedUserId || !routeDate || !plannedStartTime) {
    return NextResponse.json({ error: "Missing required route fields" }, { status: 400 });
  }
  if (!["draft", "assigned", "in_progress", "completed", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid route status" }, { status: 400 });
  }
  if (staff.role === "sales" && assignedUserId !== staff.userId) {
    return NextResponse.json({ error: "Sales staff can only assign routes to themselves" }, { status: 403 });
  }
  if (!Number.isInteger(maxStops) || (maxStops || 0) <= 0 || (maxStops || 0) > 40) {
    return NextResponse.json({ error: "max_stops must be an integer between 1 and 40" }, { status: 400 });
  }
  if (stops.length === 0) {
    return NextResponse.json({ error: "Add at least one stop before saving a route" }, { status: 400 });
  }

  const normalizedStops = stops
    .map((stop: Record<string, unknown>, index: number) => {
      const customerId = asText(stop?.customer_id);
      if (!customerId) return null;
      return {
        customer_id: customerId,
        stop_order: index + 1,
        estimated_drive_minutes_from_previous: asNullableNumber(stop?.estimated_drive_minutes_from_previous) || 0,
        estimated_visit_minutes: asNullableNumber(stop?.estimated_visit_minutes) || 15,
        locked: stop?.locked === true,
        stop_status: asText(stop?.stop_status) || "planned",
        notes: asText(stop?.notes),
      };
    })
    .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));

  if (normalizedStops.length === 0) {
    return NextResponse.json({ error: "Add at least one valid stop before saving a route" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .insert({
      name,
      territory_code: territoryCode,
      origin_name: originName,
      origin_address: originAddress,
      origin_latitude: originLatitude,
      origin_longitude: originLongitude,
      assigned_user_id: assignedUserId,
      route_date: routeDate,
      status,
      planned_start_time: plannedStartTime,
      max_stops: maxStops,
      estimated_drive_minutes: estimatedDriveMinutes,
      estimated_visit_minutes: estimatedVisitMinutes,
      estimated_total_minutes: estimatedTotalMinutes,
      notes,
      created_by: staff.userId,
    })
    .select("id")
    .single();

  if (routeError || !route?.id) {
    return NextResponse.json({ error: routeError?.message || "Failed to create route" }, { status: 500 });
  }

  const { error: stopsError } = await supabase.from("route_stops").insert(
    normalizedStops.map((stop: (typeof normalizedStops)[number]) => ({
      route_id: route.id,
      ...stop,
    }))
  );

  if (stopsError) {
    await supabase.from("routes").delete().eq("id", route.id);
    return NextResponse.json({ error: stopsError.message }, { status: 500 });
  }

  if (queueIds.length > 0) {
    const { error: queueError } = await supabase.from("route_stop_queue").delete().eq("added_by_user_id", staff.userId).in("id", queueIds);
    if (queueError) {
      await supabase.from("routes").delete().eq("id", route.id);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, route_id: route.id });
}
