import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const contactId = asText(body.contact_id);
  const name = asText(body.name);
  const email = asText(body.email);
  const phone = asText(body.phone);
  const title = asText(body.title);

  const supabase = createAdminClient();

  if (contactId) {
    const { data: targetContact, error: targetError } = await supabase
      .from("customer_contacts")
      .select("id, name, email, phone, title")
      .eq("id", contactId)
      .eq("customer_id", id)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!targetContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const clearPrimary = await supabase.from("customer_contacts").update({ is_primary: false }).eq("customer_id", id);
    if (clearPrimary.error) {
      return NextResponse.json({ error: clearPrimary.error.message }, { status: 500 });
    }

    const nextName = name ?? targetContact.name ?? null;
    const nextEmail = email ?? targetContact.email ?? null;
    const nextPhone = phone ?? targetContact.phone ?? null;
    const nextTitle = title ?? targetContact.title ?? null;

    const { error: promoteError } = await supabase
      .from("customer_contacts")
      .update({
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        title: nextTitle,
        is_primary: true,
      })
      .eq("id", contactId)
      .eq("customer_id", id);

    if (promoteError) {
      return NextResponse.json({ error: promoteError.message }, { status: 500 });
    }

    const { error: customerErr } = await supabase
      .from("customers")
      .update({ primary_contact_email: nextEmail })
      .eq("id", id);

    if (customerErr) {
      return NextResponse.json({ error: customerErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const { data: existingRows, error: existingErr } = await supabase
    .from("customer_contacts")
    .select("id")
    .eq("customer_id", id)
    .eq("is_primary", true)
    .limit(1);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const existingId = String(existingRows?.[0]?.id || "").trim();
  const clearPrimary = await supabase.from("customer_contacts").update({ is_primary: false }).eq("customer_id", id);
  if (clearPrimary.error) {
    return NextResponse.json({ error: clearPrimary.error.message }, { status: 500 });
  }

  if (existingId) {
    const { error } = await supabase
      .from("customer_contacts")
      .update({
        name,
        email,
        phone,
        title,
        is_primary: true,
      })
      .eq("id", existingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("customer_contacts").insert({
      customer_id: id,
      name,
      email,
      phone,
      title,
      is_primary: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: customerErr } = await supabase
    .from("customers")
    .update({ primary_contact_email: email })
    .eq("id", id);

  if (customerErr) {
    return NextResponse.json({ error: customerErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
