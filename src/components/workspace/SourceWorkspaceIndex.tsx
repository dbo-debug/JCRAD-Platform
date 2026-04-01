"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useState } from "react";
import type { SourceSummary } from "@/lib/sourceWorkspace";

type SourceWorkspaceIndexProps = {
  sources: SourceSummary[];
  initialFilters: {
    q: string;
    savedView: string;
    sourceType: string;
    status: string;
    stage: string;
    owner: string;
    taskState: string;
    sort: string;
  };
};

type SavedViewKey = "all" | "active" | "pipeline" | "unassigned" | "overdue";
type TaskStateFilter = "all" | "has_open_task" | "overdue_task" | "no_open_task";
type SortKey = "activity_desc" | "name_asc" | "name_desc" | "created_desc";

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
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

function formatDate(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "Unknown";
  return new Date(parsed).toLocaleDateString();
}

function normalizeMailtoHref(value: string | null | undefined) {
  const email = String(value || "").trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}`;
}

function normalizeTelHref(value: string | null | undefined) {
  const phone = String(value || "").trim();
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${normalized}`;
}

function chipClass(value: string | null | undefined, kind: "status" | "stage" | "task" = "status") {
  const normalized = normalizeText(value);

  if (kind === "task") {
    if (normalized === "overdue") return "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]";
    if (normalized === "open") return "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]";
    return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";
  }

  if (kind === "status") {
    if (normalized === "active") return "border-[#b7e4d7] bg-[#edf9f3] text-[#16624b]";
    if (normalized === "lead" || normalized === "prospect") return "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]";
    if (normalized === "on_hold" || normalized === "paused") return "border-[#f4ddb0] bg-[#fff6df] text-[#946200]";
    if (normalized === "inactive" || normalized === "closed") return "border-[#e1d7d3] bg-[#f5f1ef] text-[#6f5b54]";
  }

  if (kind === "stage") {
    if (normalized === "qualified") return "border-[#bfe8ef] bg-[#edfafe] text-[#0c6b79]";
    if (normalized === "active") return "border-[#cde8c8] bg-[#f2faef] text-[#2f6b2f]";
    if (normalized === "new") return "border-[#d8d6ff] bg-[#f3f2ff] text-[#4f46a3]";
    if (normalized === "paused") return "border-[#f1d2b6] bg-[#fff1e5] text-[#9a5311]";
    if (normalized === "closed") return "border-[#ded8d8] bg-[#f5f1f1] text-[#665a5a]";
  }

  return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4a6575]";
}

function denseButtonClass(tone: "primary" | "secondary" = "secondary") {
  return tone === "primary"
    ? "inline-flex h-9 items-center justify-center rounded-full bg-[#173543] px-3.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
    : "inline-flex h-9 items-center justify-center rounded-full border border-[#d0dde5] bg-white px-3.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]";
}

function toolbarSelectClass() {
  return "h-9 min-w-0 rounded-full border border-[#cedde6] bg-[#fbfdfe] px-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white";
}

