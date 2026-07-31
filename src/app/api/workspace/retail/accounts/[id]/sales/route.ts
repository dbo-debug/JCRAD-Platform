import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { isNamelessCustomer } from "@/lib/namelessCustomerAccess";
import {
  ACCOUNT_OWNERSHIP_OPTIONS,
  DEFAULT_COMMISSION_RATE,
  NAMELESS_WORKSPACE_KEY,
  OPPORTUNITY_STAGE_OPTIONS,
  PRODUCT_INTEREST_OPTIONS,
} from "@/lib/namelessWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";

function text(value: unknown) {
  const result = String(value || "").trim();
  return result || null;
}

function date(value: unknown) {
  const result = text(value);
  return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

function money(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function stringList(value: unknown, allowed?: readonly string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)))
    .filter((item) => !allowed || allowed.includes(item));
}

async function contactBelongsToCustomer(contactId: string | null, customerId: string) {
  if (!contactId) return true;
  const admin = createAdminClient();
  const { data } = await admin.from("customer_contacts").select("id").eq("id", contactId).eq("customer_id", customerId).maybeSingle();
  return Boolean(data?.id);
}

async function opportunityBelongsToCustomer(opportunityId: string | null, customerId: string) {
  if (!opportunityId) return true;
  const admin = createAdminClient();
  const { data } = await admin
    .from("retail_opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("customer_id", customerId)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: customerId } = await context.params;
  if (!(await isNamelessCustomer(customerId))) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = text(body.action);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (action === "update_profile") {
    const locations = Number(body.number_of_locations);
    if (!Number.isInteger(locations) || locations < 1) {
      return NextResponse.json({ error: "Number of locations must be at least 1." }, { status: 400 });
    }
    const { error } = await admin
      .from("customers")
      .update({
        dba_name: text(body.dba_name),
        company_name: text(body.dba_name),
        legal_business_name: text(body.legal_business_name),
        license_number: text(body.license_number),
        license_type: text(body.license_type),
        license_status: text(body.license_status),
        instagram: text(body.instagram),
        distributor: text(body.distributor),
        number_of_locations: locations,
        current_brands_carried: stringList(body.current_brands_carried),
        lead_source: text(body.lead_source),
        workspace_key: NAMELESS_WORKSPACE_KEY,
        updated_at: now,
      })
      .eq("id", customerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "update_ownership") {
    const ownershipStatus = text(body.ownership_status) || "unverified";
    if (!ACCOUNT_OWNERSHIP_OPTIONS.includes(ownershipStatus as (typeof ACCOUNT_OWNERSHIP_OPTIONS)[number])) {
      return NextResponse.json({ error: "Invalid ownership status." }, { status: 400 });
    }
    const requestedRate = Number(body.commission_rate);
    const commissionRate =
      staff.role === "admin" && Number.isFinite(requestedRate) && requestedRate >= 0 && requestedRate <= 1
        ? requestedRate
        : DEFAULT_COMMISSION_RATE;
    const verified = body.mark_verified === true && staff.role === "admin";
    const { error } = await admin
      .from("customers")
      .update({
        workspace_key: NAMELESS_WORKSPACE_KEY,
        ownership_status: ownershipStatus,
        ownership_notes: text(body.ownership_notes),
        commission_eligible: body.commission_eligible === true,
        commission_rate: commissionRate,
        commission_start_date: date(body.commission_start_date),
        commission_expiration_date: date(body.commission_expiration_date),
        ...(verified ? { ownership_verified_by: staff.userId, ownership_verified_at: now } : {}),
        updated_at: now,
      })
      .eq("id", customerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "create_opportunity") {
    const name = text(body.name);
    const stage = text(body.stage) || "new_prospect";
    if (!name) return NextResponse.json({ error: "Opportunity name is required." }, { status: 400 });
    if (!OPPORTUNITY_STAGE_OPTIONS.includes(stage as (typeof OPPORTUNITY_STAGE_OPTIONS)[number])) {
      return NextResponse.json({ error: "Invalid opportunity stage." }, { status: 400 });
    }
    const contactId = text(body.contact_id);
    if (!(await contactBelongsToCustomer(contactId, customerId))) {
      return NextResponse.json({ error: "Contact does not belong to this account." }, { status: 400 });
    }
    const probability = body.probability === "" || body.probability == null ? null : Number(body.probability);
    if (probability !== null && (!Number.isInteger(probability) || probability < 0 || probability > 100)) {
      return NextResponse.json({ error: "Probability must be from 0 to 100." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("retail_opportunities")
      .insert({
        customer_id: customerId,
        contact_id: contactId,
        name,
        stage,
        estimated_order_value: money(body.estimated_order_value),
        probability,
        expected_close_date: date(body.expected_close_date),
        products_of_interest: stringList(body.products_of_interest, PRODUCT_INTEREST_OPTIONS),
        sample_status: text(body.sample_status),
        pricing_status: text(body.pricing_status),
        next_action: text(body.next_action),
        next_action_due_date: date(body.next_action_due_date),
        owner_user_id: staff.userId,
        lead_source: text(body.lead_source),
        notes: text(body.notes),
        created_by: staff.userId,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("customer_activity").insert({
      customer_id: customerId,
      contact_id: contactId,
      opportunity_id: data.id,
      activity_type: "opportunity_created",
      summary: `Created opportunity: ${name}`,
      actor_user_id: staff.userId,
      occurred_at: now,
      next_action: text(body.next_action),
      next_action_date: date(body.next_action_due_date),
    });
    await admin.from("customers").update({ stage, updated_at: now }).eq("id", customerId);
    return NextResponse.json({ ok: true, record: data }, { status: 201 });
  }

  if (action === "advance_opportunity") {
    const opportunityId = text(body.opportunity_id);
    const stage = text(body.stage);
    if (!opportunityId || !stage || !OPPORTUNITY_STAGE_OPTIONS.includes(stage as (typeof OPPORTUNITY_STAGE_OPTIONS)[number])) {
      return NextResponse.json({ error: "Opportunity and valid stage are required." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("retail_opportunities")
      .update({
        stage,
        next_action: text(body.next_action),
        next_action_due_date: date(body.next_action_due_date),
        lost_reason: stage === "lost" || stage === "not_qualified" ? text(body.lost_reason) : null,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", opportunityId)
      .eq("customer_id", customerId)
      .select("id, name, stage")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("customer_activity").insert({
      customer_id: customerId,
      opportunity_id: opportunityId,
      activity_type: "opportunity_stage_changed",
      summary: `Advanced ${data.name} to ${stage.replaceAll("_", " ")}`,
      actor_user_id: staff.userId,
      occurred_at: now,
      next_action: text(body.next_action),
      next_action_date: date(body.next_action_due_date),
    });
    await admin.from("customers").update({ stage, updated_at: now }).eq("id", customerId);
    return NextResponse.json({ ok: true, record: data });
  }

  if (action === "create_sample") {
    const contactId = text(body.contact_id);
    const opportunityId = text(body.opportunity_id);
    if (!(await contactBelongsToCustomer(contactId, customerId))) {
      return NextResponse.json({ error: "Contact does not belong to this account." }, { status: 400 });
    }
    if (!(await opportunityBelongsToCustomer(opportunityId, customerId))) {
      return NextResponse.json({ error: "Opportunity does not belong to this account." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("retail_samples")
      .insert({
        customer_id: customerId,
        contact_id: contactId,
        opportunity_id: opportunityId,
        requested_at: date(body.requested_at),
        approval_status: text(body.approval_status) || "pending",
        products_requested: stringList(body.products_requested),
        quantity: text(body.quantity),
        prepared_at: date(body.prepared_at),
        delivered_at: date(body.delivered_at),
        delivered_by_user_id: body.delivered_at ? staff.userId : null,
        recipient: text(body.recipient),
        buyer_feedback: text(body.buyer_feedback),
        feedback_at: date(body.feedback_at),
        follow_up_date: date(body.follow_up_date),
        outcome: text(body.outcome) || "pending",
        notes: text(body.notes),
        created_by: staff.userId,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("customer_activity").insert({
      customer_id: customerId,
      contact_id: contactId,
      opportunity_id: opportunityId,
      activity_type: body.delivered_at ? "sample_drop" : "sample_requested",
      summary: body.delivered_at ? "Recorded sample delivery" : "Recorded sample request",
      details: { sample_id: data.id, products_requested: data.products_requested, quantity: data.quantity },
      actor_user_id: staff.userId,
      occurred_at: now,
      next_action: "Follow up on samples",
      next_action_date: date(body.follow_up_date),
    });
    await admin
      .from("customers")
      .update({ stage: body.delivered_at ? "samples_delivered" : "samples_requested", updated_at: now })
      .eq("id", customerId);
    return NextResponse.json({ ok: true, record: data }, { status: 201 });
  }

  if (action === "create_activity") {
    const activityType = text(body.activity_type) || "internal_note";
    const notes = text(body.notes);
    if (!notes) return NextResponse.json({ error: "Activity notes are required." }, { status: 400 });
    const contactId = text(body.contact_id);
    const opportunityId = text(body.opportunity_id);
    if (!(await contactBelongsToCustomer(contactId, customerId))) {
      return NextResponse.json({ error: "Contact does not belong to this account." }, { status: 400 });
    }
    if (!(await opportunityBelongsToCustomer(opportunityId, customerId))) {
      return NextResponse.json({ error: "Opportunity does not belong to this account." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("customer_activity")
      .insert({
        customer_id: customerId,
        contact_id: contactId,
        opportunity_id: opportunityId,
        activity_type: activityType,
        summary: text(body.summary) || activityType.replaceAll("_", " "),
        details: { notes },
        actor_user_id: staff.userId,
        occurred_at: text(body.occurred_at) || now,
        outcome: text(body.outcome),
        next_action: text(body.next_action),
        next_action_date: date(body.next_action_date),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.create_task === true && text(body.next_action)) {
      const { error: taskError } = await admin.from("customer_tasks").insert({
        customer_id: customerId,
        title: text(body.next_action),
        due_date: date(body.next_action_date),
        assigned_user_id: staff.userId,
        status: "open",
        priority: 2,
      });
      if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, activityId: data.id }, { status: 201 });
  }

  if (action === "create_order") {
    const grossSales = money(body.gross_sales);
    if (grossSales === null) return NextResponse.json({ error: "Gross sales must be zero or greater." }, { status: 400 });
    const opportunityId = text(body.opportunity_id);
    if (!(await opportunityBelongsToCustomer(opportunityId, customerId))) {
      return NextResponse.json({ error: "Opportunity does not belong to this account." }, { status: 400 });
    }
    const { data: customer } = await admin.from("customers").select("commission_rate").eq("id", customerId).single();
    const requestedRate = Number(body.commission_rate);
    const commissionRate =
      staff.role === "admin" && Number.isFinite(requestedRate) && requestedRate >= 0 && requestedRate <= 1
        ? requestedRate
        : Number(customer?.commission_rate ?? DEFAULT_COMMISSION_RATE);
    const { data, error } = await admin
      .from("retail_sales_orders")
      .insert({
        customer_id: customerId,
        opportunity_id: opportunityId,
        order_number: text(body.order_number),
        invoice_number: text(body.invoice_number),
        order_date: date(body.order_date) || new Date().toISOString().slice(0, 10),
        invoice_date: date(body.invoice_date),
        gross_sales: grossSales,
        discounts: money(body.discounts) ?? 0,
        returns_credits: money(body.returns_credits) ?? 0,
        commission_rate: commissionRate,
        payment_collection_status: text(body.payment_collection_status),
        commission_approval_status: text(body.commission_approval_status),
        commission_payment_status: text(body.commission_payment_status),
        commission_status: text(body.commission_status) || "estimated",
        commission_paid_at: date(body.commission_paid_at),
        notes: text(body.notes),
        created_by: staff.userId,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("customer_activity").insert({
      customer_id: customerId,
      opportunity_id: opportunityId,
      activity_type: "order_update",
      summary: `Recorded order ${text(body.order_number) || String(data.id).slice(0, 8)}`,
      details: {
        retail_sales_order_id: data.id,
        commissionable_sales: data.commissionable_sales,
        estimated_commission: data.estimated_commission,
        estimate_not_guaranteed: true,
      },
      actor_user_id: staff.userId,
      occurred_at: now,
    });
    if (opportunityId) {
      await admin
        .from("retail_opportunities")
        .update({ stage: "first_order_placed", last_activity_at: now, updated_at: now })
        .eq("id", opportunityId)
        .eq("customer_id", customerId);
    }
    await admin.from("customers").update({ stage: "first_order_placed", status: "active", updated_at: now }).eq("id", customerId);
    return NextResponse.json({ ok: true, record: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unsupported sales action." }, { status: 400 });
}
