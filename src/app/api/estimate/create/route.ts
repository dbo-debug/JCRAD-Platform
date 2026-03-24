import { NextResponse } from "next/server";
import { logPlatformEvent } from "@/lib/events/logPlatformEvent";
import { loadEstimateAttachedCustomer, resolveEstimateCustomerForAuthenticatedUser } from "@/lib/estimate/customer";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const userClient = await createClient();
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user ?? null;

  const supabase = createAdminClient();
  const requesterProfileRes = user
    ? await supabase.from("profiles").select("id, company_name").eq("id", user.id).maybeSingle()
    : { data: null, error: null };
  if (requesterProfileRes.error) {
    return NextResponse.json({ error: requesterProfileRes.error.message }, { status: 500 });
  }
  const requesterProfile = (requesterProfileRes.data || null) as { company_name?: string | null } | null;
  const body = await req.json().catch(() => ({}));
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.log("[estimate/create] request", {
      customer_account_id_present: Boolean(body?.customer_account_id),
      customer_name_present: Boolean(body?.customer_name),
      customer_email_present: Boolean(body?.customer_email),
      customer_phone_present: Boolean(body?.customer_phone),
      notes_present: Boolean(body?.notes),
    });
  }
  const respond = (payload: unknown, init?: ResponseInit) => {
    if (isDev) {
      console.log("[estimate/create] response", { status: init?.status || 200 });
    }
    return NextResponse.json(payload, init);
  };

  const staff = await getStaffContext();
  const requestedCustomerAccountId = staff ? String(body?.customer_account_id || "").trim() : "";
  const resolvedCustomer = !staff && user
    ? await resolveEstimateCustomerForAuthenticatedUser(supabase, {
      userId: user.id,
      userEmail: user.email || null,
      companyName: String(requesterProfile?.company_name || ""),
    })
    : null;
  const attachedCustomerId = requestedCustomerAccountId || resolvedCustomer?.customerId || "";
  const attachedCustomer = attachedCustomerId ? await loadEstimateAttachedCustomer(supabase, attachedCustomerId) : null;
  if (requestedCustomerAccountId && !attachedCustomer) {
    return respond({ error: "Customer not found" }, { status: 404 });
  }
  const customer_name = attachedCustomer
    ? attachedCustomer.contact_name || attachedCustomer.company_name || ""
    : staff && body?.customer_name
      ? String(body.customer_name)
      : String(requesterProfile?.company_name || user?.email || "");
  const customer_email = attachedCustomer
    ? String(attachedCustomer.email || "").trim().toLowerCase()
    : staff && body?.customer_email
      ? String(body.customer_email).trim().toLowerCase()
      : String(user?.email || "").trim().toLowerCase();
  const customer_phone = attachedCustomer ? String(attachedCustomer.phone || "") : body?.customer_phone ? String(body.customer_phone) : "";
  const notes = body?.notes ? String(body.notes) : "";

  const { data, error } = await supabase
    .from("estimates")
    .insert({
      customer_account_id: attachedCustomer?.id || null,
      customer_name,
      customer_email,
      customer_phone,
      notes,
      status: "draft",
      subtotal: 0,
      adjustments: 0,
      total: 0,
      packaging_review_pending: false,
    })
    .select("id, status, subtotal, adjustments, total, customer_account_id, customer_name, customer_email, customer_phone, notes, packaging_review_pending, created_at")
    .single();

  if (error) return respond({ error: error.message }, { status: 500 });
  await logPlatformEvent({
    eventType: "estimate_created",
    userId: user?.id || null,
    userEmail: customer_email || user?.email || null,
    metadata: {
      estimate_id: (data as { id?: string | null } | null)?.id || null,
    },
  });
  return respond({
    estimate: {
      ...data,
      attached_customer: attachedCustomer,
    },
  });
}
