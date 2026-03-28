import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SavedRoutePlannerPanel from "@/components/workspace/SavedRoutePlannerPanel";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";
import { loadSegmentBuilderSettings } from "@/lib/segmentBuilderSettings";

export default async function WorkspaceRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  void searchParams;
  const [{ customers, routeRepOptions, territoryOptions, savedRoutes, pendingStops }, plannerDefaults] = await Promise.all([
    loadRouteWorkspaceData(staff),
    loadSegmentBuilderSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Routes"
        description="Route command center for pending stops, route build, preview, save, and saved-route handoff."
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
    </div>
  );
}
