import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { loadRouteStopQueueRows } from "@/lib/routeStopQueue";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizeCustomerIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeQueueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

export async function GET() {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const queue = await loadRouteStopQueueRows(staff.userId);
  return NextResponse.json({ queue });
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const customerIds = normalizeCustomerIds(body.customer_ids);
  if (customerIds.length === 0) {
    return NextResponse.json({ error: "Provide at least one customer_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("route_stop_queue").upsert(
    customerIds.map((customerId) => ({
      customer_id: customerId,
      added_by_user_id: staff.userId,
    })),
    {
      onConflict: "customer_id,added_by_user_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const queue = await loadRouteStopQueueRows(staff.userId);
  return NextResponse.json({ ok: true, queue });
}

export async function DELETE(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const clearAll = body.clear_all === true;
  const customerIds = normalizeCustomerIds(body.customer_ids);
  const queueIds = normalizeQueueIds(body.queue_ids);

  const supabase = createAdminClient();
  let query = supabase.from("route_stop_queue").delete().eq("added_by_user_id", staff.userId);

  if (!clearAll) {
    if (queueIds.length > 0) {
      query = query.in("id", queueIds);
    } else if (customerIds.length > 0) {
      query = query.in("customer_id", customerIds);
    } else {
      return NextResponse.json({ error: "Provide queue_ids, customer_ids, or clear_all" }, { status: 400 });
    }
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const queue = await loadRouteStopQueueRows(staff.userId);
  return NextResponse.json({ ok: true, queue });
}
