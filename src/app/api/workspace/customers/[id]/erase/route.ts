import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import { isNamelessCustomer } from "@/lib/namelessCustomerAccess";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

function isMissingSchemaError(error: SupabaseLikeError | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache") ||
    (details.includes("relation") && details.includes("does not exist")) ||
    (details.includes("column") && details.includes("does not exist")) ||
    details.includes("schema cache")
  );
}

async function ignoreMissingSchema<T extends { error?: SupabaseLikeError | null }>(operation: Promise<T>): Promise<T> {
  const result = await operation;
  if (result.error && !isMissingSchemaError(result.error)) {
    throw new Error(result.error.message || "Database operation failed");
  }
  return result;
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!(await isNamelessCustomer(id))) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const customerId = String(id || "").trim();
  if (!customerId) {
    return NextResponse.json({ error: "Customer id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("record_kind", "customer")
    .maybeSingle();

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  try {
    await ignoreMissingSchema(admin.from("customer_contacts").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("customer_notes").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("customer_activity").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("customer_tasks").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("customer_users").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("customer_documents").delete().eq("customer_account_id", customerId));
    await ignoreMissingSchema(admin.from("outbound_emails").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("email_campaign_recipients").delete().eq("customer_id", customerId));
    await ignoreMissingSchema(admin.from("estimates").update({ customer_account_id: null }).eq("customer_account_id", customerId));
    await ignoreMissingSchema(
      admin
        .from("orders")
        .update({ customer_account_id: null, customer_id: null })
        .or(`customer_account_id.eq.${customerId},customer_id.eq.${customerId}`)
    );

    const { error: deleteError } = await admin.from("customers").delete().eq("id", customerId).eq("record_kind", "customer");
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, customer_id: customerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to erase account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
