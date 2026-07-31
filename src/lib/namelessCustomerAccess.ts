import { NAMELESS_WORKSPACE_KEY } from "@/lib/namelessWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function isNamelessCustomer(customerId: string) {
  const id = String(customerId || "").trim();
  if (!id) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id, workspace_key")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const workspaceKey = String(data?.workspace_key || "").trim().toLowerCase();
  return Boolean(data?.id) && (!workspaceKey || workspaceKey === NAMELESS_WORKSPACE_KEY);
}

export async function filterNamelessCustomerIds(customerIds: string[]) {
  const ids = Array.from(new Set(customerIds.map((value) => String(value || "").trim()).filter(Boolean)));
  if (ids.length === 0) return new Set<string>();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id, workspace_key")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Set(
    ((data || []) as Array<{ id?: string | null; workspace_key?: string | null }>)
      .filter((row) => {
        const workspaceKey = String(row.workspace_key || "").trim().toLowerCase();
        return !workspaceKey || workspaceKey === NAMELESS_WORKSPACE_KEY;
      })
      .map((row) => String(row.id || ""))
      .filter(Boolean)
  );
}
