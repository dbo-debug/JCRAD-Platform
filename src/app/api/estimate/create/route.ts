import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const userClient = await createClient();
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user ?? null;

  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.log("[estimate/create] request", {
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

  const customer_name = body?.customer_name
    ? String(body.customer_name)
    : String(user?.user_metadata?.full_name || "");
  const customer_email = body?.customer_email
    ? String(body.customer_email).trim().toLowerCase()
    : String(user?.email || "").trim().toLowerCase();
  const customer_phone = body?.customer_phone ? String(body.customer_phone) : "";
  const notes = body?.notes ? String(body.notes) : "";

  const { data, error } = await supabase
    .from("estimates")
    .insert({
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
    .select("id, status, subtotal, adjustments, total, customer_name, customer_email, customer_phone, notes, packaging_review_pending, created_at")
    .single();

  if (error) return respond({ error: error.message }, { status: 500 });
  return respond({ estimate: data });
}
