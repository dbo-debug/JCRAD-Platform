import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerDetailManager from "@/components/workspace/CustomerDetailManager";
import { loadCustomerWorkspaceDetail } from "@/lib/customerWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/requireStaff";

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Pending";
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function matchLabel(value: string): string {
  if (value === "account") return "Linked by account";
  if (value === "email") return "Legacy email match";
  return "Legacy company match";
}

export default async function WorkspaceCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const detail = await loadCustomerWorkspaceDetail(id);
  if (!detail) notFound();

  const supabase = createAdminClient();
  const [salesProfilesRes, authUsersRes] = await Promise.all([
    supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const authEmailById = new Map(
    (authUsersRes.data?.users || []).map((user) => [String(user.id || ""), String(user.email || "").trim() || null] as const)
  );
  const salesOptions = ((salesProfilesRes.data || []) as Array<Record<string, unknown>>).map((profile) => {
    const userId = String(profile.id || "");
    const label = String(profile.company_name || authEmailById.get(userId) || userId);
    const email = authEmailById.get(userId);
    return {
      userId,
      label: email ? `${label} (${email})` : label,
    };
  });
  const primaryContact = detail.contacts.find((contact) => contact.isPrimary) || null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={detail.customer.name}
        description="Operational customer account workspace for staff. Relationship fields are editable here while estimates, orders, files, and submissions remain read-only."
        action={
          <Link
            href="/workspace/customers"
            className="inline-flex rounded-full border border-[#cfdde5] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Back to Customers
          </Link>
        }
      />

      <section className="grid gap-4 lg:grid-cols-5">
        <SummaryCard label="Status" value={detail.customer.status} />
        <SummaryCard label="Stage" value={detail.customer.stage || "Not set"} />
        <SummaryCard label="Assigned Sales" value={detail.customer.assignedSalesName || "Unassigned"} helper={detail.customer.assignedSalesEmail || undefined} />
        <SummaryCard label="Primary Email" value={detail.customer.primaryContactEmail || "Not set"} />
        <SummaryCard label="Last Activity" value={formatDate(detail.customer.lastActivityAt)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <CustomerDetailManager
          customerId={detail.customer.id}
          companyName={detail.customer.name}
          status={detail.customer.status}
          stage={detail.customer.stage}
          primaryContactEmail={detail.customer.primaryContactEmail}
          assignedSalesUserId={detail.customer.assignedSalesUserId}
          staffRole={staff.role}
          salesOptions={salesOptions}
          primaryContact={primaryContact}
        />

        <Panel title="Activity Timeline">
          <div className="space-y-3">
            {detail.activity.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <p className="font-semibold text-[#173543]">{item.summary}</p>
                <p className="mt-1 text-sm text-[#4a6575]">
                  {item.actorName || "System"} • {formatDate(item.createdAt)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-[#6b8593]">
                  {item.activityType}{item.entityType ? ` • ${item.entityType}` : ""}
                </p>
              </div>
            ))}
            {detail.activity.length === 0 ? <EmptyState label="No customer activity yet." /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Contacts">
          <div className="space-y-3">
            {detail.contacts.map((contact) => (
              <div key={contact.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#173543]">{contact.name}</p>
                  {contact.isPrimary ? (
                    <span className="rounded-full border border-[#bde8e4] bg-[#e9fbf9] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0f766e]">
                      Primary
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[#4a6575]">{contact.title || "No title"}</p>
                <p className="text-sm text-[#4a6575]">{contact.email || "No email"}{contact.phone ? ` • ${contact.phone}` : ""}</p>
              </div>
            ))}
            {detail.contacts.length === 0 ? <EmptyState label="No contacts found." /> : null}
          </div>
        </Panel>

        <Panel title="Customer Users">
          <div className="space-y-3">
            {detail.users.map((user) => (
              <div key={user.userId} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#173543]">{user.fullName}</p>
                  <span className="rounded-full border border-[#d7e6ed] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4f6877]">
                    {user.membershipRole}
                  </span>
                  {user.isPrimary ? (
                    <span className="rounded-full border border-[#bde8e4] bg-[#e9fbf9] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0f766e]">
                      Primary
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[#4a6575]">{user.email || "No email"} • {user.status}</p>
              </div>
            ))}
            {detail.users.length === 0 ? <EmptyState label="No mapped users found." /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-1">
        <Panel title="Estimates">
          <RecordTable
            rows={detail.estimates}
            columns={[
              { key: "id", label: "Estimate" },
              { key: "status", label: "Status" },
              { key: "total", label: "Total", format: formatMoney },
              { key: "updatedAt", label: "Updated", format: formatDate },
            ]}
          />
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Orders">
          <RecordTable
            rows={detail.orders}
            columns={[
              { key: "id", label: "Order" },
              { key: "status", label: "Status" },
              { key: "total", label: "Total", format: formatMoney },
              { key: "createdAt", label: "Created", format: formatDate },
            ]}
          />
        </Panel>

        <Panel title="Packaging Submissions">
          <RecordTable
            rows={detail.packagingSubmissions}
            columns={[
              { key: "id", label: "Submission" },
              { key: "category", label: "Category" },
              { key: "status", label: "Status" },
              { key: "createdAt", label: "Created", format: formatDate },
            ]}
          />
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Customer Documents">
          <div className="space-y-3">
            {detail.documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <p className="font-semibold text-[#173543]">
                  {String(doc.title || doc.file_name || doc.name || `Document ${doc.id.slice(0, 8)}`)}
                </p>
                <p className="mt-1 text-sm text-[#4a6575]">
                  {String(doc.document_type || doc.kind || "Document")} • {formatDate(String(doc.updatedAt || doc.createdAt || ""))}
                </p>
              </div>
            ))}
            {detail.documents.length === 0 ? <EmptyState label="No customer documents linked yet." /> : null}
          </div>
        </Panel>

        <Panel title="Internal Notes">
          <div className="space-y-3">
            {detail.notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-[#173543]">{note.note}</p>
                <p className="mt-2 text-xs text-[#5d7685]">
                  {note.authorName || "Unknown author"} • {formatDate(note.createdAt)}
                </p>
              </div>
            ))}
            {detail.notes.length === 0 ? <EmptyState label="No internal notes yet." /> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#173543]">{value}</p>
      {helper ? <p className="mt-1 text-sm text-[#4a6575]">{helper}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#173543]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-6 text-sm text-[#5d7685]">{label}</div>;
}

function RecordTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, unknown> & { id: string; matchType: string }>;
  columns: Array<{ key: string; label: string; format?: (value: unknown) => string }>;
}) {
  return rows.length > 0 ? (
    <div className="overflow-hidden rounded-xl border border-[#dbe9ef]">
      <table className="min-w-full divide-y divide-[#e6eef3] text-sm">
        <thead className="bg-[#f7fbfd] text-left text-[#5b7382]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-semibold">
                {column.label}
              </th>
            ))}
            <th className="px-4 py-3 font-semibold">Linkage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef3f6]">
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-[#4f6877]">
                  {column.key === "id" ? (
                    <span className="font-semibold text-[#173543]">#{String(row[column.key] || "").slice(0, 8)}</span>
                  ) : column.format ? (
                    column.format(row[column.key])
                  ) : (
                    String(row[column.key] || "-")
                  )}
                </td>
              ))}
              <td className="px-4 py-3">
                <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#4f6877]">
                  {matchLabel(String(row.matchType || ""))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState label="No linked records found." />
  );
}
