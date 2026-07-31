import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerDetailManager from "@/components/workspace/CustomerDetailManager";
import CustomerTaskCompleteButton from "@/components/workspace/CustomerTaskCompleteButton";
import LocalDateTime from "@/components/workspace/LocalDateTime";
import RetailSalesPanel, {
  RetailSalesActivityComposer,
  RetailSalesSetupPanel,
} from "@/components/workspace/RetailSalesPanel";
import { loadCustomerWorkspaceDetail } from "@/lib/customerWorkspace";
import { loadRetailSalesAccountData } from "@/lib/retailSalesWorkspace";
import { requireStaff } from "@/lib/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTerritoryOptionLabel, loadTerritories } from "@/lib/territories";

function formatDate(value: unknown): string {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : "Unknown";
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "Pending";
}

function labelize(value: string | null | undefined, fallback = "Not set") {
  const text = String(value || "").trim();
  return text
    ? text.split(/[_\s-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : fallback;
}

function formatAddress(customer: { address1: string | null; address2: string | null; city: string | null; state: string | null; postalCode: string | null }) {
  const lineOne = [customer.address1, customer.address2].filter(Boolean).join(", ");
  const lineTwo = [customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ");
  return [lineOne, lineTwo].filter(Boolean).join(" • ") || null;
}

function normalizeTelHref(value: string | null | undefined) {
  const phone = String(value || "").trim();
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized.replace(/\D/g, "").length >= 7 ? `tel:${normalized}` : null;
}

export default async function WorkspaceCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const [detail, retailSalesData] = await Promise.all([
    loadCustomerWorkspaceDetail(id),
    loadRetailSalesAccountData(id),
  ]);
  if (!detail || !retailSalesData) notFound();

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
    return { userId, label: email ? `${label} (${email})` : label };
  });
  const currentStaffLabel = salesOptions.find((option) => option.userId === staff.userId)?.label || authEmailById.get(staff.userId) || staff.userId;
  const territoryOptions = territories.map((territory) => ({ code: territory.code, label: formatTerritoryOptionLabel(territory) }));
  const primaryContact = detail.contacts.find((contact) => contact.isPrimary) || null;
  const primaryCallHref = normalizeTelHref(primaryContact?.phone || detail.customer.mainPhone);
  const retailContacts = detail.contacts.map((contact) => ({ id: contact.id, name: contact.name, email: contact.email, title: contact.title }));
  const retailProps = { customerId: detail.customer.id, contacts: retailContacts, data: retailSalesData, canVerifyOwnership: staff.role === "admin" };

  const activityHistory = (
    <Panel title="Recent Timeline" id="customer-activity-timeline">
      <div className="max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
        {detail.activity.map((item) => <ActivityCard key={item.id} item={item} />)}
        {detail.activity.length === 0 ? <EmptyState label="No customer activity yet." /> : null}
      </div>
    </Panel>
  );
  const taskHistory = (
    <Panel title="Task History" id="customer-linked-task-list">
      <div className="max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
        {detail.tasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[var(--workspace-text)]">{task.title}</p>
              <Badge label={task.status} />
              {task.priority !== null ? <Badge label={`Priority ${task.priority}`} tone="warn" /> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--workspace-text-secondary)]">
              {task.assignedUserName || "Unassigned"}
              {task.dueAt ? <> • Due <LocalDateTime value={task.dueAt} fallback={formatDate(task.dueDate || task.dueAt)} /></> : task.dueDate ? ` • Due ${formatDate(task.dueDate)}` : " • No due date"}
            </p>
            <p className="mt-1 text-xs text-[var(--workspace-muted)]">Created <LocalDateTime value={task.createdAt} fallback={formatDate(task.createdAt)} /></p>
            {!task.completedAt && task.status !== "completed" ? <div className="mt-3"><CustomerTaskCompleteButton customerId={detail.customer.id} taskId={task.id} /></div> : null}
          </div>
        ))}
        {detail.tasks.length === 0 ? <EmptyState label="No customer tasks yet." /> : null}
      </div>
    </Panel>
  );
  const relatedRecords = (
    <details id="related-records" className="scroll-mt-28 rounded-2xl border border-[var(--workspace-border)] bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold text-[var(--workspace-text)]">Related Commercial Records & Notes</summary>
      <p className="mt-1 text-sm text-[var(--workspace-text-secondary)]">Legacy linked records remain available without competing with the daily sales workflow.</p>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Panel title="Estimates"><RecordTable rows={detail.estimates} columns={[{ key: "id", label: "Estimate" }, { key: "status", label: "Status" }, { key: "total", label: "Total", format: formatMoney }, { key: "updatedAt", label: "Updated", format: formatDate }]} /></Panel>
        <Panel title="Linked Orders"><RecordTable rows={detail.orders} columns={[{ key: "id", label: "Order" }, { key: "status", label: "Status" }, { key: "total", label: "Total", format: formatMoney }, { key: "createdAt", label: "Created", format: formatDate }]} /></Panel>
        <Panel title="Packaging Submissions"><RecordTable rows={detail.packagingSubmissions} columns={[{ key: "id", label: "Submission" }, { key: "category", label: "Category" }, { key: "status", label: "Status" }, { key: "createdAt", label: "Created", format: formatDate }]} /></Panel>
        <Panel title="Documents"><div className="space-y-2">{detail.documents.map((doc) => <div key={doc.id} className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-3 text-sm"><p className="font-semibold">{String(doc.title || doc.file_name || doc.name || `Document ${doc.id.slice(0, 8)}`)}</p><p className="mt-1 text-[var(--workspace-text-secondary)]">{String(doc.document_type || doc.kind || "Document")} • {formatDate(String(doc.updatedAt || doc.createdAt || ""))}</p></div>)}{detail.documents.length === 0 ? <EmptyState label="No customer documents linked yet." /> : null}</div></Panel>
        <Panel title="Internal Notes"><div className="space-y-2">{detail.notes.map((note) => <div key={note.id} className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-3"><p className="whitespace-pre-wrap text-sm">{note.note}</p><p className="mt-2 text-xs text-[var(--workspace-muted)]">{note.authorName || "Unknown author"} • <LocalDateTime value={note.createdAt} fallback={formatDate(note.createdAt)} /></p></div>)}{detail.notes.length === 0 ? <EmptyState label="No internal notes yet." /> : null}</div></Panel>
      </div>
    </details>
  );

  return (
    <div className="min-w-0 space-y-4">
      <header className="rounded-2xl border border-[var(--workspace-border)] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/workspace/customers" className="text-sm font-semibold text-[var(--workspace-text-secondary)] hover:text-black">← Back to Retail Accounts</Link>
            <h1 className="mt-2 truncate text-2xl font-semibold text-[var(--workspace-text)] sm:text-3xl">{detail.customer.name}</h1>
            {(retailSalesData.account.dbaName || retailSalesData.account.legalBusinessName) ? <p className="mt-1 text-sm text-[var(--workspace-text-secondary)]">{[retailSalesData.account.dbaName, retailSalesData.account.legalBusinessName].filter(Boolean).join(" • ")}</p> : null}
          </div>
          <a href={primaryCallHref || undefined} aria-disabled={!primaryCallHref} className={primaryCallHref ? "inline-flex min-h-11 items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-[#252525]" : "pointer-events-none inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--workspace-surface-muted)] px-4 text-sm font-semibold text-[var(--workspace-muted)]"}>Call buyer</a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge label={labelize(detail.customer.status)} />
          <Badge label={`Stage: ${labelize(detail.customer.stage)}`} />
          <Badge label={detail.customer.territoryCode ? `Territory ${detail.customer.territoryCode}` : labelize(detail.customer.city, "City not set")} />
          <Badge label={detail.customer.assignedSalesName || detail.customer.assignedSalesEmail || "Unassigned"} />
          <Badge label={detail.customer.lastActivityAt ? `Last activity ${formatDate(detail.customer.lastActivityAt)}` : "No recent activity"} />
        </div>
      </header>

      <CustomerDetailManager
        customerId={detail.customer.id} companyName={detail.customer.name} status={detail.customer.status} stage={detail.customer.stage}
        isHotLead={detail.customer.isHotLead} isHallOfFlowersLead={detail.customer.isHallOfFlowersLead}
        primaryContactEmail={detail.customer.primaryContactEmail} mainPhone={detail.customer.mainPhone}
        assignedSalesUserId={detail.customer.assignedSalesUserId} assignedSalesLabel={detail.customer.assignedSalesName}
        territoryCode={detail.customer.territoryCode} routePriority={detail.customer.routePriority} visitStatus={detail.customer.visitStatus}
        lastVisitAt={detail.customer.lastVisitAt} nextVisitDueAt={detail.customer.nextVisitDueAt} hasOpenTask={detail.customer.hasOpenTask}
        openTaskCount={detail.customer.openTaskCount} overdueTaskCount={detail.customer.overdueTaskCount} nextTaskDueAt={detail.customer.nextTaskDueAt}
        lastActivityAt={detail.customer.lastActivityAt} latitude={detail.customer.latitude} longitude={detail.customer.longitude}
        address1={detail.customer.address1} address2={detail.customer.address2} city={detail.customer.city} state={detail.customer.state} postalCode={detail.customer.postalCode}
        geocodeStatus={detail.customer.geocodeStatus} geocodedAddress={detail.customer.geocodedAddress} lastGeocodedAt={detail.customer.lastGeocodedAt} geocodeProvider={detail.customer.geocodeProvider}
        address={formatAddress(detail.customer)} staffRole={staff.role} currentStaffUserId={staff.userId} currentStaffLabel={String(currentStaffLabel)}
        salesOptions={salesOptions} territoryOptions={territoryOptions} primaryContact={primaryContact} contacts={detail.contacts} website={detail.customer.website}
        activityComposer={<RetailSalesActivityComposer {...retailProps} />}
        activityHistory={activityHistory}
        taskHistory={taskHistory}
        salesWorkspace={<RetailSalesPanel {...retailProps} />}
        retailSetup={<RetailSalesSetupPanel {...retailProps} />}
        relatedRecords={relatedRecords}
      />
    </div>
  );
}

function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "warn" }) {
  return <span className={tone === "warn" ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800" : "max-w-full truncate rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--workspace-text-secondary)]"}>{label}</span>;
}

