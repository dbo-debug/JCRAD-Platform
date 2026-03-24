import { NextResponse } from "next/server";
import { loadEstimateAttachedCustomer, resolveEstimateCustomerFromFields } from "@/lib/estimate/customer";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

type EstimateRow = {
  id: string;
  total: number | null;
  customer_account_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function redirectToCustomer(req: Request, customerId: string) {
  return NextResponse.redirect(new URL(`/workspace/customers/${customerId}`, req.url), { status: 303 });
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) {
    return NextResponse.redirect(new URL("/login?returnTo=/workspace/customers", req.url), { status: 303 });
  }

  const form = await req.formData().catch(() => null);
  const estimateId = String(form?.get("estimate_id") || "").trim();
  if (!estimateId) {
    return NextResponse.redirect(new URL("/workspace/customers", req.url), { status: 303 });
  }

  const supabase = createAdminClient();
  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .select("id, total, customer_account_id, customer_name, customer_email, customer_phone")
    .eq("id", estimateId)
    .maybeSingle();

  if (estimateError || !estimate) {
    return NextResponse.redirect(new URL("/workspace/customers", req.url), { status: 303 });
  }

  const estimateRow = estimate as EstimateRow;
  const resolvedCustomer = await resolveEstimateCustomerFromFields(supabase, {
    customerAccountId: estimateRow.customer_account_id,
    customerEmail: estimateRow.customer_email,
    customerName: estimateRow.customer_name,
  });

  let customerId = resolvedCustomer?.customerId || null;

  if (!customerId) {
    const { data: createdCustomer, error: customerInsertError } = await supabase
      .from("customers")
      .insert({
        company_name: estimateRow.customer_name,
        primary_contact_email: estimateRow.customer_email,
        main_phone: estimateRow.customer_phone,
        source: "self_service_estimate",
        status: "lead",
        stage: "new",
        assigned_sales_user_id: staff.role === "sales" ? staff.userId : null,
      })
      .select("id")
      .single();

    if (customerInsertError || !createdCustomer?.id) {
      return NextResponse.redirect(new URL("/workspace/customers", req.url), { status: 303 });
    }

    customerId = String(createdCustomer.id);

    if (estimateRow.customer_name || estimateRow.customer_email || estimateRow.customer_phone) {
      await supabase.from("customer_contacts").insert({
        customer_id: customerId,
        name: estimateRow.customer_name,
        email: estimateRow.customer_email,
        phone: estimateRow.customer_phone,
        title: "Self-service estimate lead",
        is_primary: true,
        source: "self_service_estimate",
        import_notes: `Created from estimate ${estimateRow.id}.`,
      });
    }
  } else if (staff.role === "sales") {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("assigned_sales_user_id")
      .eq("id", customerId)
      .maybeSingle();
    const assignedSalesUserId = asText(customerRow?.assigned_sales_user_id);
    if (!assignedSalesUserId) {
      await supabase.from("customers").update({ assigned_sales_user_id: staff.userId }).eq("id", customerId);
    }
  }

  const attachedCustomer = customerId ? await loadEstimateAttachedCustomer(supabase, customerId).catch(() => null) : null;

  await supabase
    .from("estimates")
    .update({
      customer_account_id: customerId,
      customer_name: attachedCustomer?.contact_name || attachedCustomer?.company_name || estimateRow.customer_name || "",
      customer_email: attachedCustomer?.email || estimateRow.customer_email || "",
      customer_phone: attachedCustomer?.phone || estimateRow.customer_phone || "",
    })
    .eq("id", estimateId);

  await supabase.from("customer_activity").insert({
    customer_id: customerId,
    activity_type: "estimate_follow_up",
    summary: `Follow-up opened from self-service estimate #${estimateId.slice(0, 8)}`,
    details: {
      estimate_id: estimateId,
      estimate_total: estimateRow.total,
      hot_lead: true,
      source: "self_service_estimate",
      match_type: resolvedCustomer?.matchType || "created",
    },
    actor_user_id: staff.userId,
  });

  const { data: openTasks, error: taskLookupError } = await supabase
    .from("customer_tasks")
    .select("id, status")
    .eq("customer_id", customerId);

  if (!taskLookupError) {
    const hasOpenTask = ((openTasks || []) as Array<Record<string, unknown>>).some((task) => {
      const status = normalizeStatus(task.status);
      return status !== "completed" && status !== "closed" && status !== "cancelled";
    });

    if (!hasOpenTask) {
      const { data: taskRow, error: taskInsertError } = await supabase
        .from("customer_tasks")
        .insert({
          customer_id: customerId,
          title: "Follow up on self-service estimate",
          assigned_user_id: staff.role === "sales" ? staff.userId : null,
          priority: 1,
        })
        .select("id")
        .single();

      if (!taskInsertError) {
        await supabase.from("customer_activity").insert({
          customer_id: customerId,
          activity_type: "task_created",
          summary: "Created task: Follow up on self-service estimate",
          details: {
            task_id: taskRow?.id || null,
            estimate_id: estimateId,
            hot_lead: true,
            source: "self_service_estimate",
            auto_created: true,
          },
          actor_user_id: staff.userId,
        });
      }
    }
  }

  return redirectToCustomer(req, customerId);
}
