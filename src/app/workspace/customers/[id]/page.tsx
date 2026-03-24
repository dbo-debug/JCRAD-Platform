import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerDetailManager from "@/components/workspace/CustomerDetailManager";
import { loadCustomerWorkspaceDetail } from "@/lib/customerWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTerritoryOptionLabel, loadTerritories } from "@/lib/territories";
import { requireStaff } from "@/lib/requireStaff";

function formatDate(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  const parsed = Date.parse(text);
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

function getActivityNotes(details: Record<string, unknown> | null): string | null {
  const notes = details?.notes;
  const text = typeof notes === "string" ? notes.trim() : "";
  return text || null;
}

function hasHotLeadFlag(details: Record<string, unknown> | null): boolean {
  const value = details?.hot_lead;
  return value === true || value === "true" || value === 1 || value === "1";
}

function formatSourceLabel(value: string | null | undefined, fallback = "Unspecified"): string {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAddress(customer: {
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  const lineOne = [customer.address1, customer.address2].filter(Boolean).join(", ");
  const lineTwo = [customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ");
  return [lineOne, lineTwo].filter(Boolean).join(" • ") || null;
}

export default async function WorkspaceCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const detail = await loadCustomerWorkspaceDetail(id);
  if (!detail) notFound();

  const supabase = createAdminClient();
  const [salesProfilesRes, authUsersRes, territories] = await Promise.all([
    supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    loadTerritories({ activeOnly: true }),
  ]);

  const authEmailById = new Map(
    (authUsersRes.data?.users || []).map((user: { id?: string; email?: string | null }) => [
      String(user.id || ""),
      String(user.email || "").trim() || null,
    ] as const)
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
  const territoryOptions = territories.map((territory) => ({
    code: territory.code,
    label: formatTerritoryOptionLabel(territory),
    routeDayDefault: territory.routeDayDefault,
  }));
  const address = formatAddress(detail.customer);

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        {detail.customer.isHallOfFlowersLead ? <HeaderBadge tone="event" label="Hall of Flowers" /> : null}
        {detail.customer.isHotLead ? <HeaderBadge tone="hot" label="Hot Lead" /> : null}
        {detail.customer.source ? <HeaderBadge label={`Source ${formatSourceLabel(detail.customer.source)}`} /> : null}
        {detail.customer.importSource ? <HeaderBadge label={`Import ${formatSourceLabel(detail.customer.importSource)}`} /> : null}
        <HeaderBadge
          tone={detail.customer.hasOpenTask ? (detail.customer.overdueTaskCount > 0 ? "warn" : "ok") : "neutral"}
          label={
            detail.customer.hasOpenTask
              ? detail.customer.overdueTaskCount > 0
                ? `${detail.customer.overdueTaskCount} overdue task${detail.customer.overdueTaskCount === 1 ? "" : "s"}`
                : detail.customer.nextTaskDueAt
                  ? `Follow-up due ${formatDate(detail.customer.nextTaskDueAt)}`
                  : `${detail.customer.openTaskCount} open task${detail.customer.openTaskCount === 1 ? "" : "s"}`
              : "No open follow-up task"
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Status" value={detail.customer.status} />
        <SummaryCard label="Stage" value={detail.customer.stage || "Not set"} />
        <SummaryCard label="Assigned Sales" value={detail.customer.assignedSalesName || "Unassigned"} helper={detail.customer.assignedSalesEmail || undefined} />
        <SummaryCard label="City" value={detail.customer.city || "Not set"} />
        <SummaryCard label="Source" value={formatSourceLabel(detail.customer.source)} helper={detail.customer.importSource ? `Import ${formatSourceLabel(detail.customer.importSource)}` : undefined} />
        <SummaryCard label="Primary Email" value={detail.customer.primaryContactEmail || "Not set"} />
        <SummaryCard label="Last Activity" value={formatDate(detail.customer.lastActivityAt)} />
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {["Overview", "Activity", "Tasks", "Routing", "Notes"].map((tab, index) => (
            <span
              key={tab}
              className={[
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium",
                index === 0 ? "border-[#14b8a6] bg-[#effcf9] text-[#0f766e]" : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]",
              ].join(" ")}
            >
              {tab}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
        <CustomerDetailManager
          customerId={detail.customer.id}
          companyName={detail.customer.name}
          status={detail.customer.status}
          stage={detail.customer.stage}
          primaryContactEmail={detail.customer.primaryContactEmail}
          mainPhone={detail.customer.mainPhone}
          assignedSalesUserId={detail.customer.assignedSalesUserId}
          territoryCode={detail.customer.territoryCode}
          routeDay={detail.customer.routeDay}
          assignedRouteRepUserId={detail.customer.assignedRouteRepUserId}
          routePriority={detail.customer.routePriority}
          visitStatus={detail.customer.visitStatus}
          lastVisitAt={detail.customer.lastVisitAt}
          nextVisitDueAt={detail.customer.nextVisitDueAt}
          latitude={detail.customer.latitude}
          longitude={detail.customer.longitude}
          address1={detail.customer.address1}
          address2={detail.customer.address2}
          city={detail.customer.city}
          state={detail.customer.state}
          postalCode={detail.customer.postalCode}
          geocodeStatus={detail.customer.geocodeStatus}
          geocodedAddress={detail.customer.geocodedAddress}
          lastGeocodedAt={detail.customer.lastGeocodedAt}
          geocodeProvider={detail.customer.geocodeProvider}
          address={address}
          staffRole={staff.role}
          salesOptions={salesOptions}
          routeRepOptions={salesOptions}
          territoryOptions={territoryOptions}
          primaryContact={primaryContact}
        />

        <Panel title="Activity Timeline" id="customer-activity-timeline">
          <div className="space-y-2.5">
            {detail.activity.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
            {detail.activity.length === 0 ? <EmptyState label="No customer activity yet." /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.95fr]">
        <Panel title="Contacts">
          <div className="space-y-2.5">
            {detail.contacts.map((contact) => (
              <div key={contact.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
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
          <div className="space-y-2.5">
            {detail.users.map((user) => (
              <div key={user.userId} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
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

      <section className="grid gap-3 xl:grid-cols-1">
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

      <section className="grid gap-3 xl:grid-cols-2">
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

      <section className="grid gap-3 2xl:grid-cols-3">
        <Panel title="Task List">
          <div className="space-y-2.5">
            {detail.tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#173543]">{task.title}</p>
                  <span className="rounded-full border border-[#d7e6ed] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4f6877]">
                    {task.status}
                  </span>
                  {task.priority !== null ? (
                    <span className="rounded-full border border-[#f1ddad] bg-[#fff9eb] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a6b00]">
                      Priority {task.priority}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[#4a6575]">
                  {task.assignedUserName || "Unassigned"}
                  {task.dueDate ? ` • Due ${formatDate(task.dueDate)}` : " • No due date"}
                </p>
                <p className="mt-1 text-xs text-[#5d7685]">
                  Created {formatDate(task.createdAt)}
                  {task.completedAt ? ` • Completed ${formatDate(task.completedAt)}` : ""}
                </p>
              </div>
            ))}
            {detail.tasks.length === 0 ? <EmptyState label="No customer tasks yet." /> : null}
          </div>
        </Panel>

        <div id="customer-documents" className="scroll-mt-24">
          <Panel title="Customer Documents">
            <div className="space-y-2.5">
              {detail.documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
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
        </div>

        <Panel title="Internal Notes">
          <div className="space-y-2.5">
            {detail.notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
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
    <div className="min-w-0 rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p title={value} className="mt-1.5 truncate text-base font-semibold text-[#173543]">{value}</p>
      {helper ? <p title={helper} className="mt-1 truncate text-sm text-[#4a6575]">{helper}</p> : null}
    </div>
  );
}

function HeaderBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "ok" | "warn" | "event" | "hot";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : tone === "event"
          ? "border-[#f1ddad] bg-[#fff9eb] text-[#8a5b00]"
          : tone === "hot"
            ? "border-[#ffd3cf] bg-[#fff2f0] text-[#b44b40]"
            : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  return (
    <span
      title={label}
      className={["inline-flex max-w-full min-w-0 items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}
    >
      {label}
    </span>
  );
}

function ActivityCard({
  item,
}: {
  item: {
    summary: string;
    actorName: string | null;
    createdAt: string | null;
    activityType: string;
    entityType: string | null;
    details: Record<string, unknown> | null;
  };
}) {
  const notes = getActivityNotes(item.details);
  const hotLead = hasHotLeadFlag(item.details);

  return (
    <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-[#173543]">{item.summary}</p>
        {hotLead ? <HeaderBadge tone="hot" label="Hot Lead" /> : null}
        {item.activityType === "event_quick_add" ? <HeaderBadge tone="event" label="Hall of Flowers" /> : null}
      </div>
      <p className="mt-1 text-sm text-[#4a6575]">
        {item.actorName || "System"} • {formatDate(item.createdAt)}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-[#6b8593]">
        {item.activityType}{item.entityType ? ` • ${item.entityType}` : ""}
      </p>
      {notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#4a6575]">{notes}</p> : null}
    </div>
  );
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-3 py-4 text-sm text-[#5d7685]">{label}</div>;
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
              <th key={column.key} className="px-3 py-2.5 font-semibold">
                {column.label}
              </th>
            ))}
            <th className="px-3 py-2.5 font-semibold">Linkage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef3f6]">
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2.5 text-[#4f6877]">
                  {column.key === "id" ? (
                    <span className="font-semibold text-[#173543]">#{String(row[column.key] || "").slice(0, 8)}</span>
                  ) : column.format ? (
                    column.format(row[column.key])
                  ) : (
                    String(row[column.key] || "-")
                  )}
                </td>
              ))}
              <td className="px-3 py-2.5">
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
