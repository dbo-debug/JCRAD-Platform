import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function isAllowedStatus(value: string | null): boolean {
  if (!value) return true;
  return new Set(["active", "prospect", "lead", "on_hold", "inactive"]).has(value);
}

function isAllowedStage(value: string | null): boolean {
  if (!value) return true;
  return new Set(["new", "qualified", "active", "paused", "closed"]).has(value);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const companyName = asText(body.company_name);
  const primaryContactEmail = asText(body.primary_contact_email);
  const status = asText(body.status);
  const stage = asText(body.stage);
  const assignedSalesUserId = asText(body.assigned_sales_user_id);

  if (!isAllowedStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!isAllowedStage(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {};

  if ("status" in body) payload.status = status;
  if ("stage" in body) payload.stage = stage;
  if ("primary_contact_email" in body) payload.primary_contact_email = primaryContactEmail;

  if (staff.role === "admin") {
    if ("company_name" in body) payload.company_name = companyName;
    if ("assigned_sales_user_id" in body) payload.assigned_sales_user_id = assignedSalesUserId;
  } else {
    if ("company_name" in body || "assigned_sales_user_id" in body) {
      return NextResponse.json({ error: "Only admins can update company or assignment fields" }, { status: 403 });
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
