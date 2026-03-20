import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SourceWorkspaceIndex from "@/components/workspace/SourceWorkspaceIndex";
import { requireStaff } from "@/lib/requireStaff";
import { loadSourceWorkspaceIndex } from "@/lib/sourceWorkspace";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceSourcesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, { sources, metrics }, params] = await Promise.all([requireStaff(), loadSourceWorkspaceIndex(), searchParams]);

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Sources"
        description="Procurement workspace for suppliers, inbound leads, sourcing follow-up, and buyer coordination."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Sources" value={metrics.totalSources} />
        <MetricCard label="Active Sources" value={metrics.activeSources} />
        <MetricCard label="With Contact Email" value={metrics.withContactEmail} />
        <MetricCard label="Open Tasks" value={metrics.openTasks} />
        <MetricCard label="Overdue Tasks" value={metrics.overdueTasks} />
      </section>

      <SourceWorkspaceIndex
        sources={sources}
        initialFilters={{
          q: asQueryValue(params?.q),
          savedView: asQueryValue(params?.savedView),
          sourceType: asQueryValue(params?.sourceType),
          status: asQueryValue(params?.status),
          stage: asQueryValue(params?.stage),
          owner: asQueryValue(params?.owner),
          taskState: asQueryValue(params?.taskState),
          sort: asQueryValue(params?.sort),
        }}
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[#d7e6ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_30px_rgba(16,42,67,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#617d8c]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}
