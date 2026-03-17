import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RoutePlannerIndex from "@/components/workspace/RoutePlannerIndex";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";

export default async function WorkspaceRoutesPage() {
  const { customers, routeRepOptions } = await loadRouteWorkspaceData();

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Routes"
        description="Phase 1 route planning for field reps. Use this operational board to stage daily stop lists by route day, territory, assigned rep, visit status, and priority."
      />
      <RoutePlannerIndex customers={customers} routeRepOptions={routeRepOptions} />
    </div>
  );
}
