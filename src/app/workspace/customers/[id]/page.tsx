import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerDetailManager from "@/components/workspace/CustomerDetailManager";
import LocalDateTime from "@/components/workspace/LocalDateTime";
import CustomerTaskCompleteButton from "@/components/workspace/CustomerTaskCompleteButton";
import RetailSalesPanel from "@/components/workspace/RetailSalesPanel";
import { loadCustomerWorkspaceDetail } from "@/lib/customerWorkspace";
import { loadRetailSalesAccountData } from "@/lib/retailSalesWorkspace";
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

function getActivityDetailText(details: Record<string, unknown> | null, key: string): string | null {
  const value = details?.[key];
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readHotLeadState(details: Record<string, unknown> | null): boolean | null {
  const value = details?.hot_lead;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
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

function normalizeTelHref(value: string | null | undefined) {
  const phone = String(value || "").trim();
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 ? `tel:${normalized}` : null;
}

function normalizeMailtoHref(value: string | null | undefined) {
  const email = String(value || "").trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
}

export default async function WorkspaceCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const detail = await loadCustomerWorkspaceDetail(id);
  if (!detail) notFound();
  const retailSalesData = await loadRetailSalesAccountData(id);
  if (!retailSalesData) notFound();

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
  const currentStaffLabel =
    salesOptions.find((option) => option.userId === staff.userId)?.label ||
    String(authEmailById.get(staff.userId) || "").trim() ||
    staff.userId;
  const primaryContact = detail.contacts.find((contact) => contact.isPrimary) || null;
  const primaryCallHref = normalizeTelHref(primaryContact?.phone || detail.customer.mainPhone);
  const primaryEmailHref = normalizeMailtoHref(primaryContact?.email || detail.customer.primaryContactEmail);
  const territoryOptions = territories.map((territory) => ({
    code: territory.code,
    label: formatTerritoryOptionLabel(territory),
  }));
  const address = formatAddress(detail.customer);
  const assignedSalesValue =
    detail.customer.assignedSalesName || detail.customer.assignedSalesEmail || "Unassigned";
  const assignedSalesHelper =
    detail.customer.assignedSalesName && detail.customer.assignedSalesEmail
      ? detail.customer.assignedSalesEmail
      : undefined;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={detail.customer.name}
        description="Canonical account operating page for staff. Work the account, capture the next step, and hand off cleanly into follow-up, routing, and recent account context."
        action={
          <Link
            href="/workspace/customers"
            className="inline-flex rounded-full border border-[#ddcfe8] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
          >
            Back to Customers
          </Link>
        }
      />

      <section className="rounded-2xl border border-[#eadff1] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b8593]">Account Snapshot</p>
            <h2 className="mt-1 text-lg font-semibold text-[#173543]">Identity, ownership, and current account pressure</h2>
            <p className="mt-1 max-w-3xl text-sm text-[#4a6575]">
              This account page is the workflow center for follow-up, route prep, and customer operating context.
            </p>
          </div>
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
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Status" value={detail.customer.status} />
          <SummaryCard label="Stage" value={detail.customer.stage || "Not set"} />
          <SummaryCard label="Assigned Sales" value={assignedSalesValue} helper={assignedSalesHelper} />
          <SummaryCard label="City" value={detail.customer.city || "Not set"} />
          <SummaryCard label="Last Activity" value={formatDate(detail.customer.lastActivityAt)} />
        </div>
      </section>

      <CustomerDetailManager
        customerId={detail.customer.id}
        companyName={detail.customer.name}
        status={detail.customer.status}
        stage={detail.customer.stage}
        isHotLead={detail.customer.isHotLead}
        isHallOfFlowersLead={detail.customer.isHallOfFlowersLead}
        primaryContactEmail={detail.customer.primaryContactEmail}
        mainPhone={detail.customer.mainPhone}
        assignedSalesUserId={detail.customer.assignedSalesUserId}
        assignedSalesLabel={detail.customer.assignedSalesName}
        territoryCode={detail.customer.territoryCode}
        routePriority={detail.customer.routePriority}
        visitStatus={detail.customer.visitStatus}
        lastVisitAt={detail.customer.lastVisitAt}
        nextVisitDueAt={detail.customer.nextVisitDueAt}
        hasOpenTask={detail.customer.hasOpenTask}
        openTaskCount={detail.customer.openTaskCount}
        overdueTaskCount={detail.customer.overdueTaskCount}
        nextTaskDueAt={detail.customer.nextTaskDueAt}
        lastActivityAt={detail.customer.lastActivityAt}
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
        currentStaffUserId={staff.userId}
        currentStaffLabel={currentStaffLabel}
        salesOptions={salesOptions}
        territoryOptions={territoryOptions}
        primaryContact={primaryContact}
        contacts={detail.contacts}
        website={detail.customer.website}
      />

      <RetailSalesPanel
        customerId={detail.customer.id}
        contacts={detail.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          title: contact.title,
        }))}
        data={retailSalesData}
        canVerifyOwnership={staff.role === "admin"}
      />

      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
        <Panel title="Recent Timeline" id="customer-activity-timeline">
          <div className="max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
            {detail.activity.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
            {detail.activity.length === 0 ? <EmptyState label="No customer activity yet." /> : null}
          </div>
        </Panel>

        <Panel title="Account Task History" id="customer-linked-task-list">
          <div className="space-y-2.5">
            {detail.tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-[#eadff1] bg-[#fdf8fd] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#173543]">{task.title}</p>
                  <span className="rounded-full border border-[#e5d8ef] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4f6877]">
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
                  {task.dueAt ? (
                    <> • Due <LocalDateTime value={task.dueAt} fallback={formatDate(task.dueDate || task.dueAt)} /></>
                  ) : task.dueDate ? (
                    ` • Due ${formatDate(task.dueDate)}`
                  ) : " • No due date"}
                </p>
                <p className="mt-1 text-xs text-[#5d7685]">
                  Created <LocalDateTime value={task.createdAt} fallback={formatDate(task.createdAt)} />
                  {task.completedAt ? <> • Completed <LocalDateTime value={task.completedAt} fallback={formatDate(task.completedAt)} /></> : ""}
                  {task.reminderOffsetMinutes !== null ? (
                    <> • Reminder {task.reminderOffsetMinutes === 0 ? "at task time" : `${task.reminderOffsetMinutes} min before`}</>
                  ) : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!task.completedAt && task.status !== "completed" ? (
                    <CustomerTaskCompleteButton customerId={detail.customer.id} taskId={task.id} />
                  ) : null}
                  <a
                    href={primaryCallHref || undefined}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                      primaryCallHref
                        ? "border-[#decfe8] bg-white text-[#24404d] hover:border-[#8f52dc] hover:text-[#6f32b5]"
                        : "pointer-events-none cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac]",
                    ].join(" ")}
                  >
                    Call
                  </a>
                  <a
                    href={primaryEmailHref || undefined}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                      primaryEmailHref
                        ? "border-[#decfe8] bg-white text-[#24404d] hover:border-[#8f52dc] hover:text-[#6f32b5]"
                        : "pointer-events-none cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac]",
                    ].join(" ")}
                  >
                    Email
                  </a>
                  <Link
                    href={`/workspace/customers/${detail.customer.id}#customer-account-management`}
                    className="rounded-full border border-[#decfe8] bg-white px-3 py-1.5 text-sm font-semibold text-[#24404d] transition hover:border-[#8f52dc] hover:text-[#6f32b5]"
                  >
                    Open Account
                  </Link>
                </div>
              </div>
            ))}
            {detail.tasks.length === 0 ? <EmptyState label="No customer tasks yet." /> : null}
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
        <div id="customer-documents" className="scroll-mt-24">
          <Panel title="Customer Documents">
            <div className="space-y-2.5">
              {detail.documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-[#eadff1] bg-[#fdf8fd] px-3 py-2.5">
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
              <div key={note.id} className="rounded-xl border border-[#eadff1] bg-[#fdf8fd] px-3 py-2.5">
                <p className="whitespace-pre-wrap text-sm text-[#173543]">{note.note}</p>
                <p className="mt-2 text-xs text-[#5d7685]">
                  {note.authorName || "Unknown author"} • <LocalDateTime value={note.createdAt} fallback={formatDate(note.createdAt)} />
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
    <div className="min-w-0 rounded-2xl border border-[#eadff1] bg-white p-4 shadow-sm">
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
      ? "border-[#e8d7f7] bg-[#fcf3ff] text-[#6f32b5]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : tone === "event"
          ? "border-[#f1ddad] bg-[#fff9eb] text-[#8a5b00]"
          : tone === "hot"
            ? "border-[#ffd3cf] bg-[#fff2f0] text-[#b44b40]"
            : "border-[#e5d8ef] bg-[#fcf7fd] text-[#4f6877]";

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
  const hotLeadState = readHotLeadState(item.details);
  const to = getActivityDetailText(item.details, "to");
  const subject = getActivityDetailText(item.details, "subject");
  const provider = getActivityDetailText(item.details, "provider");
  const gmailEmail = getActivityDetailText(item.details, "gmail_email");
  const batchLabel = getActivityDetailText(item.details, "batch_label");
  const error = getActivityDetailText(item.details, "error");
  const threadId = getActivityDetailText(item.details, "provider_thread_id");
  const isEmailActivity = item.activityType === "email_sent" || item.activityType === "email_failed";

  return (
    <div className="rounded-xl border border-[#eadff1] bg-[#fdf8fd] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-[#173543]">{item.summary}</p>
        {hotLeadState === true ? <HeaderBadge tone="hot" label="Hot Lead" /> : null}
        {hotLeadState === false ? <HeaderBadge label="Hot Lead Cleared" /> : null}
        {item.activityType === "event_quick_add" ? <HeaderBadge tone="event" label="Hall of Flowers" /> : null}
      </div>
      <p className="mt-1 text-sm text-[#4a6575]">
        {item.actorName || "System"} • <LocalDateTime value={item.createdAt} fallback={formatDate(item.createdAt)} />
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-[#6b8593]">
        {item.activityType}{item.entityType ? ` • ${item.entityType}` : ""}
      </p>
      {isEmailActivity ? (
        <div className="mt-2 space-y-1 text-sm text-[#4a6575]">
          <p>{to ? `To ${to}` : "Recipient unavailable"}{subject ? ` • ${subject}` : ""}</p>
          <p>{provider ? `Provider ${provider}` : "Provider unavailable"}{gmailEmail ? ` • Sent from ${gmailEmail}` : ""}</p>
          {batchLabel ? <p>Batch {batchLabel}</p> : null}
          {threadId ? <p>Thread {threadId}</p> : null}
          {error ? <p className="text-[#9f2a2a]">{error}</p> : null}
        </div>
      ) : null}
      {notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#4a6575]">{notes}</p> : null}
    </div>
  );
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-[#eadff1] bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#fdf8fd] px-3 py-4 text-sm text-[#5d7685]">{label}</div>;
}

function RecordTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, unknown> & { id: string; matchType: string }>;
  columns: Array<{ key: string; label: string; format?: (value: unknown) => string }>;
}) {
  return rows.length > 0 ? (
    <div className="overflow-hidden rounded-xl border border-[#eadff1]">
      <table className="min-w-full divide-y divide-[#e6eef3] text-sm">
        <thead className="bg-[#fdf7fb] text-left text-[#5b7382]">
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
                <span className="rounded-full border border-[#e5d8ef] bg-[#fcf7fd] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#4f6877]">
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
