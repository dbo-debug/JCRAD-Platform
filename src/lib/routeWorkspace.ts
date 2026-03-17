import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { formatTerritoryOptionLabel, loadTerritories } from "@/lib/territories";

export type RouteRepOption = {
  userId: string;
  label: string;
};

export type TerritoryOption = {
  value: string;
  label: string;
  routeDayDefault: string | null;
};

export type RouteWorkspaceData = {
  customers: CustomerSummary[];
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
};

export async function loadRouteWorkspaceData(): Promise<RouteWorkspaceData> {
  const [{ customers }, routeRepOptions, territories] = await Promise.all([loadCustomerWorkspaceIndex(), loadRouteRepOptions(), loadTerritories({ activeOnly: true })]);

  return {
    customers,
    routeRepOptions,
    territoryOptions: territories.map((territory) => ({
      value: territory.code,
      label: formatTerritoryOptionLabel(territory),
      routeDayDefault: territory.routeDayDefault,
    })),
  };
}

async function loadRouteRepOptions(): Promise<RouteRepOption[]> {
  const supabase = createAdminClient();
  const [profilesRes, authUsersRes] = await Promise.all([
    supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]),
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

      const baseLabel = String(profile.company_name || authEmailById.get(userId) || userId).trim();
      const email = authEmailById.get(userId);

      return {
        userId,
        label: email ? `${baseLabel} (${email})` : baseLabel,
      } satisfies RouteRepOption;
    })
    .filter((option): option is RouteRepOption => Boolean(option))
    .sort((left, right) => left.label.localeCompare(right.label));
}
