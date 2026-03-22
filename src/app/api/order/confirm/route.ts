/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { isApprovedCustomerApprovalStatus, normalizeCustomerApprovalStatus } from "@/lib/customerApproval";
import { requireAdmin } from "@/lib/requireAdmin";
import { logPlatformEvent } from "@/lib/events/logPlatformEvent";
import { appendOrderRowToSheet } from "@/lib/googleSheets";
import { getEstimatePackagingReviewState } from "@/lib/packaging/reviewStatus";
import { lbsFromEstimateLine, money } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

type OfferProductInventory = {
  id: string;
  product_id: string;
  products: {
    id: string;
    name: string | null;
    inventory_qty: number | null;
    inventory_unit: string | null;
  } | null;
};

function toLb(value: number, unit: string | null | undefined): number {
  if (String(unit || "lb").toLowerCase() === "g") return value / 453.592;
  return value;
}

function isActiveCustomerRow(row: Record<string, unknown>) {
  const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
  return !recordKind || recordKind === "customer";
}

async function loadApprovalCandidatesByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  customerEmail: string,
) {
  const normalizedEmail = String(customerEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return [] as Array<Record<string, unknown>>;

  const [customerRes, contactRes] = await Promise.all([
    supabase.from("customers").select("id").ilike("primary_contact_email", normalizedEmail),
    supabase.from("customer_contacts").select("customer_id").ilike("email", normalizedEmail),
  ]);

  if (customerRes.error) throw new Error(customerRes.error.message);
  if (contactRes.error) throw new Error(contactRes.error.message);

  const customerIds = Array.from(
    new Set([
      ...(customerRes.data || []).map((row: Record<string, unknown>) => String(row.id || "").trim()),
      ...(contactRes.data || []).map((row: Record<string, unknown>) => String(row.customer_id || "").trim()),
    ].filter(Boolean)),
  );

  if (customerIds.length === 0) return [] as Array<Record<string, unknown>>;

  const { data, error } = await supabase
    .from("customers")
    .select("id, approval_status, record_kind")
    .in("id", customerIds);

  if (error) throw new Error(error.message);

  return ((data || []) as Array<Record<string, unknown>>).filter(isActiveCustomerRow);
}

async function getOrderSubmissionApprovalState(
  supabase: ReturnType<typeof createAdminClient>,
  estimate: {
    customer_account_id?: string | null;
    customer_email?: string | null;
  },
) {
  const attachedCustomerId = String(estimate.customer_account_id || "").trim();
  const customerEmail = String(estimate.customer_email || "").trim().toLowerCase();

  let customers: Array<Record<string, unknown>> = [];

  if (attachedCustomerId) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, approval_status, record_kind")
      .eq("id", attachedCustomerId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    customers = data ? [data as Record<string, unknown>].filter(isActiveCustomerRow) : [];
  } else {
    customers = await loadApprovalCandidatesByEmail(supabase, customerEmail);
  }

  const approvedCustomer = customers.find((row) => isApprovedCustomerApprovalStatus(row.approval_status));
  const matchedCustomer = approvedCustomer || customers[0] || null;
  const approvalStatus = normalizeCustomerApprovalStatus(matchedCustomer?.approval_status);

  return {
    approved: Boolean(approvedCustomer),
    matchedCustomerId: String(matchedCustomer?.id || "").trim() || null,
    approvalStatus,
    hasAttachedCustomer: Boolean(attachedCustomerId),
  };
}

async function validateAndConsumeInventory(supabase: ReturnType<typeof createAdminClient>, lines: any[]) {
  const offerIds = Array.from(new Set(lines.map((l) => String(l.offer_id || "")).filter(Boolean)));
  if (offerIds.length === 0) {
    throw new Error("Order has no valid offer_ids");
  }

  const { data: offerRows, error: offerErr } = await supabase
    .from("offers")
    .select("id, product_id, products:product_id(id, name, inventory_qty, inventory_unit)")
    .in("id", offerIds);

  if (offerErr) throw new Error(offerErr.message);

  const offerById = new Map<string, OfferProductInventory>();
  for (const row of offerRows || []) {
    offerById.set(String((row as any).id), row as unknown as OfferProductInventory);
  }

  const requiredByProduct = new Map<
    string,
    { requiredLb: number; name: string; inventoryQty: number; inventoryUnit: string }
  >();

  for (const line of lines) {
    const offer = offerById.get(String(line.offer_id || ""));
    if (!offer?.product_id || !offer.products) {
      throw new Error(`Missing offer/product for line ${String(line.id || "")}`);
    }

    const productId = String(offer.product_id);
    const current = requiredByProduct.get(productId);
    const lineLb = lbsFromEstimateLine(line);

    if (current) {
      current.requiredLb += lineLb;
    } else {
      requiredByProduct.set(productId, {
        requiredLb: lineLb,
        name: String(offer.products.name || productId),
        inventoryQty: Number(offer.products.inventory_qty || 0),
        inventoryUnit: String(offer.products.inventory_unit || "lb"),
      });
    }
  }

  for (const [productId, summary] of requiredByProduct.entries()) {
    const availableLb = toLb(summary.inventoryQty, summary.inventoryUnit);
    if (summary.requiredLb > availableLb + 1e-9) {
      throw new Error(
        `Insufficient inventory for ${summary.name}. Required ${summary.requiredLb.toFixed(3)} lb, available ${availableLb.toFixed(3)} lb.`
      );
    }

    const newQtyInCurrentUnit =
      summary.inventoryUnit.toLowerCase() === "g"
        ? money(summary.inventoryQty - summary.requiredLb * 453.592)
        : money(summary.inventoryQty - summary.requiredLb);

    const { error: updErr } = await supabase
      .from("products")
      .update({ inventory_qty: Math.max(0, newQtyInCurrentUnit) })
      .eq("id", productId);

    if (updErr) {
      throw new Error(`Failed to decrement inventory for ${summary.name}: ${updErr.message}`);
    }
  }
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const estimate_id = body?.estimate_id ? String(body.estimate_id) : null;

  if (!estimate_id) {
    return NextResponse.json({ error: "estimate_id required" }, { status: 400 });
  }

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, subtotal, adjustments, total, customer_account_id, customer_name, customer_email, customer_phone, notes, packaging_review_pending")
    .eq("id", estimate_id)
    .single();

  if (estErr || !estimate) {
    return NextResponse.json({ error: estErr?.message || "Estimate not found" }, { status: 404 });
  }

  if ((estimate as any).status === "converted") {
    return NextResponse.json({ error: "Estimate already converted" }, { status: 400 });
  }

  const { data: lines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("id, offer_id, mode, quantity_lbs, units, unit_size, packaging_mode, packaging_sku_id, packaging_submission_id, extra_touch_points, pre_roll_mode, pre_roll_pack_qty, material_unit_cost, packaging_unit_cost, labor_unit_cost, material_total, packaging_total, labor_total, line_total, notes")
    .eq("estimate_id", estimate_id)
    .order("created_at", { ascending: true });

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "Estimate has no lines" }, { status: 400 });
  }

  const approvalState = await getOrderSubmissionApprovalState(supabase, estimate as {
    customer_account_id?: string | null;
    customer_email?: string | null;
  });
  if (!approvalState.approved) {
    const onboardingMessage = approvalState.matchedCustomerId
      ? `Customer onboarding approval is required before submitting an order. Current approval status: ${approvalState.approvalStatus}.`
      : "Customer onboarding approval is required before submitting an order. Attach an approved customer account or use a contact email linked to an approved account.";
    return NextResponse.json({ error: onboardingMessage }, { status: 400 });
  }

  const packagingState = await getEstimatePackagingReviewState(supabase, estimate_id);
  if (packagingState.hasUnapprovedCustomerPackaging) {
    return NextResponse.json(
      {
        error:
          "Customer-supplied packaging is still awaiting compliance review. Approve packaging submission before converting this estimate to an order.",
      },
      { status: 400 },
    );
  }

  try {
    await validateAndConsumeInventory(supabase, lines as any[]);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Inventory validation failed" }, { status: 400 });
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      estimate_id,
      customer_account_id: (estimate as any).customer_account_id || null,
      customer_name: (estimate as any).customer_name || "",
      customer_email: (estimate as any).customer_email || "",
      customer_phone: (estimate as any).customer_phone || "",
      subtotal: Number((estimate as any).subtotal || 0),
      adjustments: Number((estimate as any).adjustments || 0),
      total: Number((estimate as any).total || 0),
      notes: (estimate as any).notes || "",
      status: "confirmed",
    })
    .select("id, created_at, customer_name, customer_email, customer_phone, subtotal, adjustments, total, notes")
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || "Failed creating order" }, { status: 500 });
  }

  const orderLines = lines.map((line: any) => ({
    order_id: (order as any).id,
    offer_id: line.offer_id,
    mode: line.mode,
    quantity_lbs: line.quantity_lbs,
    units: line.units,
    unit_size: line.unit_size,
    packaging_mode: line.packaging_mode,
    packaging_sku_id: line.packaging_sku_id,
    packaging_submission_id: line.packaging_submission_id,
    extra_touch_points: line.extra_touch_points,
    pre_roll_mode: line.pre_roll_mode,
    pre_roll_pack_qty: line.pre_roll_pack_qty,
    material_unit_cost: line.material_unit_cost,
    packaging_unit_cost: line.packaging_unit_cost,
    labor_unit_cost: line.labor_unit_cost,
    material_total: line.material_total,
    packaging_total: line.packaging_total,
    labor_total: line.labor_total,
    line_total: line.line_total,
    notes: line.notes,
  }));

  const { error: lineErr } = await supabase.from("order_lines").insert(orderLines);
  if (lineErr) {
    return NextResponse.json({ error: lineErr.message, order_id: (order as any).id }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("estimates")
    .update({ status: "converted" })
    .eq("id", estimate_id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message, order_id: (order as any).id }, { status: 500 });
  }

  try {
    await appendOrderRowToSheet({
      order_id: (order as any).id,
      created_at: String((order as any).created_at || new Date().toISOString()),
      customer_name: String((order as any).customer_name || ""),
      customer_email: String((order as any).customer_email || ""),
      customer_phone: String((order as any).customer_phone || ""),
      subtotal: Number((order as any).subtotal || 0),
      adjustments: Number((order as any).adjustments || 0),
      total: Number((order as any).total || 0),
      notes: String((order as any).notes || ""),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: `Order created but Google Sheets append failed: ${e?.message || "unknown"}`,
        order_id: (order as any).id,
      },
      { status: 500 }
    );
  }

  await logPlatformEvent({
    eventType: "order_requested",
    userEmail: String((estimate as any).customer_email || "").trim().toLowerCase() || null,
    metadata: {
      estimate_id,
      order_id: String((order as any).id || ""),
      line_count: Array.isArray(lines) ? lines.length : 0,
      total: Number((order as any).total || 0),
    },
  });

  return NextResponse.json({ ok: true, order_id: (order as any).id });
}
