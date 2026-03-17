import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RoutePlannerIndex from "@/components/workspace/RoutePlannerIndex";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const [params, { customers, routeRepOptions, territoryOptions }] = await Promise.all([searchParams, loadRouteWorkspaceData()]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Routes"
        description="Phase 1 route planning for field reps. Use this operational board to stage daily stop lists by route day, territory, assigned rep, visit status, and priority."
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
