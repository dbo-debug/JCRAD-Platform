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
  const [staff, { customers, metrics }, { territoryOptions, routeRepOptions }, params] = await Promise.all([
    requireStaff(),
    loadCustomerWorkspaceIndex({ includeArchived: true }),
    loadRouteReferenceData(),
    searchParams,
  ]);
  const pendingStops = await loadPendingRouteStops({ userId: staff.userId, customers });

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6">
      <AdminPageHeader
        title="Customers"
        description="Workflow-first customer workspace for daily follow-up, segmentation, and route prep. Google Sheets imports feed this system, but CRM records are now the source of truth."
        action={<HeaderActions isAdmin={staff.role === "admin"} />}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <ModeCard
          label="Work Queue"
          title="Follow-up and movement"
          detail={`${metrics.totalCustomers} total accounts • ${pendingStops.length} pending stops in play`}
          href="/workspace/customers?taskState=overdue_task&sort=activity_desc"
        />
        <ModeCard
          label="Segment Builder"
          title="Target and organize"
          detail={`${metrics.totalContacts} contacts • ${metrics.customersWithContacts} accounts with contact coverage`}
          href="/workspace/customers?savedView=pipeline&organizeBy=stage&sort=activity_desc"
        />
        <ModeCard
          label="Route Prep"
          title="Prep the field queue"
          detail={`${metrics.missingPrimaryContact} missing primary contacts • use route readiness and coordinate cleanup`}
          href="/workspace/customers?savedView=needs_coordinates&sort=activity_desc"
        />
      </section>
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
          routeReadiness: asQueryValue(params?.routeReadiness),
          orderState: asQueryValue(params?.orderState),
          organizeBy: asQueryValue(params?.organizeBy),
          sort: asQueryValue(params?.sort),
        }}
      />
    </div>
  );
}

function ModeCard({ label, title, detail, href }: { label: string; title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="rounded-[24px] border border-[#d7e6ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_30px_rgba(16,42,67,0.06)] transition hover:border-[#14b8a6] hover:bg-white">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#617d8c]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[#173543]">{title}</p>
      <p className="mt-2 text-sm text-[#5c7483]">{detail}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#0f766e]">Open mode</p>
    </Link>
  );
}

function HeaderActions({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin ? <CustomerGeocodeBatchButton /> : null}
      <Link
        href="/workspace/customers/import"
        className="inline-flex rounded-full border border-[#b9d5df] bg-white px-4 py-2 text-sm font-semibold text-[#21414d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
      >
        Import Activity
      </Link>
      <Link
        href="/workspace/customers/import"
        className="inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
      >
        New Import
      </Link>
    </div>
  );
}
