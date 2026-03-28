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
        description="Operational route flow from pending stops to draft route to saved route handoff."
      />
      <section className="grid gap-4 lg:grid-cols-3">
        <StageCard
          step="Step 1"
          title="Pending Stops"
          description="Queued stop candidates staged from the customer workspace."
        />
        <StageCard
          step="Step 2"
          title="Draft Route"
          description="Build, sequence, time, and validate the active route before saving."
        />
        <StageCard
          step="Step 3"
          title="Saved Routes"
          description="Planned routes that are ready for edit, reassignment, runner handoff, or execution."
        />
      </section>
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

function StageCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-[#d7e6ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_30px_rgba(16,42,67,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#617d8c]">{step}</p>
      <p className="mt-2 text-xl font-semibold text-[#173543]">{title}</p>
      <p className="mt-2 text-sm text-[#5c7483]">{description}</p>
    </div>
  );
}
