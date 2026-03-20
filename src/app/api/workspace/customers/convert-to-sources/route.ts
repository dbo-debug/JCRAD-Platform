import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerRow = {
  id: string;
  company_name: string | null;
  name: string | null;
  display_name: string | null;
  primary_contact_email: string | null;
  main_phone: string | null;
  status: string | null;
  stage: string | null;
  source: string | null;
  import_source: string | null;
  import_notes: string | null;
  record_kind: string | null;
};

type ContactRow = {
  customer_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean | null;
};

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const customerIds = Array.from(new Set(asIdArray(body.customer_ids)));
  if (customerIds.length === 0) {
    return NextResponse.json({ error: "customer_ids required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [customersRes, contactsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, company_name, name, display_name, primary_contact_email, main_phone, status, stage, source, import_source, import_notes, record_kind")
      .in("id", customerIds),
    supabase
      .from("customer_contacts")
      .select("customer_id, name, email, phone, is_primary")
      .in("customer_id", customerIds),
  ]);

  if (customersRes.error) return NextResponse.json({ error: customersRes.error.message }, { status: 500 });
  if (contactsRes.error) return NextResponse.json({ error: contactsRes.error.message }, { status: 500 });

  const customers = ((customersRes.data || []) as CustomerRow[]).filter((customer) => String(customer.record_kind || "customer").trim().toLowerCase() === "customer");
  if (customers.length === 0) {
    return NextResponse.json({ error: "No convertible customer accounts found." }, { status: 400 });
  }

  const contacts = (contactsRes.data || []) as ContactRow[];
  const primaryContactByCustomerId = new Map<string, ContactRow>();
  for (const contact of contacts) {
    const customerId = String(contact.customer_id || "").trim();
    if (!customerId) continue;
    const existing = primaryContactByCustomerId.get(customerId);
    if (contact.is_primary || !existing) {
      primaryContactByCustomerId.set(customerId, contact);
    }
  }

  const timestamp = new Date().toISOString();
  const sourceInsertPayload = customers.map((customer) => {
    const primaryContact = primaryContactByCustomerId.get(customer.id) || null;
    const displayName = firstText(customer.company_name, customer.name, customer.display_name, primaryContact?.name, customer.primary_contact_email) || "Unnamed source";

    return {
      name: displayName,
      source_type: null,
      company_name: firstText(customer.company_name, customer.name, customer.display_name),
      contact_name: firstText(primaryContact?.name),
      contact_email: firstText(customer.primary_contact_email, primaryContact?.email),
      contact_phone: firstText(customer.main_phone, primaryContact?.phone),
      status: firstText(customer.status) || "active",
      stage: firstText(customer.stage),
      notes: firstText(customer.import_notes),
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const { data: insertedSources, error: insertError } = await supabase
    .from("sources")
    .insert(sourceInsertPayload)
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const insertedIds = ((insertedSources || []) as Array<{ id?: string | null }>).map((row) => String(row.id || "").trim()).filter(Boolean);
  if (insertedIds.length !== customers.length) {
    return NextResponse.json({ error: "Source conversion count mismatch." }, { status: 500 });
  }

  const activityPayload = customers.map((customer, index) => ({
    source_id: insertedIds[index],
    activity_type: "converted_from_customer",
    summary: `Converted from customer account ${firstText(customer.company_name, customer.name, customer.display_name, customer.id) || customer.id}`,
    details: {
      customer_id: customer.id,
      customer_source: firstText(customer.source),
      customer_import_source: firstText(customer.import_source),
      converted_at: timestamp,
    },
    actor_user_id: staff.userId,
  }));

  const { error: activityError } = await supabase.from("source_activity").insert(activityPayload);
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 500 });

  const convertedCustomerIds = customers.map((customer) => customer.id);
  const { error: updateError } = await supabase
    .from("customers")
    .update({ record_kind: "source", updated_at: timestamp })
    .in("id", convertedCustomerIds);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    converted: convertedCustomerIds.length,
    customer_ids: convertedCustomerIds,
    source_ids: insertedIds,
  });
}
