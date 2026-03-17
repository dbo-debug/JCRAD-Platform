"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { TerritoryOption } from "@/lib/routeWorkspace";
import {
  buildTerritoryStats,
  formatDate,
  getCoordinateCoverageState,
  setQueryParam,
  titleCase,
} from "@/components/workspace/routeUtils";

type CustomerWorkspaceIndexProps = {
  customers: CustomerSummary[];
  territoryOptions: TerritoryOption[];
  initialFilters: {
    q: string;
    savedView: string;
    territory: string;
    owner: string;
    status: string;
    stage: string;
    contactCoverage: string;
    routeReadiness: string;
    orderState: string;
    organizeBy: string;
    sort: string;
  };
};

type SavedViewKey = "all" | "pipeline" | "unassigned" | "missing_primary" | "with_orders";
type SortKey = "activity_desc" | "name_asc" | "name_desc" | "orders_desc" | "owner_asc";
type ContactCoverageFilter = "all" | "has_contacts" | "missing_primary" | "no_contacts";
type RouteReadinessFilter = "all" | "route_ready" | "no_territory" | "no_route_day" | "no_coords" | "address_ready";
type OrderStateFilter = "all" | "has_orders" | "no_orders";
type OrganizeBy = "none" | "territory" | "owner" | "route_day" | "stage";

const SAVED_VIEWS: Array<{ key: SavedViewKey; label: string; description: string }> = [
  { key: "all", label: "All Accounts", description: "Full CRM account list." },
  { key: "pipeline", label: "Pipeline", description: "Active accounts moving through sales." },
  { key: "unassigned", label: "Unassigned", description: "Accounts missing an owner." },
  { key: "missing_primary", label: "Missing Primary Contact", description: "Accounts missing a primary contact." },
  { key: "with_orders", label: "Order History", description: "Accounts with at least one order." },
];

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
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
    customer.routeDay,
    customer.visitStatus,
    customer.website,
    customer.mainPhone,
    ...customer.primaryContacts.flatMap((contact) => [contact.name, contact.email, contact.phone, contact.title]),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

function getRouteReadiness(customer: CustomerSummary): Exclude<RouteReadinessFilter, "all"> | "other" {
  const hasCoords = customer.latitude !== null && customer.longitude !== null;
  if (customer.territoryCode && customer.routeDay && hasCoords) return "route_ready";
  if (!customer.territoryCode) return "no_territory";
  if (!customer.routeDay) return "no_route_day";
  const coordinateState = getCoordinateCoverageState(customer);
  if (coordinateState === "address_ready") return "address_ready";
  if (coordinateState !== "has_coords") return "no_coords";
  return "other";
}

function compareGroupLabels(left: string, right: string) {
  if (left.startsWith("Unassigned") || left === "No Stage" || left === "No Route Day") return 1;
  if (right.startsWith("Unassigned") || right === "No Stage" || right === "No Route Day") return -1;
  return left.localeCompare(right);
}