function getSearchText(source: SourceSummary) {
  return [
    source.name,
    source.sourceType,
    source.companyName,
    source.contactName,
    source.contactEmail,
    source.contactPhone,
    source.status,
    source.stage,
    source.assignedBuyerName,
    source.assignedBuyerEmail,
    source.notes,
    ...source.supplyCategories,
    ...source.linkedProductIds,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

function getFollowUpState(source: SourceSummary) {
  if (!source.hasOpenTask) return { label: "No Open Task", tone: "neutral" as const };
  if (source.overdueTaskCount > 0) return { label: `${source.overdueTaskCount} Overdue`, tone: "overdue" as const };
  if (source.nextTaskDueAt) return { label: `Due ${formatDate(source.nextTaskDueAt)}`, tone: "open" as const };
  return { label: titleCase(source.latestTaskStatus, "Open Task"), tone: "open" as const };
}

export default function SourceWorkspaceIndex({ sources, initialFilters }: SourceWorkspaceIndexProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftSearch, setDraftSearch] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [savedView, setSavedView] = useState<SavedViewKey>(
    initialFilters.savedView === "active" ||
      initialFilters.savedView === "pipeline" ||
      initialFilters.savedView === "unassigned" ||
      initialFilters.savedView === "overdue"
      ? initialFilters.savedView
      : "all"
  );
  const [sourceTypeFilter, setSourceTypeFilter] = useState(initialFilters.sourceType || "all");
  const [statusFilter, setStatusFilter] = useState(initialFilters.status || "all");
  const [stageFilter, setStageFilter] = useState(initialFilters.stage || "all");
  const [ownerFilter, setOwnerFilter] = useState(initialFilters.owner || "all");
  const [taskStateFilter, setTaskStateFilter] = useState<TaskStateFilter>(
    initialFilters.taskState === "has_open_task" || initialFilters.taskState === "overdue_task" || initialFilters.taskState === "no_open_task"
      ? initialFilters.taskState
      : "all"
  );
  const [sort, setSort] = useState<SortKey>(
    initialFilters.sort === "name_asc" || initialFilters.sort === "name_desc" || initialFilters.sort === "created_desc"
      ? initialFilters.sort
      : "activity_desc"
  );

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const typeOptions = Array.from(new Set(sources.map((source) => source.sourceType).filter(Boolean) as string[])).sort();
  const statusOptions = Array.from(new Set(sources.map((source) => source.status).filter(Boolean))).sort();
  const stageOptions = Array.from(new Set(sources.map((source) => source.stage).filter(Boolean) as string[])).sort();
  const ownerOptions = Array.from(
    new Map(
      sources
        .filter((source) => source.assignedBuyerUserId)
        .map((source) => [
          source.assignedBuyerUserId as string,
          {
            id: source.assignedBuyerUserId as string,
            label: source.assignedBuyerName || source.assignedBuyerEmail || "Assigned buyer",
          },
        ])
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label));

  const filteredSources = sources
    .filter((source) => {
      if (searchQuery && !getSearchText(source).includes(normalizeText(searchQuery))) return false;
      if (savedView === "active" && normalizeText(source.status) !== "active") return false;
      if (savedView === "pipeline" && normalizeText(source.stage) !== "new" && normalizeText(source.stage) !== "qualified") return false;
      if (savedView === "unassigned" && source.assignedBuyerUserId) return false;
      if (savedView === "overdue" && source.overdueTaskCount === 0) return false;
      if (sourceTypeFilter !== "all" && normalizeText(source.sourceType) !== normalizeText(sourceTypeFilter)) return false;
      if (statusFilter !== "all" && normalizeText(source.status) !== normalizeText(statusFilter)) return false;
      if (stageFilter !== "all" && normalizeText(source.stage) !== normalizeText(stageFilter)) return false;
      if (ownerFilter === "unassigned" && source.assignedBuyerUserId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "unassigned" && source.assignedBuyerUserId !== ownerFilter) return false;
      if (taskStateFilter === "has_open_task" && !source.hasOpenTask) return false;
      if (taskStateFilter === "overdue_task" && source.overdueTaskCount === 0) return false;
      if (taskStateFilter === "no_open_task" && source.hasOpenTask) return false;
      return true;
    })
    .sort((left, right) => {
      if (sort === "name_asc") return left.name.localeCompare(right.name);
      if (sort === "name_desc") return right.name.localeCompare(left.name);
      if (sort === "created_desc") {
        return Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""));
      }
      return Date.parse(String(right.lastActivityAt || right.updatedAt || "")) - Date.parse(String(left.lastActivityAt || left.updatedAt || ""));
    });

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-[#d7e6ed] bg-white p-4 shadow-[0_16px_40px_rgba(15,42,53,0.08)]">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSavedView("all");
              updateQuery({ savedView: "" });
            }}
            className={denseButtonClass(savedView === "all" ? "primary" : "secondary")}
          >
            All Sources
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedView("active");
              updateQuery({ savedView: "active" });
            }}
            className={denseButtonClass(savedView === "active" ? "primary" : "secondary")}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedView("pipeline");
              updateQuery({ savedView: "pipeline" });
            }}
            className={denseButtonClass(savedView === "pipeline" ? "primary" : "secondary")}
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedView("unassigned");
              updateQuery({ savedView: "unassigned" });
            }}
            className={denseButtonClass(savedView === "unassigned" ? "primary" : "secondary")}
          >
            Unassigned Buyer
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedView("overdue");
              updateQuery({ savedView: "overdue" });
            }}
            className={denseButtonClass(savedView === "overdue" ? "primary" : "secondary")}
          >
            Overdue Follow-up
          </button>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(6,minmax(0,1fr))]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(draftSearch);
              updateQuery({ q: draftSearch });
            }}
            className="flex gap-2"
          >
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search sources, contacts, notes, categories"
              className="h-9 w-full rounded-full border border-[#cedde6] bg-[#fbfdfe] px-3.5 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
            <button type="submit" className={denseButtonClass("primary")}>
              Search
            </button>
          </form>

          <select
            value={sourceTypeFilter}
            onChange={(event) => {
              setSourceTypeFilter(event.target.value);
              updateQuery({ sourceType: event.target.value });
            }}
            className={toolbarSelectClass()}
          >
            <option value="all">All Types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>

          <select
            value={stageFilter}
            onChange={(event) => {
              setStageFilter(event.target.value);
              updateQuery({ stage: event.target.value });
            }}
            className={toolbarSelectClass()}
          >
            <option value="all">All Stages</option>
            {stageOptions.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              updateQuery({ status: event.target.value });
            }}
            className={toolbarSelectClass()}
          >
            <option value="all">All Statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>

          <select
            value={ownerFilter}
            onChange={(event) => {
              setOwnerFilter(event.target.value);
              updateQuery({ owner: event.target.value });
            }}
            className={toolbarSelectClass()}
          >
            <option value="all">All Buyers</option>
            <option value="unassigned">Unassigned</option>
            {ownerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={taskStateFilter}
            onChange={(event) => {
              const nextValue = event.target.value as TaskStateFilter;
              setTaskStateFilter(nextValue);
              updateQuery({ taskState: nextValue });
            }}
            className={toolbarSelectClass()}
          >
            <option value="all">All Follow-up</option>
            <option value="has_open_task">Open Task</option>
            <option value="overdue_task">Overdue</option>
            <option value="no_open_task">No Open Task</option>
          </select>

          <select
            value={sort}
            onChange={(event) => {
              const nextValue = event.target.value as SortKey;
              setSort(nextValue);
              updateQuery({ sort: nextValue });
            }}
            className={toolbarSelectClass()}
          >
            <option value="activity_desc">Recent Activity</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="created_desc">Newest Created</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {filteredSources.map((source) => {
          const followUp = getFollowUpState(source);
          const emailHref = normalizeMailtoHref(source.contactEmail);
          const phoneHref = normalizeTelHref(source.contactPhone);

          return (
            <article
              key={source.id}
              className="group rounded-[28px] border border-[#dbe9ef] bg-white p-5 shadow-[0_14px_35px_rgba(16,42,67,0.06)] transition hover:-translate-y-0.5 hover:border-[#b7d6e3] hover:shadow-[0_20px_48px_rgba(16,42,67,0.1)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/workspace/sources/${source.id}`} className="text-lg font-semibold text-[#173543] transition hover:text-[#0f766e]">
                    {source.name}
                  </Link>
                  <p className="mt-1 text-sm text-[#4a6575]">
                    {source.companyName || "Independent source"}
                    {source.sourceType ? ` • ${titleCase(source.sourceType)}` : ""}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6c8796]">
                    Open the account to log sourcing activity, create follow-up, and keep supplier context moving.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link
                    href={`/workspace/sources/${source.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[#173543] px-4 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
                  >
                    Open Account
                  </Link>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", chipClass(source.status, "status")].join(" ")}>
                      {titleCase(source.status)}
                    </span>
                    <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", chipClass(source.stage, "stage")].join(" ")}>
                      {titleCase(source.stage, "No Stage")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e4eef3] bg-[#f9fcfd] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6c8796]">Primary Contact</p>
                  <p className="mt-1 text-sm font-medium text-[#173543]">{source.contactName || "Not set"}</p>
                  <p className="mt-1 text-sm text-[#4a6575]">
                    {emailHref ? (
                      <span>{source.contactEmail}</span>
                    ) : (
                      source.contactEmail || "No email"
                    )}
                    {source.contactPhone ? " • " : ""}
                    {phoneHref ? <span>{source.contactPhone}</span> : source.contactPhone || ""}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e4eef3] bg-[#f9fcfd] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6c8796]">Owner</p>
                  <p className="mt-1 text-sm font-medium text-[#173543]">{source.assignedBuyerName || "Unassigned"}</p>
                  <p className="mt-1 text-sm text-[#4a6575]">{source.assignedBuyerEmail || "No buyer mapped"}</p>
                </div>
              </div>

              {source.notes ? (
                <p className="mt-4 line-clamp-3 text-sm text-[#4a6575]">{source.notes}</p>
              ) : (
                <p className="mt-4 text-sm text-[#89a0ad]">No source notes yet.</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", chipClass(followUp.tone, "task")].join(" ")}>
                  {followUp.label}
                </span>
                <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4f6877]">
                  Last Active {formatDate(source.lastActivityAt)}
                </span>
                {source.supplyCategories.slice(0, 2).map((category) => (
                  <span key={category} className="rounded-full border border-[#e2e6b5] bg-[#fbfce9] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#68731d]">
                    {titleCase(category)}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e7eff3] pt-4">
                <div className="text-sm text-[#5c7483]">
                  {source.openTaskCount > 0
                    ? `${source.openTaskCount} open follow-up task${source.openTaskCount === 1 ? "" : "s"} on this account.`
                    : "No follow-up task yet on this account."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {emailHref ? (
                    <a
                      href={emailHref}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[#d0dde5] bg-white px-3.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
                    >
                      Email
                    </a>
                  ) : null}
                  <Link
                    href={`/workspace/sources/${source.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-[#14b8a6] bg-[#effcf9] px-3.5 text-sm font-semibold text-[#0f766e] transition hover:bg-[#dff8f2]"
                  >
                    Open Account
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filteredSources.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#cfdde6] bg-[#f9fcfd] px-6 py-10 text-center">
          <p className="text-lg font-semibold text-[#173543]">No sources match the current filters.</p>
          <p className="mt-2 text-sm text-[#5c7483]">Adjust the source type, stage, status, buyer, or follow-up filters to widen the view.</p>
        </div>
      ) : null}
    </section>
  );
}
