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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!(await isNamelessCustomer(id))) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const contactId = asText(body.contact_id);
  const name = asText(body.name);
  const email = asText(body.email);
  const phone = asText(body.phone);
  const title = asText(body.title);

  if (!contactId) {
    return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("customer_contacts")
    .select("id, is_primary")
    .eq("id", contactId)
    .eq("customer_id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (existing.is_primary === true) {
    return NextResponse.json({ error: "Edit the primary contact from the primary contact section" }, { status: 400 });
  }

  const { error } = await supabase
    .from("customer_contacts")
    .update({ name, email, phone, title })
    .eq("id", contactId)
    .eq("customer_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: "contact_updated",
    summary: `Updated contact: ${name || email || phone || "Contact"}`,
    details: {
      contact_id: contactId,
      email,
      phone,
      title,
    },
    actor_user_id: staff.userId,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  if (!(await isNamelessCustomer(id))) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const contactId = asText(body.contact_id);

  if (!contactId) {
    return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("customer_contacts")
    .select("id, is_primary, name, email, phone")
    .eq("id", contactId)
    .eq("customer_id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (existing.is_primary === true) {
    return NextResponse.json({ error: "Primary contact removal is disabled here" }, { status: 400 });
  }

  const { error } = await supabase.from("customer_contacts").delete().eq("id", contactId).eq("customer_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: "contact_deleted",
    summary: `Removed contact: ${existing.name || existing.email || existing.phone || "Contact"}`,
    details: {
      contact_id: contactId,
    },
    actor_user_id: staff.userId,
  });

  return NextResponse.json({ ok: true });
}
