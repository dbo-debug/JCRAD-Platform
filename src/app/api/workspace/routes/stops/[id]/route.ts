import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import { isNamelessCustomer } from "@/lib/namelessCustomerAccess";
import { NAMELESS_WORKSPACE_KEY } from "@/lib/namelessWorkspace";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const stopStatus = asText(body.stop_status);
  const notes = asText(body.notes);
  const fieldStatus = asText(body.field_status);

  if (stopStatus && !["planned", "ready", "visited", "skipped"].includes(stopStatus)) {
    return NextResponse.json({ error: "Invalid stop_status" }, { status: 400 });
  }
  if (fieldStatus && !["planned", "visited", "skipped", "closed", "rescheduled"].includes(fieldStatus)) {
    return NextResponse.json({ error: "Invalid field_status" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {};
  if ("stop_status" in body) payload.stop_status = stopStatus;
  if ("notes" in body) payload.notes = notes;
  payload.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data: stop, error: stopError } = await supabase
    .from("route_stops")
    .select("id, customer_id, route_id")
    .eq("id", id)
    .maybeSingle();
  if (stopError) return NextResponse.json({ error: stopError.message }, { status: 500 });
  if (!stop || !(await isNamelessCustomer(String(stop.customer_id || "")))) {
    return NextResponse.json({ error: "Route stop not found" }, { status: 404 });
  }
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("assigned_user_id, created_by")
    .eq("id", stop.route_id)
    .maybeSingle();
  if (routeError) return NextResponse.json({ error: routeError.message }, { status: 500 });
  if (
    staff.role === "sales" &&
    String(route?.assigned_user_id || route?.created_by || "") !== staff.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!stopStatus && fieldStatus) {
    payload.stop_status =
      fieldStatus === "visited" ? "visited" : fieldStatus === "planned" ? "planned" : "skipped";
  }
  const { error } = await supabase.from("route_stops").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (fieldStatus) {
    const { error: outcomeError } = await supabase.from("route_stop_sales_outcomes").upsert(
      {
        workspace_key: NAMELESS_WORKSPACE_KEY,
        route_stop_id: id,
        customer_id: stop.customer_id,
        field_status: fieldStatus,
        buyer_present: body.buyer_present === true,
        buyer_reached: body.buyer_reached === true,
        meeting_scheduled: body.meeting_scheduled === true,
        samples_delivered: body.samples_delivered === true,
        sales_materials_delivered: body.sales_materials_delivered === true,
        follow_up_created: body.follow_up_created === true,
        opportunity_advanced: body.opportunity_advanced === true,
        order_generated: body.order_generated === true,
        visit_notes: notes,
        rescheduled_for: asText(body.rescheduled_for),
        created_by: staff.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "route_stop_id" }
    );
    if (outcomeError) return NextResponse.json({ error: outcomeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
