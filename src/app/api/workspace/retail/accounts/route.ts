import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import {
  ACCOUNT_OWNERSHIP_OPTIONS,
  DEFAULT_COMMISSION_RATE,
  NAMELESS_WORKSPACE_KEY,
  OPPORTUNITY_STAGE_OPTIONS,
  SALES_ZONE_OPTIONS,
} from "@/lib/namelessWorkspace";
import { findLikelyDuplicateRetailAccounts } from "@/lib/retailAccounts";
import { createAdminClient } from "@/lib/supabase/admin";

function asText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function asEmail(value: unknown) {
  const email = asText(value)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function asPositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function asCommissionRate(value: unknown, canOverride: boolean) {
  if (!canOverride || value === null || value === undefined || value === "") return DEFAULT_COMMISSION_RATE;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  return rate;
}

function duplicateInput(body: Record<string, unknown>) {
  return {
    storeName: asText(body.dba_name || body.store_name),
    legalName: asText(body.legal_business_name),
    licenseNumber: asText(body.license_number),
    address: asText(body.address),
    buyerEmail: asEmail(body.buyer_email),
    phone: asText(body.main_phone || body.buyer_mobile),
  };
}

export async function POST(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = asText(body.action) || "create";
  const matches = await findLikelyDuplicateRetailAccounts(duplicateInput(body));

  if (action === "check_duplicates") {
    return NextResponse.json({ matches, clear: matches.length === 0 });
  }

  const storeName = asText(body.dba_name || body.store_name);
  if (!storeName) return NextResponse.json({ error: "Store/DBA name is required." }, { status: 400 });

  const ownershipStatus = asText(body.ownership_status) || "unverified";
  if (!ACCOUNT_OWNERSHIP_OPTIONS.includes(ownershipStatus as (typeof ACCOUNT_OWNERSHIP_OPTIONS)[number])) {
    return NextResponse.json({ error: "Invalid account ownership status." }, { status: 400 });
  }
  if (ownershipStatus === "douglas_originated_account" && matches.length > 0 && body.duplicate_override !== true) {
    return NextResponse.json(
      { error: "A likely existing Nameless account was found. Review the warning before claiming ownership.", matches },
      { status: 409 }
    );
  }

  const zone = asText(body.area_zone);
  if (zone && !SALES_ZONE_OPTIONS.includes(zone as (typeof SALES_ZONE_OPTIONS)[number])) {
    return NextResponse.json({ error: "Invalid sales zone." }, { status: 400 });
  }

  const buyerEmail = asEmail(body.buyer_email);
  if (body.buyer_email && !buyerEmail) return NextResponse.json({ error: "Buyer email is invalid." }, { status: 400 });

  const commissionRate = asCommissionRate(body.commission_rate, staff.role === "admin");
  if (commissionRate === null) return NextResponse.json({ error: "Commission rate must be between 0% and 100%." }, { status: 400 });

  const stage = asText(body.stage) || "new_prospect";
  if (!OPPORTUNITY_STAGE_OPTIONS.includes(stage as (typeof OPPORTUNITY_STAGE_OPTIONS)[number])) {
    return NextResponse.json({ error: "Invalid account stage." }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: customer, error: customerError } = await admin
    .from("customers")
    .insert({
      workspace_key: NAMELESS_WORKSPACE_KEY,
      company_name: storeName,
      dba_name: storeName,
      legal_business_name: asText(body.legal_business_name),
      license_number: asText(body.license_number),
      license_type: asText(body.license_type),
      license_status: asText(body.license_status),
      address_1: asText(body.address_1),
      city: asText(body.city),
      state: asText(body.state) || "CA",
      postal_code: asText(body.postal_code),
      area_zone: zone,
      territory_code: asText(body.territory_code),
      website: asText(body.website),
      instagram: asText(body.instagram),
      main_phone: asText(body.main_phone),
      primary_contact_email: buyerEmail,
      distributor: asText(body.distributor),
      number_of_locations: asPositiveInteger(body.number_of_locations),
      current_brands_carried: Array.isArray(body.current_brands_carried)
        ? body.current_brands_carried.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      source: asText(body.lead_source),
      lead_source: asText(body.lead_source),
      assigned_sales_user_id: staff.userId,
      ownership_status: ownershipStatus,
      account_submitted_by: staff.userId,
      account_submitted_at: now,
      ownership_notes: asText(body.ownership_notes),
      commission_eligible: ownershipStatus === "douglas_originated_account" || ownershipStatus === "shared_account",
      commission_rate: commissionRate,
      status: asText(body.status) || "prospect",
      stage,
      next_follow_up_date: asText(body.next_follow_up_date),
      import_notes: asText(body.notes),
    })
    .select("id")
    .single();

  if (customerError || !customer?.id) {
    return NextResponse.json({ error: customerError?.message || "Unable to create retail account." }, { status: 500 });
  }

  const customerId = String(customer.id);
  const buyerName = asText(body.buyer_name);
  const buyerMobile = asText(body.buyer_mobile);
  let contactId: string | null = null;
  if (buyerName || buyerEmail || buyerMobile) {
    const { data: contact, error: contactError } = await admin
      .from("customer_contacts")
      .insert({
        customer_id: customerId,
        name: buyerName || "Buyer",
        title: asText(body.buyer_title) || "Buyer",
        email: buyerEmail,
        phone: buyerMobile,
        is_primary: true,
        source: asText(body.lead_source) || "retail_sales",
      })
      .select("id")
      .single();
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
    contactId = String(contact?.id || "") || null;
  }

  await admin.from("customer_activity").insert({
    customer_id: customerId,
    contact_id: contactId,
    activity_type: "account_created",
    summary: "Nameless retail account created",
    details: {
      workspace_key: NAMELESS_WORKSPACE_KEY,
      ownership_status: ownershipStatus,
      duplicate_check_match_count: matches.length,
    },
    actor_user_id: staff.userId,
    occurred_at: now,
    next_action: asText(body.next_action),
    next_action_date: asText(body.next_follow_up_date),
  });

  return NextResponse.json({ ok: true, customerId, matches }, { status: 201 });
}
