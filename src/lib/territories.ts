import { createAdminClient } from "@/lib/supabase/admin";

export type TerritoryRecord = {
  code: string;
  name: string;
  regionGroup: string | null;
  routeDayDefault: string | null;
  isActive: boolean;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export function formatTerritoryOptionLabel(territory: TerritoryRecord) {
  return `${territory.code} - ${territory.name}`;
}

export async function loadTerritories({ activeOnly = false }: { activeOnly?: boolean } = {}): Promise<TerritoryRecord[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("territories")
    .select("code, name, region_group, route_day_default, is_active")
    .order("region_group", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const code = asText(row.code);
      const name = asText(row.name);
      if (!code || !name) return null;

      return {
        code,
        name,
        regionGroup: asText(row.region_group),
        routeDayDefault: asText(row.route_day_default),
        isActive: row.is_active !== false,
      } satisfies TerritoryRecord;
    })
    .filter((territory): territory is TerritoryRecord => Boolean(territory));
}