function ActivityCard({ item }: { item: { summary: string; actorName: string | null; createdAt: string | null; activityType: string; entityType: string | null; details: Record<string, unknown> | null } }) {
  const notes = typeof item.details?.notes === "string" ? item.details.notes.trim() : "";
  return <div className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-3"><p className="font-semibold text-[var(--workspace-text)]">{item.summary}</p><p className="mt-1 text-sm text-[var(--workspace-text-secondary)]">{item.actorName || "System"} • <LocalDateTime value={item.createdAt} fallback={formatDate(item.createdAt)} /></p><p className="mt-1 text-xs uppercase tracking-wide text-[var(--workspace-muted)]">{item.activityType}{item.entityType ? ` • ${item.entityType}` : ""}</p>{notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--workspace-text-secondary)]">{notes}</p> : null}</div>;
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="min-w-0 scroll-mt-28 rounded-2xl border border-[var(--workspace-border)] bg-white p-4 shadow-sm"><h3 className="text-base font-semibold text-[var(--workspace-text)]">{title}</h3><div className="mt-3">{children}</div></section>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-3 text-sm text-[var(--workspace-muted)]">{label}</div>;
}

function RecordTable({ rows, columns }: { rows: Array<Record<string, unknown> & { id: string; matchType: string }>; columns: Array<{ key: string; label: string; format?: (value: unknown) => string }> }) {
  return rows.length ? <div className="overflow-x-auto rounded-xl border border-[var(--workspace-border)]"><table className="min-w-[34rem] divide-y divide-[var(--workspace-border)] text-sm"><thead className="bg-[var(--workspace-surface-muted)] text-left"><tr>{columns.map((column) => <th key={column.key} className="px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--workspace-border)]">{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key} className="px-3 py-2 text-[var(--workspace-text-secondary)]">{column.key === "id" ? `#${String(row[column.key] || "").slice(0, 8)}` : column.format ? column.format(row[column.key]) : String(row[column.key] || "-")}</td>)}</tr>)}</tbody></table></div> : <EmptyState label="No linked records found." />;
}
