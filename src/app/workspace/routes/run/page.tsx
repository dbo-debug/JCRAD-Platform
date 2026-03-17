import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RouteRunner from "@/components/workspace/RouteRunner";
import SavedRouteRunner from "@/components/workspace/SavedRouteRunner";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData, loadSavedRouteDetail } from "@/lib/routeWorkspace";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceRouteRunnerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const [params] = await Promise.all([searchParams]);
  const focusCustomerId = asQueryValue(params?.customerId) || undefined;
  const routeId = asQueryValue(params?.routeId) || undefined;
  const [workspaceData, savedRoute] = await Promise.all([loadRouteWorkspaceData(), routeId ? loadSavedRouteDetail(routeId) : Promise.resolve(null)]);
  const { customers, routeRepOptions, territoryOptions } = workspaceData;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Route Runner"
        description="Rep-focused stop runner for executing today’s route, capturing visit outcomes, and creating follow-up tasks from the field."
      />
      {savedRoute ? (
        <SavedRouteRunner route={savedRoute} />
      ) : (
        <RouteRunner
          customers={customers}
          routeRepOptions={routeRepOptions}
          territoryOptions={territoryOptions}
          currentUserId={staff.userId}
          focusCustomerId={focusCustomerId}
          initialFilters={{
            q: asQueryValue(params?.q),
            scope: focusCustomerId ? "all" : asQueryValue(params?.scope) === "all" ? "all" : "mine",
            routeDay: asQueryValue(params?.routeDay),
            territory: asQueryValue(params?.territory),
            visitStatus: asQueryValue(params?.visitStatus),
            coordinateStatus: asQueryValue(params?.coordStatus),
            territorySort: asQueryValue(params?.territorySort),
            territoryFocus: asQueryValue(params?.territoryFocus),
            view: asQueryValue(params?.view) === "map" ? "map" : "list",
          }}
        />
      )}
    </div>
  );
}