export default function CustomerWorkspaceIndex({ customers, territoryOptions, initialFilters }: CustomerWorkspaceIndexProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [draftSearch, setDraftSearch] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [savedView, setSavedView] = useState<SavedViewKey>(
    initialFilters.savedView === "pipeline" ||
      initialFilters.savedView === "unassigned" ||
      initialFilters.savedView === "missing_primary" ||
      initialFilters.savedView === "with_orders"
      ? initialFilters.savedView
      : "all"
  );
  const [territoryFilter, setTerritoryFilter] = useState(initialFilters.territory || "all");
  const [ownerFilter, setOwnerFilter] = useState(initialFilters.owner || "all");
  const [statusFilter, setStatusFilter] = useState(initialFilters.status || "all");
  const [stageFilter, setStageFilter] = useState(initialFilters.stage || "all");
  const [contactCoverage, setContactCoverage] = useState<ContactCoverageFilter>(
    initialFilters.contactCoverage === "has_contacts" ||
      initialFilters.contactCoverage === "missing_primary" ||
      initialFilters.contactCoverage === "no_contacts"
      ? initialFilters.contactCoverage
      : "all"
  );
  const [routeReadiness, setRouteReadiness] = useState<RouteReadinessFilter>(
    initialFilters.routeReadiness === "route_ready" ||
      initialFilters.routeReadiness === "no_territory" ||
      initialFilters.routeReadiness === "no_route_day" ||
      initialFilters.routeReadiness === "no_coords" ||
      initialFilters.routeReadiness === "address_ready"
      ? initialFilters.routeReadiness
      : "all"
  );
  const [orderState, setOrderState] = useState<OrderStateFilter>(
    initialFilters.orderState === "has_orders" || initialFilters.orderState === "no_orders" ? initialFilters.orderState : "all"
  );
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>(
    initialFilters.organizeBy === "territory" ||
      initialFilters.organizeBy === "owner" ||
      initialFilters.organizeBy === "route_day" ||
      initialFilters.organizeBy === "stage"
      ? initialFilters.organizeBy
      : "none"
  );
  const [sortKey, setSortKey] = useState<SortKey>(
    initialFilters.sort === "name_asc" || initialFilters.sort === "name_desc" || initialFilters.sort === "orders_desc" || initialFilters.sort === "owner_asc"
      ? initialFilters.sort
      : "activity_desc"
  );
  const [referenceNow] = useState(() => Date.now());

  const statuses = Array.from(new Set(customers.map((customer) => customer.status).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const stages = Array.from(new Set(customers.map((customer) => customer.stage).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const owners = Array.from(new Set(customers.map((customer) => customer.assignedSalesName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const territoryLabelMap = new Map(territoryOptions.map((option) => [option.value, option.label]));

  useEffect(() => {
    const params = new URLSearchParams();
    setQueryParam(params, "q", searchQuery.trim(), [""]);
    setQueryParam(params, "savedView", savedView, ["all", ""]);
    setQueryParam(params, "territory", territoryFilter);
    setQueryParam(params, "owner", ownerFilter);
    setQueryParam(params, "status", statusFilter);
    setQueryParam(params, "stage", stageFilter);
    setQueryParam(params, "contactCoverage", contactCoverage);
    setQueryParam(params, "routeReadiness", routeReadiness);
    setQueryParam(params, "orderState", orderState);
    setQueryParam(params, "organizeBy", organizeBy, ["none", ""]);
    setQueryParam(params, "sort", sortKey, ["activity_desc", ""]);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [contactCoverage, orderState, organizeBy, ownerFilter, pathname, routeReadiness, router, savedView, searchQuery, sortKey, stageFilter, statusFilter, territoryFilter]);

  let visibleCustomers = customers.filter((customer) => {
    const query = normalizeText(searchQuery);
    if (query && !getCustomerSearchText(customer).includes(query)) return false;
    if (territoryFilter !== "all" && (customer.territoryCode || "") !== territoryFilter) return false;
    if (ownerFilter !== "all" && (customer.assignedSalesName || "") !== ownerFilter) return false;
    if (statusFilter !== "all" && customer.status !== statusFilter) return false;
    if (stageFilter !== "all" && (customer.stage || "") !== stageFilter) return false;
    if (contactCoverage === "has_contacts" && customer.contactCount === 0) return false;
    if (contactCoverage === "missing_primary" && customer.primaryContacts.length > 0) return false;
    if (contactCoverage === "no_contacts" && customer.contactCount > 0) return false;
    if (routeReadiness !== "all" && getRouteReadiness(customer) !== routeReadiness) return false;
    if (orderState === "has_orders" && customer.counts.orders === 0) return false;
    if (orderState === "no_orders" && customer.counts.orders > 0) return false;

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
  const routeReadyCount = visibleCustomers.filter((customer) => getRouteReadiness(customer) === "route_ready").length;
  const visibleWithOrders = visibleCustomers.filter((customer) => customer.counts.orders > 0).length;
  const territoryStats = buildTerritoryStats(visibleCustomers, referenceNow);

  const sections =
    organizeBy === "territory"
      ? territoryStats
          .sort((left, right) => right.accountCount - left.accountCount || compareGroupLabels(left.territoryKey, right.territoryKey))
          .map((territory) => ({
            key: territory.territoryKey,
            label: territory.territoryKey === "UNASSIGNED" ? "Unassigned Territory" : territoryLabelMap.get(territory.territoryKey) || territory.territoryKey,
            description:
              territory.territoryKey === "UNASSIGNED"
                ? `${territory.accountCount} accounts still need territory assignment.`
                : `${territory.accountCount} accounts in ${territory.territoryKey}.`,
            customers: [...territory.customers].sort((left, right) => left.name.localeCompare(right.name)),
            statLine: `${territory.accountCount} accounts • ${territory.dueToday} due today • ${territory.noCoords} no coords`,
          }))
      : organizeBy === "owner"
        ? Array.from(
            visibleCustomers.reduce((groups, customer) => {
              const key = customer.assignedSalesName || "Unassigned Owner";
              const existing = groups.get(key) || [];
              existing.push(customer);
              groups.set(key, existing);
              return groups;
            }, new Map<string, CustomerSummary[]>())
          )
            .sort((left, right) => compareGroupLabels(left[0], right[0]))
            .map(([key, groupedCustomers]) => ({
              key,
              label: key,
              description: `${groupedCustomers.length} accounts`,
              customers: groupedCustomers,
              statLine: `${groupedCustomers.filter((customer) => customer.counts.orders > 0).length} with orders`,
            }))
        : organizeBy === "route_day"
          ? Array.from(
              visibleCustomers.reduce((groups, customer) => {
                const key = customer.routeDay || "No Route Day";
                const existing = groups.get(key) || [];
                existing.push(customer);
                groups.set(key, existing);
                return groups;
              }, new Map<string, CustomerSummary[]>())
            )
              .sort((left, right) => compareGroupLabels(left[0], right[0]))
              .map(([key, groupedCustomers]) => ({
                key,
                label: key,
                description: `${groupedCustomers.length} accounts`,
                customers: groupedCustomers,
                statLine: `${groupedCustomers.filter((customer) => getRouteReadiness(customer) === "route_ready").length} route ready`,
              }))
          : organizeBy === "stage"
            ? Array.from(
                visibleCustomers.reduce((groups, customer) => {
                  const key = titleCase(customer.stage, "No Stage");
                  const existing = groups.get(key) || [];
                  existing.push(customer);
                  groups.set(key, existing);
                  return groups;
                }, new Map<string, CustomerSummary[]>())
              )
                .sort((left, right) => compareGroupLabels(left[0], right[0]))
                .map(([key, groupedCustomers]) => ({
                  key,
                  label: key,
                  description: `${groupedCustomers.length} accounts`,
                  customers: groupedCustomers,
                  statLine: `${groupedCustomers.filter((customer) => customer.contactCount > 0).length} with contacts`,
                }))
            : [
                {
                  key: "all",
                  label: "All Customers",
                  description: `${visibleCustomers.length} filtered accounts`,
                  customers: visibleCustomers,
                  statLine: `${visibleWithOrders} with orders • ${routeReadyCount} route ready`,
                },
              ];

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => setSearchQuery(draftSearch.trim()));
  }

  function handleClearSearch() {
    startTransition(() => {
      setDraftSearch("");
      setSearchQuery("");
    });
  }

  function resetFilters() {
    startTransition(() => {
      setDraftSearch("");
      setSearchQuery("");
      setSavedView("all");
      setTerritoryFilter("all");
      setOwnerFilter("all");
      setStatusFilter("all");
      setStageFilter("all");
      setContactCoverage("all");
      setRouteReadiness("all");
      setOrderState("all");
      setOrganizeBy("none");
      setSortKey("activity_desc");
    });
  }

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[820px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Segment Builder</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Reusable audience and action workspace for customers, routes, and future campaigns</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#5c7483]">
              Build customer segments by territory, owner, route day, stage, and order behavior. This workspace is designed to support rep assignment, route inclusion, and future audience actions without changing the data model.
            </p>
          </div>
          <div className="grid w-full gap-3 rounded-2xl border border-[#dbe8ef] bg-white/85 p-4 shadow-sm sm:max-w-[320px] xl:w-[320px] xl:flex-none">
            <MetricLine label="Visible Accounts" value={String(visibleCustomers.length)} />
            <MetricLine label="With Contacts" value={String(visibleWithContacts)} />
            <MetricLine label="Assigned" value={String(visibleWithOwners)} />
            <MetricLine label="Route Ready" value={String(routeReadyCount)} />
            <MetricLine label="With Orders" value={String(visibleWithOrders)} />
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

      <section className="rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)] lg:px-6">
        <form onSubmit={handleSearchSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_140px_120px]">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Search accounts</span>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search account, contact, territory, route day, phone, website"
              className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
          </label>

          <button type="submit" className="mt-auto rounded-full bg-[#173543] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
            Search
          </button>
          <button
            type="button"
            onClick={handleClearSearch}
            className="mt-auto rounded-full border border-[#d0dde5] bg-white px-4 py-3 text-sm font-semibold text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Clear
          </button>
        </form>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-[repeat(6,minmax(0,1fr))]">
          <FilterSelect label="Territory" value={territoryFilter} onChange={setTerritoryFilter} options={territoryOptions.map((option) => ({ value: option.value, label: option.label }))} />
          <FilterSelect label="Owner" value={ownerFilter} onChange={setOwnerFilter} options={owners.map((owner) => ({ value: owner, label: owner }))} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={statuses.map((status) => ({ value: status, label: titleCase(status) }))} />
          <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={stages.map((stage) => ({ value: stage, label: titleCase(stage) }))} />
          <FilterSelect
            label="Contact Coverage"
            value={contactCoverage}
            onChange={(value) => setContactCoverage(value as ContactCoverageFilter)}
            options={[
              { value: "has_contacts", label: "Has Contacts" },
              { value: "missing_primary", label: "Missing Primary" },
              { value: "no_contacts", label: "No Contacts" },
            ]}
          />
          <FilterSelect
            label="Route Readiness"
            value={routeReadiness}
            onChange={(value) => setRouteReadiness(value as RouteReadinessFilter)}
            options={[
              { value: "route_ready", label: "Route Ready" },
              { value: "no_territory", label: "No Territory" },
              { value: "no_route_day", label: "No Route Day" },
              { value: "no_coords", label: "No Coordinates" },
              { value: "address_ready", label: "Address Ready, No Coords" },
            ]}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <FilterSelect
            label="Has Orders"
            value={orderState}
            onChange={(value) => setOrderState(value as OrderStateFilter)}
            options={[
              { value: "has_orders", label: "Has Orders" },
              { value: "no_orders", label: "No Orders" },
            ]}
          />
          <FilterSelect
            label="Organize By"
            value={organizeBy}
            onChange={(value) => setOrganizeBy(value as OrganizeBy)}
            options={[
              { value: "territory", label: "Territory" },
              { value: "owner", label: "Owner" },
              { value: "route_day", label: "Route Day" },
              { value: "stage", label: "Stage" },
            ]}
            allowAllLabel="None"
          />
          <FilterSelect
            label="Sort"
            value={sortKey}
            onChange={(value) => setSortKey(value as SortKey)}
            options={[
              { value: "activity_desc", label: "Recent Activity" },
              { value: "name_asc", label: "Account Name A-Z" },
              { value: "name_desc", label: "Account Name Z-A" },
              { value: "orders_desc", label: "Most Orders" },
              { value: "owner_asc", label: "Owner A-Z" },
            ]}
            allowAllLabel={null}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
            Search mode: explicit apply
          </span>
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
            Organize by {organizeBy === "none" ? "none" : titleCase(organizeBy)}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]"
          >
            Reset filters
          </button>
        </div>
      </section>

      {organizeBy === "territory" && sections.length > 0 ? (
        <nav className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-[0_12px_32px_rgba(16,42,67,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Territory Jump</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.key}
                href={`#customer-segment-${section.key}`}
                className="rounded-full border border-[#d5e1e8] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4a6575] transition hover:bg-white hover:text-[#173543]"
              >
                {section.label} ({section.customers.length})
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <section className="space-y-5">
        {sections.map((section) => (
          <div
            key={section.key}
            id={organizeBy === "territory" ? `customer-segment-${section.key}` : undefined}
            className={organizeBy === "none" ? "" : "rounded-[28px] border border-[#dbe8ef] bg-white p-5 shadow-[0_12px_32px_rgba(16,42,67,0.06)]"}
          >
            {organizeBy !== "none" ? (
              <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">{titleCase(organizeBy.replace("_", " "))}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#173543]">{section.label}</h3>
                  <p className="mt-1 text-sm text-[#5c7483]">{section.description}</p>
                </div>
                <div className="rounded-2xl border border-[#dbe8ef] bg-[#f8fbfc] px-4 py-3 text-sm text-[#4f6877]">{section.statLine}</div>
              </div>
            ) : null}

            <div className="space-y-4">
              {section.customers.map((customer) => (
                <CustomerCard key={customer.id} customer={customer} territoryOptions={territoryOptions} />
              ))}
            </div>
          </div>
        ))}

        {visibleCustomers.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#cfdde6] bg-white px-6 py-16 text-center">
            <p className="text-lg font-semibold text-[#173543]">No accounts match the current segment.</p>
            <p className="mt-2 text-sm text-[#5c7483]">Adjust the search, filters, or organization mode to widen the workspace.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CustomerCard({ customer, territoryOptions }: { customer: CustomerSummary; territoryOptions: TerritoryOption[] }) {
  const primaryContact = customer.primaryContacts[0] || null;
  const activityCount = customer.counts.estimates + customer.counts.orders + customer.counts.packagingSubmissions + customer.counts.documents;
  const primaryEmailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
  const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);
  const websiteHref = normalizeWebsiteHref(customer.website);
  const routeReadiness = getRouteReadiness(customer);

  return (
    <article className="rounded-[28px] border border-[#d9e7ee] bg-white p-4 shadow-[0_14px_40px_rgba(16,42,67,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(16,42,67,0.08)] lg:p-5">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/workspace/customers/${customer.id}`} className="text-lg font-semibold text-[#173543] transition hover:text-[#0f766e]">
                  {customer.name}
                </Link>
                <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass(customer.status)].join(" ")}>
                  {titleCase(customer.status)}
                </span>
                <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", stageChipClass(customer.stage)].join(" ")}>
                  {titleCase(customer.stage, "No Stage")}
                </span>
                <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#496574]">
                  {customer.territoryCode ? `Territory ${customer.territoryCode}` : "Territory Open"}
                </span>
                <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2.5 py-1 text-xs font-semibold text-[#496574]">
                  {customer.routeDay ? `Route ${customer.routeDay}` : "No Route Day"}
                </span>
                <RouteReadinessPill state={routeReadiness} />
              </div>
              <p className="mt-2 text-sm text-[#5a7483]">
                Owner {customer.assignedSalesName || "Unassigned"}
                {customer.assignedSalesEmail ? ` • ${customer.assignedSalesEmail}` : ""}
                {customer.assignedRouteRepName ? ` • Route Rep ${customer.assignedRouteRepName}` : ""}
              </p>
            </div>

            <div className="grid w-full gap-2 rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3 text-sm text-[#53707f] xl:max-w-[250px] xl:flex-none">
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

          <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
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
              label="Routing"
              title={customer.routeDay ? `Route ${customer.routeDay}` : "No route day"}
              lines={[
                customer.visitStatus ? `Visit ${titleCase(customer.visitStatus)}` : "Visit status open",
                customer.latitude !== null && customer.longitude !== null ? `Geo ${customer.latitude.toFixed(4)}, ${customer.longitude.toFixed(4)}` : "No coordinates yet",
                customer.nextVisitDueAt ? `Next due ${formatDate(customer.nextVisitDueAt)}` : null,
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

        <div className="flex w-full flex-col gap-2 sm:max-w-[220px] 2xl:w-[220px] 2xl:flex-none">
          <Link
            href={`/workspace/customers/${customer.id}`}
            className="inline-flex items-center justify-center rounded-full bg-[#173543] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
          >
            Open Account
          </Link>
          <RouteActionButton customer={customer} territoryOptions={territoryOptions} />
          <QuickAction href={primaryEmailHref} label="Email Primary" />
          <QuickAction href={phoneHref} label="Call Account" />
          <QuickAction href={websiteHref} label="Visit Website" external />
        </div>
      </div>
    </article>
  );
}

function RouteActionButton({ customer, territoryOptions }: { customer: CustomerSummary; territoryOptions: TerritoryOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const territory = territoryOptions.find((option) => option.value === customer.territoryCode) || null;
  const nextRouteDay = customer.routeDay || territory?.routeDayDefault || null;
  const canAddToRoute = Boolean(customer.territoryCode || customer.routeDay);
  const hasRouteConfig = Boolean(customer.territoryCode || customer.routeDay || customer.visitStatus || customer.assignedRouteRepUserId || customer.routePriority);

  async function handleAddToRoute() {
    if (!canAddToRoute) return;
    setBusy(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/workspace/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          territory_code: customer.territoryCode,
          route_day: nextRouteDay,
          visit_status: customer.visitStatus || "due",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as { error?: string }).error || `Save failed (${res.status})`));
      }

      setStatusMessage(hasRouteConfig ? "Route updated." : "Added to route.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Route update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void handleAddToRoute()}
        disabled={!canAddToRoute || busy}
        className={[
          "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
          canAddToRoute ? "border border-[#cddbe4] bg-white text-[#21424d] hover:border-[#14b8a6] hover:text-[#0f766e]" : "border border-[#d9e5eb] bg-[#f7fbfd] text-[#89a0ad]",
        ].join(" ")}
      >
        {busy ? "Saving..." : canAddToRoute ? "Add to Route" : "Needs Territory/Day"}
      </button>
      {statusMessage ? <p className="px-1 text-xs text-[#4f6877]">{statusMessage}</p> : null}
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
  allowAllLabel = "All",
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  allowAllLabel?: string | null;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => startTransition(() => onChange(event.target.value))}
        className="rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
      >
        {allowAllLabel !== null ? <option value="all">{allowAllLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-[#506877]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-lg font-semibold text-[#173543]">{value}</span>
    </div>
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

function RouteReadinessPill({ state }: { state: ReturnType<typeof getRouteReadiness> }) {
  const toneClass =
    state === "route_ready"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : state === "no_territory" || state === "no_route_day"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  const label =
    state === "route_ready"
      ? "Route Ready"
      : state === "no_territory"
        ? "No Territory"
        : state === "no_route_day"
          ? "No Route Day"
          : state === "address_ready"
            ? "Address Ready"
            : state === "no_coords"
              ? "No Coords"
              : "Route Open";

  return <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass].join(" ")}>{label}</span>;
}
