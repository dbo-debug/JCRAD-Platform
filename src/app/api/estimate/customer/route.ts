import { NextResponse } from "next/server";
import { loadEstimateAttachedCustomer } from "@/lib/estimate/customer";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const estimateId = String(body?.estimate_id || "").trim();
  const customerId = String(body?.customer_id || "").trim();

  if (!estimateId) {
    return NextResponse.json({ error: "estimate_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const attachedCustomer = customerId ? await loadEstimateAttachedCustomer(supabase, customerId) : null;

  if (customerId && !attachedCustomer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const payload = attachedCustomer
    ? {
      customer_account_id: attachedCustomer.id,
      customer_name: attachedCustomer.contact_name || attachedCustomer.company_name || "",
      customer_email: attachedCustomer.email || "",
      customer_phone: attachedCustomer.phone || "",
    }
    : {
      customer_account_id: null,
      customer_name: null,
      customer_email: null,
      customer_phone: null,
    };

  const { data, error } = await supabase
    .from("estimates")
    .update(payload)
    .eq("id", estimateId)
    .select("id, status, subtotal, adjustments, total, customer_account_id, customer_name, customer_email, customer_phone, notes, packaging_review_pending, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Estimate not found" }, { status: 404 });
  }

  return NextResponse.json({
    estimate: {
      ...data,
      attached_customer: attachedCustomer,
    },
  });
}
