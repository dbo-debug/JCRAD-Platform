import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffContext } from "@/lib/getStaffContext";
import { loadCustomerWorkspaceIndex, type CustomerSummary } from "@/lib/customerWorkspace";
import { canSalesAccessRoute, scopeRouteCustomersForStaff } from "@/lib/routeScope";
import { loadPendingRouteStops, type PendingRouteStop } from "@/lib/routeStopQueue";
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
  savedRoutes: SavedRouteSummary[];
  pendingStops: PendingRouteStop[];
};

export type SavedRouteSummary = {
  id: string;
  name: string;
  territoryCode: string | null;
  originName: string;
  originAddress: string;
  assignedUserId: string | null;
  assignedUserLabel: string | null;
  routeDate: string | null;
  status: string;
  plannedStartTime: string | null;
  maxStops: number | null;
  lunchMinutes: number | null;
  estimatedTotalMinutes: number | null;
  estimatedReturnTime: string | null;
  stopCount: number;
  createdByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SavedRouteStop = {
  id: string;
  routeId: string;
  customerId: string;
  stopOrder: number;
  plannedArrivalTime: string | null;
  plannedDepartureTime: string | null;
  estimatedDriveMinutesFromPrevious: number | null;
  estimatedVisitMinutes: number | null;
  locked: boolean;
  stopStatus: string;
  notes: string | null;
  customer: CustomerSummary;
};

export type SavedRouteDetail = Omit<SavedRouteSummary, "stopCount"> & {
  notes: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  estimatedDriveMinutes: number | null;
  estimatedVisitMinutes: number | null;
  stops: SavedRouteStop[];
};

export async function loadRouteWorkspaceData(staff: StaffContext): Promise<RouteWorkspaceData> {
  const [{ customers: allCustomers }, referenceData, savedRoutes, pendingQueueRows] = await Promise.all([
    loadCustomerWorkspaceIndex(),
    loadRouteReferenceData(),
    loadSavedRoutes(staff),
    loadRouteStopQueueRowsForScope(staff.userId),
  ]);
  const customers = scopeRouteCustomersForStaff({
    staff,
    customers: allCustomers,
    pendingQueueRows,
  });
  const pendingStops = await loadPendingRouteStops({ userId: staff.userId, customers: allCustomers });

  return {
    customers,
    ...referenceData,
    savedRoutes,
    pendingStops,
  };
}

export async function loadRouteReferenceData(): Promise<Pick<RouteWorkspaceData, "routeRepOptions" | "territoryOptions">> {
  const [routeRepOptions, territories] = await Promise.all([loadRouteRepOptions(), loadTerritories({ activeOnly: true })]);

  return {
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

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadSavedRoutes(staff?: StaffContext): Promise<SavedRouteSummary[]> {
  const supabase = createAdminClient();
  let routesQuery = supabase
    .from("routes")
    .select("id, name, territory_code, origin_name, origin_address, assigned_user_id, route_date, status, planned_start_time, max_stops, lunch_minutes, estimated_total_minutes, estimated_return_time, created_by, created_at, updated_at")
    .order("route_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(40);

  if (staff?.role === "sales") {
    routesQuery = routesQuery.or(`assigned_user_id.eq.${staff.userId},created_by.eq.${staff.userId}`);
  }

  const [routesRes, stopsRes, routeRepOptions] = await Promise.all([
    routesQuery,
    supabase.from("route_stops").select("route_id"),
    loadRouteRepOptions(),
  ]);

  if (routesRes.error) throw new Error(routesRes.error.message);
  if (stopsRes.error) throw new Error(stopsRes.error.message);

  const routeRepLabelMap = new Map(routeRepOptions.map((option) => [option.userId, option.label]));
  const stopCountByRouteId = new Map<string, number>();

  for (const row of (stopsRes.data || []) as Array<Record<string, unknown>>) {
    const routeId = asText(row.route_id);
    if (!routeId) continue;
    stopCountByRouteId.set(routeId, (stopCountByRouteId.get(routeId) || 0) + 1);
  }

  return ((routesRes.data || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const id = asText(row.id);
      const name = asText(row.name);
      const originName = asText(row.origin_name);
      const originAddress = asText(row.origin_address);
      if (!id || !name || !originName || !originAddress) return null;

      const assignedUserId = asText(row.assigned_user_id);
      const createdByUserId = asText(row.created_by);

      return {
        id,
        name,
        territoryCode: asText(row.territory_code),
        originName,
        originAddress,
        assignedUserId,
        assignedUserLabel: assignedUserId ? routeRepLabelMap.get(assignedUserId) || assignedUserId : null,
        routeDate: asText(row.route_date),
        status: asText(row.status) || "draft",
        plannedStartTime: asText(row.planned_start_time),
        maxStops: asNumber(row.max_stops),
        lunchMinutes: asNumber(row.lunch_minutes),
        estimatedTotalMinutes: asNumber(row.estimated_total_minutes),
        estimatedReturnTime: asText(row.estimated_return_time),
        stopCount: stopCountByRouteId.get(id) || 0,
        createdByUserId,
        createdAt: asText(row.created_at),
        updatedAt: asText(row.updated_at),
      } satisfies SavedRouteSummary;
    })
    .filter((route): route is SavedRouteSummary => Boolean(route));
}

export async function loadSavedRouteDetail(routeId: string, staff?: StaffContext): Promise<SavedRouteDetail | null> {
  const id = String(routeId || "").trim();
  if (!id) return null;

  const supabase = createAdminClient();
  const [routeRes, stopsRes, routeRepOptions, customerIndex] = await Promise.all([
    supabase
      .from("routes")
      .select(
        "id, name, territory_code, origin_name, origin_address, origin_latitude, origin_longitude, assigned_user_id, route_date, status, planned_start_time, max_stops, lunch_minutes, estimated_drive_minutes, estimated_visit_minutes, estimated_total_minutes, estimated_return_time, notes, created_by, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("route_stops")
      .select(
        "id, route_id, customer_id, stop_order, planned_arrival_time, planned_departure_time, estimated_drive_minutes_from_previous, estimated_visit_minutes, locked, stop_status, notes, created_at, updated_at"
      )
      .eq("route_id", id)
      .order("stop_order", { ascending: true }),
    loadRouteRepOptions(),
    loadCustomerWorkspaceIndex(),
  ]);

  if (routeRes.error) throw new Error(routeRes.error.message);
  if (stopsRes.error) throw new Error(stopsRes.error.message);

  const routeRow = routeRes.data as Record<string, unknown> | null;
  if (!routeRow) return null;
  if (
    staff &&
    !canSalesAccessRoute({
      staff,
      assignedUserId: asText(routeRow.assigned_user_id),
      createdByUserId: asText(routeRow.created_by),
    })
  ) {
    return null;
  }

  const routeRepLabelMap = new Map(routeRepOptions.map((option) => [option.userId, option.label]));
  const customerById = new Map(customerIndex.customers.map((customer) => [customer.id, customer]));

  const stops = ((stopsRes.data || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const customerId = asText(row.customer_id);
      const stopId = asText(row.id);
      const routeStopId = asText(row.route_id);
      if (!customerId || !stopId || !routeStopId) return null;

      const customer = customerById.get(customerId);
      if (!customer) return null;

      return {
        id: stopId,
        routeId: routeStopId,
        customerId,
        stopOrder: asNumber(row.stop_order) || 0,
        plannedArrivalTime: asText(row.planned_arrival_time),
        plannedDepartureTime: asText(row.planned_departure_time),
        estimatedDriveMinutesFromPrevious: asNumber(row.estimated_drive_minutes_from_previous),
        estimatedVisitMinutes: asNumber(row.estimated_visit_minutes),
        locked: row.locked === true,
        stopStatus: asText(row.stop_status) || "planned",
        notes: asText(row.notes),
        customer,
      } satisfies SavedRouteStop;
    })
    .filter((stop): stop is SavedRouteStop => Boolean(stop));

  const assignedUserId = asText(routeRow.assigned_user_id);
  const name = asText(routeRow.name);
  const originName = asText(routeRow.origin_name);
  const originAddress = asText(routeRow.origin_address);
  if (!name || !originName || !originAddress) return null;

  return {
    id,
    name,
    territoryCode: asText(routeRow.territory_code),
    originName,
    originAddress,
    originLatitude: asNumber(routeRow.origin_latitude),
    originLongitude: asNumber(routeRow.origin_longitude),
    assignedUserId,
    assignedUserLabel: assignedUserId ? routeRepLabelMap.get(assignedUserId) || assignedUserId : null,
    routeDate: asText(routeRow.route_date),
    status: asText(routeRow.status) || "draft",
    plannedStartTime: asText(routeRow.planned_start_time),
    maxStops: asNumber(routeRow.max_stops),
    lunchMinutes: asNumber(routeRow.lunch_minutes),
    estimatedDriveMinutes: asNumber(routeRow.estimated_drive_minutes),
    estimatedVisitMinutes: asNumber(routeRow.estimated_visit_minutes),
    estimatedTotalMinutes: asNumber(routeRow.estimated_total_minutes),
    estimatedReturnTime: asText(routeRow.estimated_return_time),
    notes: asText(routeRow.notes),
    createdByUserId: asText(routeRow.created_by),
    createdAt: asText(routeRow.created_at),
    updatedAt: asText(routeRow.updated_at),
    stops,
  };
}

async function loadRouteStopQueueRowsForScope(userId: string) {
  const normalizedUserId = asText(userId);
  if (!normalizedUserId) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("route_stop_queue")
    .select("id, customer_id, added_by_user_id, created_at")
    .eq("added_by_user_id", normalizedUserId);

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const details = String((error as { details?: unknown }).details || "").toLowerCase();
    const missingRelation =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      (message.includes("relation") && message.includes("does not exist")) ||
      message.includes("schema cache") ||
      (details.includes("relation") && details.includes("does not exist")) ||
      details.includes("schema cache");
    if (missingRelation) return [];
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const queueId = asText(row.id);
      const customerId = asText(row.customer_id);
      const addedByUserId = asText(row.added_by_user_id);
      if (!queueId || !customerId || !addedByUserId) return null;

      return {
        id: queueId,
        customerId,
        addedByUserId,
        createdAt: asText(row.created_at),
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        customerId: string;
        addedByUserId: string;
        createdAt: string | null;
      } => Boolean(row)
    );
}
