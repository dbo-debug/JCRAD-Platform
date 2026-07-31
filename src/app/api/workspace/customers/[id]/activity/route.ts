import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import { isNamelessCustomer } from "@/lib/namelessCustomerAccess";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!(await isNamelessCustomer(id))) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const activityType = asText(body.activity_type) || "activity";
  const summary = asText(body.summary);
  const details = body.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : {};

  if (!summary) {
    return NextResponse.json({ error: "summary required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: activityType,
    summary,
    details,
    actor_user_id: staff.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
