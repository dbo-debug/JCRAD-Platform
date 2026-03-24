import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const name = asText(body.name);
  const email = asText(body.email);
  const phone = asText(body.phone);
  const title = asText(body.title);

  if (!name && !email && !phone) {
    return NextResponse.json({ error: "Enter at least a contact name, email, or phone" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customer_contacts")
    .insert({
      customer_id: id,
      name,
      email,
      phone,
      title,
      is_primary: false,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: "contact_created",
    summary: `Added contact: ${name || email || phone || "New contact"}`,
    details: {
      contact_id: data?.id || null,
      email,
      phone,
      title,
    },
    actor_user_id: staff.userId,
  });

  return NextResponse.json({ ok: true, id: data?.id || null });
}
