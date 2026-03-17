import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RouteRunner from "@/components/workspace/RouteRunner";
import { requireStaff } from "@/lib/requireStaff";
import { loadRouteWorkspaceData } from "@/lib/routeWorkspace";

export default async function WorkspaceRouteRunnerPage({
  searchParams,
}: {
  searchParams?: Promise<{ customerId?: string }>;
}) {
  const staff = await requireStaff();
  const [{ customers, routeRepOptions }, params] = await Promise.all([loadRouteWorkspaceData(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Route Runner"
        description="Rep-focused stop runner for executing today’s route, capturing visit outcomes, and creating follow-up tasks from the field."
      />
      <RouteRunner
        customers={customers}
        routeRepOptions={routeRepOptions}
        currentUserId={staff.userId}
        focusCustomerId={params?.customerId}
      />
    </div>
  );
}
