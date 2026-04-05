import { createAdminClient } from "@/lib/supabase/admin";

export type OrderQueueRow = {
  id: string;
  estimate_id: string | null;
  customer_account_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
};

export type OrderQueueResult = {
  rows: OrderQueueRow[];
  warning: string | null;
};

function readText(row: Record<string, unknown>, key: string): string | null {
  const text = String(row[key] || "").trim();
  return text || null;
}

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeOrderRow(row: Record<string, unknown>): OrderQueueRow {
  return {
    id: String(row.id || ""),
    estimate_id: readText(row, "estimate_id"),
    customer_account_id: readText(row, "customer_account_id"),
    customer_id: readText(row, "customer_id"),
    customer_name: readText(row, "customer_name"),
    customer_email: readText(row, "customer_email"),
    status: readText(row, "status"),
    total: readNumber(row, "total"),
    created_at: readText(row, "created_at"),
  };
}

export async function loadOrderQueue(limit = 100): Promise<OrderQueueResult> {
  const supabase = createAdminClient();
  const attempts = [
    "id, estimate_id, customer_account_id, customer_id, customer_name, customer_email, status, total, created_at",
    "id, estimate_id, customer_account_id, customer_name, customer_email, status, total, created_at",
    "id, estimate_id, customer_id, customer_name, customer_email, status, total, created_at",
    "id, estimate_id, customer_name, customer_email, status, total, created_at",
  ];

  let lastError: string | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const select = attempts[index];
    const { data, error } = await supabase.from("orders").select(select).order("created_at", { ascending: false }).limit(limit);
    if (error) {
      lastError = error.message;
      continue;
    }

    const rows = ((data || []) as Array<Record<string, unknown>>).map(normalizeOrderRow);
    return {
      rows,
      warning: index === 0 ? null : "Showing orders with a schema-tolerant fallback because the live orders table does not expose the newest linkage shape everywhere yet.",
    };
  }

  return {
    rows: [],
    warning: lastError ? `Orders could not be loaded with the current live schema shape. ${lastError}` : "Orders could not be loaded with the current live schema shape.",
  };
}
