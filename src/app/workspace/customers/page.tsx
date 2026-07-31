import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerGeocodeBatchButton from "@/components/workspace/CustomerGeocodeBatchButton";
import CustomerWorkspaceIndex from "@/components/workspace/CustomerWorkspaceIndex";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
import { loadPendingRouteStops } from "@/lib/routeStopQueue";
import { loadRouteReferenceData } from "@/lib/routeWorkspace";
import { requireStaff } from "@/lib/requireStaff";

function asQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function WorkspaceCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [staff, { customers }, { territoryOptions, routeRepOptions }, params] = await Promise.all([
    requireStaff(),
    loadCustomerWorkspaceIndex({ includeArchived: true }),
    loadRouteReferenceData(),
    searchParams,
  ]);
  const pendingStops = await loadPendingRouteStops({ userId: staff.userId, customers });

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Retail Accounts"
        description="Work buyer follow-up, pipeline movement, territory coverage, and route preparation from one account workspace."
        action={<HeaderActions isAdmin={staff.role === "admin"} />}
      />
      <CustomerWorkspaceIndex
        customers={customers}
        initialPendingStops={pendingStops}
        staffRole={staff.role}
        currentUserId={staff.userId}
        salesRepOptions={routeRepOptions}
        territoryOptions={territoryOptions}
        initialFilters={{
          q: asQueryValue(params?.q),
          savedView: asQueryValue(params?.savedView),
          source: asQueryValue(params?.source),
          importSource: asQueryValue(params?.importSource),
          hotLead: asQueryValue(params?.hotLead),
          taskState: asQueryValue(params?.taskState),
          territory: asQueryValue(params?.territory),
          owner: asQueryValue(params?.owner),
          status: asQueryValue(params?.status),
          stage: asQueryValue(params?.stage),
          contactCoverage: asQueryValue(params?.contactCoverage),
          orderState: asQueryValue(params?.orderState),
          organizeBy: asQueryValue(params?.organizeBy),
          sort: asQueryValue(params?.sort),
        }}
      />
    </div>
  );
}

function HeaderActions({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/workspace/customers/new"
        className="inline-flex min-h-11 items-center rounded-lg bg-[var(--workspace-primary)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-black"
      >
        Add Retail Shop
      </Link>
      <Link
        href="/workspace/customers/import"
        className="inline-flex min-h-11 items-center rounded-lg border border-[var(--workspace-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--workspace-text)] transition hover:bg-[var(--workspace-surface-muted)]"
      >
        Import
      </Link>
      {isAdmin ? (
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-[var(--workspace-border)] bg-white px-4 text-sm font-semibold text-[var(--workspace-text-secondary)] transition hover:bg-[var(--workspace-surface-muted)]">
            More
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--workspace-border)] bg-white p-3 shadow-[var(--workspace-shadow)]">
            <p className="mb-2 text-xs font-semibold text-[var(--workspace-muted)]">Geocoding utilities</p>
            <CustomerGeocodeBatchButton />
          </div>
        </details>
      ) : null}
    </div>
  );
}
