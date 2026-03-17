import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";

export type RouteRepOption = {
  userId: string;
  label: string;
};

export type RouteWorkspaceData = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
};

export async function loadRouteWorkspaceData(): Promise<RouteWorkspaceData> {
  const [{ customers }, routeRepOptions] = await Promise.all([loadCustomerWorkspaceIndex(), loadRouteRepOptions()]);

  return {
    customers,
    routeRepOptions,
  };
}

async function loadRouteRepOptions(): Promise<RouteRepOption[]> {
  const supabase = createAdminClient();
  const [profilesRes, authUsersRes] = await Promise.all([
    supabase.from("profiles").select("id, role, company_name, full_name").in("role", ["admin", "sales"]),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (profilesRes.error) {
    throw new Error(profilesRes.error.message);
  }
  if (authUsersRes.error) {
    throw new Error(authUsersRes.error.message);
  }

  const authEmailById = new Map(
    (authUsersRes.data?.users || []).map((user: { id?: string; email?: string | null }) => [
      String(user.id || ""),
      String(user.email || "").trim() || null,
    ] as const)
  );

  return ((profilesRes.data || []) as Array<Record<string, unknown>>)
    .map((profile) => {
      const userId = String(profile.id || "").trim();
      if (!userId) return null;

      const baseLabel = String(profile.full_name || profile.company_name || authEmailById.get(userId) || userId).trim();
      const email = authEmailById.get(userId);

      return {
        userId,
        label: email ? `${baseLabel} (${email})` : baseLabel,
      } satisfies RouteRepOption;
    })
    .filter((option): option is RouteRepOption => Boolean(option))
    .sort((left, right) => left.label.localeCompare(right.label));
}
