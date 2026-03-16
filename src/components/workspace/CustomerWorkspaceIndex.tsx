"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";

type CustomerWorkspaceIndexProps = {
  customers: CustomerSummary[];
};

type SavedViewKey = "all" | "pipeline" | "unassigned" | "missing_primary" | "with_orders";
type SortKey = "activity_desc" | "name_asc" | "name_desc" | "orders_desc" | "owner_asc";

const SAVED_VIEWS: Array<{ key: SavedViewKey; label: string; description: string }> = [
  { key: "all", label: "All Accounts", description: "Full CRM account list." },
  { key: "pipeline", label: "Pipeline", description: "Active accounts moving through sales." },
  { key: "unassigned", label: "Unassigned", description: "Accounts missing an owner." },
  { key: "missing_primary", label: "Missing Primary Contact", description: "Accounts missing a primary contact." },
  { key: "with_orders", label: "Order History", description: "Accounts with at least one order." },
];

function formatDate(value: string | null): string {
  if (!value) return "No recent activity";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "No recent activity";
  return new Date(parsed).toLocaleDateString();
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function titleCase(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "Unspecified";
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeWebsiteHref(value: string | null | undefined) {
  const href = String(value || "").trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return `https://${href}`;
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

function statusChipClass(status: string) {
  switch (normalizeText(status)) {
    case "active":
      return "border-[#b7e4d7] bg-[#edf9f3] text-[#16624b]";
    case "prospect":
    case "lead":
      return "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]";
    case "on_hold":
    case "paused":
      return "border-[#f4ddb0] bg-[#fff6df] text-[#946200]";
    case "inactive":
    case "closed":
      return "border-[#e1d7d3] bg-[#f5f1ef] text-[#6f5b54]";
    default:
      return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4a6575]";
  }
}

function stageChipClass(stage: string | null) {
  switch (normalizeText(stage)) {
    case "qualified":
      return "border-[#bfe8ef] bg-[#edfafe] text-[#0c6b79]";
    case "active":
      return "border-[#cde8c8] bg-[#f2faef] text-[#2f6b2f]";
    case "new":
      return "border-[#d8d6ff] bg-[#f3f2ff] text-[#4f46a3]";
    case "paused":
      return "border-[#f1d2b6] bg-[#fff1e5] text-[#9a5311]";
    case "closed":
      return "border-[#ded8d8] bg-[#f5f1f1] text-[#665a5a]";
    default:
      return "border-[#d7e6ed] bg-[#f8fbfc] text-[#4a6575]";
  }
}

function getCustomerSearchText(customer: CustomerSummary) {
  return [
    customer.name,
    customer.primaryContactEmail,
    customer.assignedSalesName,
    customer.assignedSalesEmail,
    customer.areaZone,
    customer.territoryCode,
    customer.website,
    customer.mainPhone,
    ...customer.primaryContacts.flatMap((contact) => [contact.name, contact.email, contact.phone, contact.title]),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

export default function CustomerWorkspaceIndex({ customers }: CustomerWorkspaceIndexProps) {
  const [search, setSearch] = useState("");
  const [savedView, setSavedView] = useState<SavedViewKey>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("activity_desc");
  const deferredSearch = useDeferredValue(search);

  const statuses = Array.from(new Set(customers.map((customer) => customer.status).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const stages = Array.from(new Set(customers.map((customer) => customer.stage).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
  const owners = Array.from(new Set(customers.map((customer) => customer.assignedSalesName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  let visibleCustomers = customers.filter((customer) => {
    const query = normalizeText(deferredSearch);
    if (query && !getCustomerSearchText(customer).includes(query)) return false;
    if (statusFilter !== "all" && customer.status !== statusFilter) return false;
    if (stageFilter !== "all" && (customer.stage || "") !== stageFilter) return false;
    if (ownerFilter !== "all" && (customer.assignedSalesName || "") !== ownerFilter) return false;
    if (contactFilter === "with_contacts" && customer.contactCount === 0) return false;
    if (contactFilter === "missing_primary" && customer.primaryContacts.length > 0) return false;

    if (savedView === "pipeline" && !["lead", "prospect", "active"].includes(normalizeText(customer.status))) return false;
    if (savedView === "unassigned" && customer.assignedSalesName) return false;
    if (savedView === "missing_primary" && customer.primaryContacts.length > 0) return false;
    if (savedView === "with_orders" && customer.counts.orders === 0) return false;

    return true;
  });

  visibleCustomers = [...visibleCustomers].sort((left, right) => {
    switch (sortKey) {
      case "name_asc":
        return left.name.localeCompare(right.name);
      case "name_desc":
        return right.name.localeCompare(left.name);
      case "orders_desc":
        return right.counts.orders - left.counts.orders;
      case "owner_asc":
        return (left.assignedSalesName || "ZZZ").localeCompare(right.assignedSalesName || "ZZZ");
      case "activity_desc":
      default: {
        const leftTime = Date.parse(String(left.lastActivityAt || left.updatedAt || left.createdAt || ""));
        const rightTime = Date.parse(String(right.lastActivityAt || right.updatedAt || right.createdAt || ""));
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      }
    }
  });

  const visibleWithContacts = visibleCustomers.filter((customer) => customer.contactCount > 0).length;
  const visibleWithOwners = visibleCustomers.filter((customer) => customer.assignedSalesName).length;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">CRM Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Operator views for account coverage, follow-up, and routing readiness</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">
              Search live CRM accounts, pivot between saved views, and review contact coverage, ownership, territory, and activity without leaving the workspace.
            </p>
          </div>
          <div className="grid min-w-[220px] gap-3 rounded-2xl border border-[#dbe8ef] bg-white/85 p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7891a0]">Visible Accounts</p>
              <p className="mt-1 text-3xl font-semibold text-[#173543]">{visibleCustomers.length}</p>
            </div>
            <div className="flex gap-6 text-sm text-[#506877]">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[#7d95a3]">With Contacts</p>
                <p className="mt-1 font-semibold text-[#173543]">{visibleWithContacts}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[#7d95a3]">Assigned</p>
                <p className="mt-1 font-semibold text-[#173543]">{visibleWithOwners}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SAVED_VIEWS.map((view) => {
            const active = savedView === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => startTransition(() => setSavedView(view.key))}
                className={[
                  "rounded-full border px-3 py-2 text-sm transition",
                  active ? "border-[#14b8a6] bg-[#14b8a6] text-white shadow-sm" : "border-[#d0e0e8] bg-white text-[#35505d] hover:border-[#97c7c1] hover:bg-[#f4fbfa]",
                ].join(" ")}
                title={view.description}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Search accounts</span>
            <input
              value={search}
              onChange={(event) => startTransition(() => setSearch(event.target.value))}
              placeholder="Search account, contact, email, territory, phone, website"
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
          </label>

          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={statuses} />
          <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={stages} />
          <FilterSelect label="Owner" value={ownerFilter} onChange={setOwnerFilter} options={owners} />

          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Sort</span>
            <select
              value={sortKey}
              onChange={(event) => startTransition(() => setSortKey(event.target.value as SortKey))}
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            >
              <option value="activity_desc">Recent activity</option>
              <option value="name_asc">Account name A-Z</option>
              <option value="name_desc">Account name Z-A</option>
              <option value="orders_desc">Most orders</option>
              <option value="owner_asc">Owner A-Z</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { key: "all", label: "All contact coverage" },
            { key: "with_contacts", label: "Has contacts" },
            { key: "missing_primary", label: "Missing primary contact" },
          ].map((option) => {
            const active = contactFilter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => startTransition(() => setContactFilter(option.key))}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  active ? "border-[#173543] bg-[#173543] text-white" : "border-[#d5e1e8] bg-[#f8fbfc] text-[#4a6575] hover:bg-white",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              startTransition(() => {
                setSearch("");
                setSavedView("all");
                setStatusFilter("all");
                setStageFilter("all");
                setOwnerFilter("all");
                setContactFilter("all");
                setSortKey("activity_desc");
              });
            }}
            className="ml-auto rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Reset filters
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {visibleCustomers.map((customer) => {
          const primaryContact = customer.primaryContacts[0] || null;
          const activityCount = customer.counts.estimates + customer.counts.orders + customer.counts.packagingSubmissions + customer.counts.documents;
          const primaryEmailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
          const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);
          const websiteHref = normalizeWebsiteHref(customer.website);

          return (
            <article
              key={customer.id}
              className="rounded-[28px] border border-[#d9e7ee] bg-white p-5 shadow-[0_14px_40px_rgba(16,42,67,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(16,42,67,0.08)]"
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/workspace/customers/${customer.id}`} className="text-lg font-semibold text-[#173543] transition hover:text-[#0f766e]">
                          {customer.name}
                        </Link>
                        <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass(customer.status)].join(" ")}>
                          {titleCase(customer.status)}
                        </span>
                        <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", stageChipClass(customer.stage)].join(" ")}>
                          {titleCase(customer.stage || "No stage")}
                        </span>
                        {customer.areaZone ? (
                          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#496574]">
                            Area {customer.areaZone}
                          </span>
                        ) : null}
                        {customer.territoryCode ? (
                          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#496574]">
                            Territory {customer.territoryCode}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-[#5a7483]">
                        Owner {customer.assignedSalesName || "Unassigned"}{customer.assignedSalesEmail ? ` • ${customer.assignedSalesEmail}` : ""}
                      </p>
                    </div>

                    <div className="grid min-w-[220px] gap-2 rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3 text-sm text-[#53707f]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8198a5]">Activity</span>
                        <span className="font-semibold text-[#173543]">{activityCount} linked</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span>Orders {customer.counts.orders}</span>
                        <span>Estimates {customer.counts.estimates}</span>
                        <span>Packaging {customer.counts.packagingSubmissions}</span>
                        <span>Docs {customer.counts.documents}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
                    <InfoBlock
                      label="Primary Contact"
                      title={primaryContact?.name || "No primary contact"}
                      lines={[
                        primaryContact?.title || null,
                        primaryContact?.email || customer.primaryContactEmail || "No contact email",
                        primaryContact?.phone || customer.mainPhone || null,
                      ]}
                    />

                    <InfoBlock
                      label="Coverage"
                      title={`${customer.contactCount} contact${customer.contactCount === 1 ? "" : "s"}`}
                      lines={[
                        `${customer.memberUsers.length} internal member${customer.memberUsers.length === 1 ? "" : "s"}`,
                        customer.areaZone ? `Area ${customer.areaZone}` : "Area unassigned",
                        customer.territoryCode ? `Territory ${customer.territoryCode}` : "Territory open",
                      ]}
                    />

                    <InfoBlock
                      label="Last Activity"
                      title={formatDate(customer.lastActivityAt)}
                      lines={[
                        customer.website || "No website on file",
                        customer.mainPhone || "No account phone on file",
                        customer.updatedAt ? `Updated ${formatDate(customer.updatedAt)}` : null,
                      ]}
                    />
                  </div>
                </div>

                <div className="flex min-w-[220px] flex-col gap-2">
                  <Link
                    href={`/workspace/customers/${customer.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#173543] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
                  >
                    Open Account
                  </Link>
                  <QuickAction href={primaryEmailHref} label="Email Primary" />
                  <QuickAction href={phoneHref} label="Call Account" />
                  <QuickAction href={websiteHref} label="Visit Website" external />
                </div>
              </div>
            </article>
          );
        })}

        {visibleCustomers.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#cfdde6] bg-white px-6 py-16 text-center">
            <p className="text-lg font-semibold text-[#173543]">No accounts match the current workspace view.</p>
            <p className="mt-2 text-sm text-[#5c7483]">Adjust the saved view, search, or filters to widen the CRM list.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => startTransition(() => onChange(event.target.value))}
        className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoBlock({ label, title, lines }: { label: string; title: string; lines: Array<string | null> }) {
  return (
    <div className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7f96a3]">{label}</p>
      <p className="mt-2 font-semibold text-[#173543]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#56717f]">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function QuickAction({ href, label, external = false }: { href: string | null; label: string; external?: boolean }) {
  if (!href) {
    return (
      <span className="inline-flex items-center justify-center rounded-full border border-[#d9e5eb] bg-[#f7fbfd] px-4 py-2.5 text-sm text-[#89a0ad]">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex items-center justify-center rounded-full border border-[#cddbe4] bg-white px-4 py-2.5 text-sm font-medium text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
    >
      {label}
    </a>
  );
}
