import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerRow = {
  id: string;
  company_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  main_phone: string | null;
  status: string | null;
  stage: string | null;
  source: string | null;
  import_notes: string | null;
  record_kind: string | null;
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
  console.log("[convert-to-sources] selected customer count", customerIds.length);

  const supabase = createAdminClient();
  const customersRes = await supabase
    .from("customers")
    .select("id, company_name, primary_contact_name, primary_contact_email, primary_contact_phone, main_phone, status, stage, source, import_notes, record_kind")
    .in("id", customerIds);

  if (customersRes.error) return NextResponse.json({ error: customersRes.error.message }, { status: 500 });

  const customers = ((customersRes.data || []) as CustomerRow[]).filter((customer) => String(customer.record_kind || "customer").trim().toLowerCase() === "customer");
  console.log("[convert-to-sources] fetched customer count", customers.length);
  if (customers.length === 0) {
    return NextResponse.json({ error: "No convertible customer accounts found." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const sourceInsertPayload = customers.map((customer) => {
    return {
      name: firstText(customer.company_name, customer.primary_contact_email, customer.id) || customer.id,
      source_type: null,
      company_name: firstText(customer.company_name),
      contact_name: firstText(customer.primary_contact_name),
      contact_email: firstText(customer.primary_contact_email),
      contact_phone: firstText(customer.primary_contact_phone, customer.main_phone),
      status: firstText(customer.status) || "active",
      stage: firstText(customer.stage),
      notes: firstText(customer.import_notes),
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
  console.log("[convert-to-sources] insert payload count", sourceInsertPayload.length);

  const { data: insertedSources, error: insertError } = await supabase
    .from("sources")
    .insert(sourceInsertPayload)
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const insertedIds = ((insertedSources || []) as Array<{ id?: string | null }>).map((row) => String(row.id || "").trim()).filter(Boolean);
  console.log("[convert-to-sources] inserted source count", insertedIds.length);
  if (insertedIds.length === 0 || insertedIds.length !== customers.length) {
    return NextResponse.json({ error: "Source conversion count mismatch." }, { status: 500 });
  }

  const activityPayload = customers.map((customer, index) => ({
    source_id: insertedIds[index],
    activity_type: "converted_from_customer",
    summary: `Converted from customer account ${firstText(customer.company_name, customer.primary_contact_email, customer.id) || customer.id}`,
    details: {
      customer_id: customer.id,
      customer_source: firstText(customer.source),
      converted_at: timestamp,
    },
    actor_user_id: staff.userId,
  }));

  const { error: activityError } = await supabase.from("source_activity").insert(activityPayload);
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 500 });

  const convertedCustomerIds = customers.map((customer) => customer.id);
  const { data: updatedCustomers, error: updateError } = await supabase
    .from("customers")
    .update({ record_kind: "source", updated_at: timestamp })
    .in("id", convertedCustomerIds)
    .select("id");

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  const updatedCustomerIds = ((updatedCustomers || []) as Array<{ id?: string | null }>).map((row) => String(row.id || "").trim()).filter(Boolean);
  console.log("[convert-to-sources] updated customer count", updatedCustomerIds.length);

  return NextResponse.json({
    ok: true,
    converted: Math.min(insertedIds.length, updatedCustomerIds.length),
    selected_count: customerIds.length,
    fetched_customer_count: customers.length,
    inserted_source_count: insertedIds.length,
    updated_customer_count: updatedCustomerIds.length,
    source_ids: insertedIds,
    customer_ids: updatedCustomerIds,
  });
}
