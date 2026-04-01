import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SourceDetailManager from "@/components/workspace/SourceDetailManager";
import { requireStaff } from "@/lib/requireStaff";
import { loadSourceWorkspaceDetail } from "@/lib/sourceWorkspace";
import { createAdminClient } from "@/lib/supabase/admin";

function formatDate(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

function titleCase(value: string | null | undefined, fallback = "Unspecified") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function WorkspaceSourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const detail = await loadSourceWorkspaceDetail(id);
  if (!detail) notFound();

  const supabase = createAdminClient();
  const [profilesRes, authUsersRes] = await Promise.all([
    supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const authEmailById = new Map(
    (authUsersRes.data?.users || []).map((user: { id?: string; email?: string | null }) => [
      String(user.id || ""),
      String(user.email || "").trim() || null,
    ] as const)
  );
  const staffOptions = ((profilesRes.data || []) as Array<Record<string, unknown>>).map((profile) => {
    const userId = String(profile.id || "");
    const label = String(profile.company_name || authEmailById.get(userId) || userId);
    const email = authEmailById.get(userId);
    return {
      userId,
      label: email ? `${label} (${email})` : label,
    };
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={detail.source.name}
        description="Source relationship workspace for supplier intake, qualification, and sourcing follow-up."
        action={
          <Link
            href="/workspace/sources"
            className="inline-flex rounded-full border border-[#cfdde5] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Back to Sources
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <HeaderBadge label={titleCase(detail.source.status)} />
        <HeaderBadge label={titleCase(detail.source.stage, "No Stage")} />
        {detail.source.sourceType ? <HeaderBadge label={titleCase(detail.source.sourceType)} tone="ok" /> : null}
        {detail.source.assignedBuyerName ? <HeaderBadge label={`Buyer ${detail.source.assignedBuyerName}`} /> : null}
        {detail.source.overdueTaskCount > 0 ? <HeaderBadge tone="warn" label={`${detail.source.overdueTaskCount} overdue task${detail.source.overdueTaskCount === 1 ? "" : "s"}`} /> : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Source Type" value={titleCase(detail.source.sourceType)} />
        <SummaryCard label="Company" value={detail.source.companyName || "Not set"} />
        <SummaryCard label="Primary Contact" value={detail.source.contactName || "Not set"} helper={detail.source.contactEmail || detail.source.contactPhone || undefined} />
        <SummaryCard label="Assigned Buyer" value={detail.source.assignedBuyerName || "Unassigned"} helper={detail.source.assignedBuyerEmail || undefined} />
        <SummaryCard label="Open Tasks" value={String(detail.source.openTaskCount)} helper={detail.source.nextTaskDueAt ? `Next due ${formatDate(detail.source.nextTaskDueAt)}` : undefined} />
        <SummaryCard label="Last Activity" value={formatDate(detail.source.lastActivityAt)} />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Panel title="Continue Sourcing Workflow">
          <div className="grid gap-3 md:grid-cols-3">
            <WorkflowCue
              title="Log supplier touchpoint"
              description="Record calls, meeting notes, cannabinoid leads, and price movement directly on the account."
              href="#source-log-activity"
              ctaLabel="Jump to log activity"
            />
            <WorkflowCue
              title="Set the next follow-up"
              description="Create an explicit sourcing task so supplier momentum does not disappear into notes."
              href="#source-create-task"
              ctaLabel="Jump to follow-up"
            />
            <WorkflowCue
              title="Keep the account current"
              description="Update contact details, stage, and working notes so the next buyer has clean context."
              href="#source-profile"
              ctaLabel="Jump to profile"
            />
          </div>
        </Panel>

        <Panel title="Sourcing Snapshot">
          <div className="space-y-3">
            <SnapshotRow label="Status" value={titleCase(detail.source.status)} />
            <SnapshotRow label="Stage" value={titleCase(detail.source.stage, "No Stage")} />
            <SnapshotRow
              label="Follow-up pressure"
              value={
                detail.source.overdueTaskCount > 0
                  ? `${detail.source.overdueTaskCount} overdue`
                  : detail.source.openTaskCount > 0
                    ? `${detail.source.openTaskCount} open`
                    : "No open task"
              }
            />
            <SnapshotRow
              label="Categories"
              value={detail.source.supplyCategories.length > 0 ? detail.source.supplyCategories.map((category) => titleCase(category)).join(", ") : "Not tagged"}
            />
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <SourceDetailManager
          sourceId={detail.source.id}
          name={detail.source.name}
          sourceType={detail.source.sourceType}
          companyName={detail.source.companyName}
          contactName={detail.source.contactName}
          contactEmail={detail.source.contactEmail}
          contactPhone={detail.source.contactPhone}
          status={detail.source.status}
          stage={detail.source.stage}
          notes={detail.source.notes}
          staffOptions={staffOptions}
        />

        <Panel title="Activity Timeline">
          <div className="space-y-2.5">
            {detail.activity.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
            {detail.activity.length === 0 ? <EmptyState label="No source activity yet." /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Open and Recent Tasks">
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
            {detail.tasks.length === 0 ? <EmptyState label="No source tasks yet." /> : null}
          </div>
        </Panel>

        <Panel title="Source Notes">
          {detail.source.notes ? (
            <p className="whitespace-pre-wrap text-sm text-[#173543]">{detail.source.notes}</p>
          ) : (
            <EmptyState label="No source notes saved yet." />
          )}
        </Panel>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-1.5 text-base font-semibold text-[#173543]">{value}</p>
      {helper ? <p className="mt-1 text-sm text-[#4a6575]">{helper}</p> : null}
    </div>
  );
}

function HeaderBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  return <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}>{label}</span>;
}

function ActivityCard({
  item,
}: {
  item: {
    summary: string;
    actorName: string | null;
    createdAt: string | null;
    activityType: string;
    details: Record<string, unknown> | null;
  };
}) {
  const notes = typeof item.details?.notes === "string" ? item.details.notes.trim() : "";
  const opportunity = typeof item.details?.opportunity === "string" ? item.details.opportunity.trim() : "";
  const nextStep = typeof item.details?.next_step === "string" ? item.details.next_step.trim() : "";
  const followUpOn = typeof item.details?.follow_up_on === "string" ? item.details.follow_up_on.trim() : "";

  return (
    <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
      <p className="font-semibold text-[#173543]">{item.summary}</p>
      <p className="mt-1 text-sm text-[#4a6575]">
        {item.actorName || "System"} • {formatDate(item.createdAt)}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-[#6b8593]">{item.activityType}</p>
      {notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#4a6575]">{notes}</p> : null}
      {opportunity ? <DetailPill label="Opportunity" value={opportunity} /> : null}
      {nextStep ? <DetailPill label="Next Step" value={nextStep} /> : null}
      {followUpOn ? <DetailPill label="Follow-Up" value={formatDate(followUpOn)} /> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-3 py-4 text-sm text-[#5d7685]">{label}</div>;
}

function WorkflowCue({
  title,
  description,
  href,
  ctaLabel,
}: {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <a href={href} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-3 transition hover:border-[#14b8a6] hover:bg-white">
      <p className="font-semibold text-[#173543]">{title}</p>
      <p className="mt-1 text-sm text-[#5b7382]">{description}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{ctaLabel}</p>
    </a>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#173543]">{value}</p>
    </div>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 rounded-lg border border-[#dbe9ef] bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-1 text-sm text-[#4a6575]">{value}</p>
    </div>
  );
}
