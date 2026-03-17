import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerWorkspaceIndex from "@/components/workspace/CustomerWorkspaceIndex";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";
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
    loadCustomerWorkspaceIndex(),
    loadRouteReferenceData(),
    searchParams,
  ]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 2xl:max-w-[1500px]">
      <AdminPageHeader
        title="Customers"
        description="CRM workspace for account ownership, contact coverage, pipeline management, and sales follow-up. Google Sheets imports feed this system, but CRM records are now the source of truth."
        action={<HeaderActions />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Customers" value={metrics.totalCustomers} />
        <MetricCard label="Total Contacts" value={metrics.totalContacts} />
        <MetricCard label="With Contacts" value={metrics.customersWithContacts} />
        <MetricCard label="Missing Primary Contact" value={metrics.missingPrimaryContact} />
        <MetricCard label="Without Contacts" value={metrics.customersWithoutContacts} />
      </section>
      <CustomerWorkspaceIndex
        customers={customers}
        staffRole={staff.role}
        salesRepOptions={routeRepOptions}
        territoryOptions={territoryOptions}
        initialFilters={{
          q: asQueryValue(params?.q),
          savedView: asQueryValue(params?.savedView),
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-[#d7e6ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_30px_rgba(16,42,67,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#617d8c]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}

function HeaderActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
