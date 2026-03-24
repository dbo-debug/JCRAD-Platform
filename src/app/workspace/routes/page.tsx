import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RoutePlannerIndex from "@/components/workspace/RoutePlannerIndex";
import SavedRoutePlannerPanel from "@/components/workspace/SavedRoutePlannerPanel";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";
import { loadSegmentBuilderSettings } from "@/lib/segmentBuilderSettings";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const [params, { customers, routeRepOptions, territoryOptions, savedRoutes, pendingStops }, plannerDefaults] = await Promise.all([
    searchParams,
    loadRouteWorkspaceData(staff),
    loadSegmentBuilderSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Routes"
        description="Route command center for field reps. Build daily routes from route-ready stops, review the map and itinerary, and hand saved plans into the runner."
      />
      <SavedRoutePlannerPanel
        customers={customers}
        currentUserId={staff.userId}
        staffRole={staff.role}
        pendingStops={pendingStops}
        routeRepOptions={routeRepOptions}
        territoryOptions={territoryOptions}
        savedRoutes={savedRoutes}
        plannerDefaults={plannerDefaults}
      />
      <RoutePlannerIndex
        customers={customers}
        routeRepOptions={routeRepOptions}
        territoryOptions={territoryOptions}
        currentUserId={staff.userId}
        initialFilters={{
          q: asQueryValue(params?.q),
          routeDay: asQueryValue(params?.routeDay),
          territory: asQueryValue(params?.territory),
          rep: asQueryValue(params?.rep),
          visitStatus: asQueryValue(params?.visitStatus),
          priority: asQueryValue(params?.priority),
          coordinateStatus: asQueryValue(params?.coordStatus),
          territorySort: asQueryValue(params?.territorySort),
          territoryFocus: asQueryValue(params?.territoryFocus),
          view: asQueryValue(params?.view) === "map" ? "map" : "list",
        }}
      />
    </div>
  );
}
