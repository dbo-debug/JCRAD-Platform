import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RouteRunner from "@/components/workspace/RouteRunner";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceRouteRunnerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const [{ customers, routeRepOptions, territoryOptions }, params] = await Promise.all([loadRouteWorkspaceData(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Route Runner"
        description="Rep-focused stop runner for executing today’s route, capturing visit outcomes, and creating follow-up tasks from the field."
      />
      <RouteRunner
        customers={customers}
        routeRepOptions={routeRepOptions}
        territoryOptions={territoryOptions}
        currentUserId={staff.userId}
        focusCustomerId={asQueryValue(params?.customerId) || undefined}
        initialFilters={{
          q: asQueryValue(params?.q),
          scope: asQueryValue(params?.scope) === "all" ? "all" : "mine",
          routeDay: asQueryValue(params?.routeDay),
          territory: asQueryValue(params?.territory),
          visitStatus: asQueryValue(params?.visitStatus),
          coordinateStatus: asQueryValue(params?.coordStatus),
          territorySort: asQueryValue(params?.territorySort),
          view: asQueryValue(params?.view) === "map" ? "map" : "list",
        }}
      />
    </div>
  );
}
