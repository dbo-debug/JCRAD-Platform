import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const customerIds = Array.from(new Set(asIdArray(body.customer_ids)));
  if (customerIds.length === 0) {
    return NextResponse.json({ error: "customer_ids required" }, { status: 400 });
  }

  const archived = body.archived === true;
  const timestamp = new Date().toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .update({
      archived_at: archived ? timestamp : null,
      updated_at: timestamp,
    })
    .eq("record_kind", "customer")
    .in("id", customerIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updatedCustomerIds = ((data || []) as Array<{ id?: string | null }>).map((row) => String(row.id || "").trim()).filter(Boolean);

  return NextResponse.json({
    ok: true,
    archived,
    selected_count: customerIds.length,
    updated_customer_count: updatedCustomerIds.length,
    customer_ids: updatedCustomerIds,
  });
}
