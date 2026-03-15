import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadCustomerWorkspaceIndex } from "@/lib/customerWorkspace";

function formatDate(value: string | null): string {
  if (!value) return "No activity";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "No activity";
  return new Date(parsed).toLocaleDateString();
}

export default async function WorkspaceCustomersPage() {
  const customers = await loadCustomerWorkspaceIndex();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customers"
        description="Read-only internal customer workspace for admin and sales users. Linked records prefer customer_account_id and fall back to legacy matching only when needed."
        action={
          <Link
            href="/workspace/customers/import"
            className="inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Import from Google Sheets
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Customers" value={customers.length} />
        <MetricCard label="With Estimates" value={customers.filter((row) => row.counts.estimates > 0).length} />
        <MetricCard label="With Orders" value={customers.filter((row) => row.counts.orders > 0).length} />
        <MetricCard label="Need Backfill" value={customers.filter((row) => row.counts.estimates + row.counts.orders + row.counts.packagingSubmissions > 0 && !row.primaryContactEmail).length} />
      </section>

      <div className="overflow-hidden rounded-2xl border border-[#dbe9ef] bg-white shadow-sm">
        <table className="min-w-full divide-y divide-[#e6eef3] text-sm">
          <thead className="bg-[#f7fbfd] text-left text-[#5b7382]">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Primary Contact</th>
              <th className="px-4 py-3 font-semibold">Assigned Sales</th>
              <th className="px-4 py-3 font-semibold">Linked Records</th>
              <th className="px-4 py-3 font-semibold">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f6]">
            {customers.map((customer) => (
              <tr key={customer.id} className="align-top">
                <td className="px-4 py-4">
                  <Link href={`/workspace/customers/${customer.id}`} className="font-semibold text-[#173543] hover:text-[#0f766e]">
                    {customer.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-[#4a6575]">
                      {customer.status}
                    </span>
                    <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-[#4a6575]">
                      {customer.memberUsers.length} user{customer.memberUsers.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-[#4f6877]">
                  {customer.primaryContacts.length > 0 ? (
                    customer.primaryContacts.map((contact) => (
                      <div key={contact.id} className="mb-1 last:mb-0">
                        <div className="font-medium text-[#173543]">{contact.name}</div>
                        <div>{contact.email || customer.primaryContactEmail || "No email"}</div>
                      </div>
                    ))
                  ) : (
                    <div>
                      <div className="font-medium text-[#173543]">No primary contact</div>
                      <div>{customer.primaryContactEmail || "No email on customer record"}</div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-[#4f6877]">
                  <div className="font-medium text-[#173543]">{customer.assignedSalesName || "Unassigned"}</div>
                  <div>{customer.assignedSalesEmail || "No assignee email"}</div>
                </td>
                <td className="px-4 py-4 text-[#4f6877]">
                  <div>Estimates: {customer.counts.estimates}</div>
                  <div>Orders: {customer.counts.orders}</div>
                  <div>Packaging: {customer.counts.packagingSubmissions}</div>
                  <div>Docs: {customer.counts.documents}</div>
                </td>
                <td className="px-4 py-4 text-[#4f6877]">{formatDate(customer.lastActivityAt)}</td>
              </tr>
            ))}
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#5b7382]">
                  No customers found in the new workspace schema.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}
