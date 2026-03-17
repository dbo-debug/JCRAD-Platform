import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerSummary } from "@/lib/customerWorkspace";

export type RouteStopQueueRow = {
  id: string;
  customerId: string;
  addedByUserId: string;
  createdAt: string | null;
};

export type PendingRouteStop = RouteStopQueueRow & {
  customer: CustomerSummary;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function isMissingRelationError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();

  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("schema cache") ||
    (details.includes("relation") && details.includes("does not exist")) ||
    details.includes("schema cache")
  );
}

export async function loadRouteStopQueueRows(userId: string): Promise<RouteStopQueueRow[]> {
  const normalizedUserId = asText(userId);
  if (!normalizedUserId) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("route_stop_queue")
    .select("id, customer_id, added_by_user_id, created_at")
    .eq("added_by_user_id", normalizedUserId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const id = asText(row.id);
      const customerId = asText(row.customer_id);
      const addedByUserId = asText(row.added_by_user_id);
      if (!id || !customerId || !addedByUserId) return null;

      return {
        id,
        customerId,
        addedByUserId,
        createdAt: asText(row.created_at),
      } satisfies RouteStopQueueRow;
    })
    .filter((row): row is RouteStopQueueRow => Boolean(row));
}

export async function loadPendingRouteStops(args: {
  userId: string;
  customers: CustomerSummary[];
}): Promise<PendingRouteStop[]> {
  const rows = await loadRouteStopQueueRows(args.userId);
  const customerById = new Map(args.customers.map((customer) => [customer.id, customer]));

  return rows
    .map((row) => {
      const customer = customerById.get(row.customerId);
      if (!customer) return null;
      return {
        ...row,
        customer,
      } satisfies PendingRouteStop;
    })
    .filter((row): row is PendingRouteStop => Boolean(row));
}
