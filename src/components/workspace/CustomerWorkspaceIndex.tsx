"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import { isRouteEligibleCustomer } from "@/lib/routeEligibility";
import type { PendingRouteStop } from "@/lib/routeStopQueue";
import type { RouteRepOption, TerritoryOption } from "@/lib/routeWorkspace";
import {
  buildTerritoryStats,
  formatDate,
  getCoordinateCoverageState,
  setQueryParam,
  titleCase,
} from "@/components/workspace/routeUtils";

type CustomerWorkspaceIndexProps = {
  customers: CustomerSummary[];
  initialPendingStops: PendingRouteStop[];
  staffRole: "admin" | "sales";
  currentUserId: string;
  salesRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  initialFilters: {
    q: string;
    savedView: string;
    source: string;
    importSource: string;
    hotLead: string;
    taskState: string;
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

type BulkActionKind =
  | "assign_sales_rep"
  | "assign_territory"
  | "assign_route_day"
  | "add_to_pending_stops"
  | "remove_from_pending_stops"
  | "convert_to_source"
  | "archive_customers"
  | "restore_customers";
type BulkActionState = {
  kind: BulkActionKind;
  value: string;
};

type SavedViewKey = "all" | "pipeline" | "unassigned" | "missing_primary" | "with_orders" | "hall_of_flowers" | "archived";
type SortKey = "activity_desc" | "name_asc" | "name_desc" | "orders_desc" | "owner_asc";
type ContactCoverageFilter = "all" | "has_contacts" | "missing_primary" | "no_contacts";
type RouteReadinessFilter = "all" | "route_ready" | "no_territory" | "no_route_day" | "no_route_rep" | "no_coords" | "address_ready";
type OrderStateFilter = "all" | "has_orders" | "no_orders";
type HotLeadFilter = "all" | "hot" | "not_hot";
type TaskStateFilter = "all" | "has_open_task" | "no_open_task" | "overdue_task";
type OrganizeBy = "none" | "territory" | "owner" | "route_day" | "stage";

const ROUTE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WORKSPACE_STICKY_TOP_CLASS = "top-[calc(var(--workspace-header-offset,5rem)+1rem)]";
const BULK_ACTIONS: Array<{ key: BulkActionKind; label: string }> = [
  { key: "assign_sales_rep", label: "Assign Sales Rep" },
  { key: "assign_territory", label: "Assign Territory" },
  { key: "assign_route_day", label: "Assign Route Day" },
  { key: "add_to_pending_stops", label: "Add to Pending Stops" },
  { key: "remove_from_pending_stops", label: "Remove from Pending Stops" },
  { key: "convert_to_source", label: "Convert to Source" },
  { key: "archive_customers", label: "Archive Customers" },
  { key: "restore_customers", label: "Restore Customers" },
];

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

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
    customer.city,
    customer.source,
    customer.importSource,
    customer.isHotLead ? "hot lead" : null,
    customer.isHallOfFlowersLead ? "hall of flowers" : null,
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

function formatSourceLabel(value: string | null | undefined, fallback = "Unspecified") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return titleCase(text.replace(/-/g, "_"));
}

function getFollowUpState(customer: CustomerSummary) {
  if (!customer.hasOpenTask) return "No Open Task";
  if (customer.overdueTaskCount > 0) return "Task Overdue";
  if (customer.nextTaskDueAt) return `Due ${formatDate(customer.nextTaskDueAt)}`;
  return titleCase(customer.latestTaskStatus, "Open Task");
}

function followUpChipClass(customer: CustomerSummary) {
  if (!customer.hasOpenTask) return "border-[#e1d7d3] bg-[#f5f1ef] text-[#6f5b54]";
  if (customer.overdueTaskCount > 0) return "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]";
  return "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]";
}

type WorkspacePresetKey = "all" | "hall_of_flowers" | "hot_leads" | "no_task" | "overdue" | "archived";

function denseButtonClass(tone: "primary" | "secondary" = "secondary") {
  return tone === "primary"
    ? "inline-flex h-9 items-center justify-center rounded-full bg-[#173543] px-3.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]"
    : "inline-flex h-9 items-center justify-center rounded-full border border-[#d0dde5] bg-white px-3.5 text-sm font-medium text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543]";
}

function toolbarSelectClass() {
  return "h-9 min-w-0 rounded-full border border-[#cedde6] bg-[#fbfdfe] px-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white";
}

function getRouteReadiness(customer: CustomerSummary): Exclude<RouteReadinessFilter, "all"> | "other" {
  if (customer.territoryCode && customer.routeDay && customer.assignedRouteRepUserId && isRouteEligibleCustomer(customer)) return "route_ready";
  if (!customer.territoryCode) return "no_territory";
  if (!customer.routeDay) return "no_route_day";
  if (!customer.assignedRouteRepUserId) return "no_route_rep";
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

export default function CustomerWorkspaceIndex({
  customers,
  initialPendingStops,
  staffRole,
  currentUserId,
  salesRepOptions,
  territoryOptions,
  initialFilters,
}: CustomerWorkspaceIndexProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftSearch, setDraftSearch] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [savedView, setSavedView] = useState<SavedViewKey>(
    initialFilters.savedView === "pipeline" ||
      initialFilters.savedView === "unassigned" ||
    initialFilters.savedView === "missing_primary" ||
      initialFilters.savedView === "with_orders" ||
      initialFilters.savedView === "hall_of_flowers" ||
      initialFilters.savedView === "archived"
      ? initialFilters.savedView
      : "all"
  );
  const [sourceFilter, setSourceFilter] = useState(initialFilters.source || "all");
  const [importSourceFilter, setImportSourceFilter] = useState(initialFilters.importSource || "all");
  const [hotLeadFilter, setHotLeadFilter] = useState<HotLeadFilter>(
    initialFilters.hotLead === "hot" || initialFilters.hotLead === "not_hot" ? initialFilters.hotLead : "all"
  );
  const [taskStateFilter, setTaskStateFilter] = useState<TaskStateFilter>(
    initialFilters.taskState === "has_open_task" || initialFilters.taskState === "no_open_task" || initialFilters.taskState === "overdue_task"
      ? initialFilters.taskState
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
      initialFilters.routeReadiness === "no_route_rep" ||
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
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkActionState>({
    kind: staffRole === "admin" ? "assign_sales_rep" : "assign_territory",
    value: "",
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatusMessage, setBulkStatusMessage] = useState<string | null>(null);
  const [pendingStops, setPendingStops] = useState<PendingRouteStop[]>(initialPendingStops);
  const [visibleGeocodeBusy, setVisibleGeocodeBusy] = useState(false);
  const [visibleGeocodeStatus, setVisibleGeocodeStatus] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    Boolean(
      initialFilters.territory ||
        initialFilters.owner ||
        initialFilters.status ||
        initialFilters.stage ||
        (initialFilters.routeReadiness && initialFilters.routeReadiness !== "all") ||
        (initialFilters.orderState && initialFilters.orderState !== "all")
    )
  );

  const activeCustomers = customers.filter((customer) => !customer.archivedAt);
  const archivedCustomers = customers.filter((customer) => Boolean(customer.archivedAt));
  const statuses = Array.from(new Set(customers.map((customer) => customer.status).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const stages = Array.from(new Set(customers.map((customer) => customer.stage).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const owners = Array.from(new Set(customers.map((customer) => customer.assignedSalesName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const sources = Array.from(new Set(customers.map((customer) => customer.source).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const territoryLabelMap = new Map(territoryOptions.map((option) => [option.value, option.label]));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(draftSearch.trim());
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [draftSearch]);

  useEffect(() => {
    const params = new URLSearchParams();
    setQueryParam(params, "q", searchQuery.trim(), [""]);
    setQueryParam(params, "savedView", savedView, ["all", ""]);
    setQueryParam(params, "source", sourceFilter);
    setQueryParam(params, "importSource", importSourceFilter);
    setQueryParam(params, "hotLead", hotLeadFilter);
    setQueryParam(params, "taskState", taskStateFilter);
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
    if (next === searchParams.toString()) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    contactCoverage,
    hotLeadFilter,
    importSourceFilter,
    orderState,
    organizeBy,
    ownerFilter,
    pathname,
    routeReadiness,
    router,
    savedView,
    searchParams,
    searchQuery,
    sortKey,
    sourceFilter,
    stageFilter,
    statusFilter,
    taskStateFilter,
    territoryFilter,
  ]);

  let visibleCustomers = customers.filter((customer) => {
    if (savedView === "archived") {
      if (!customer.archivedAt) return false;
    } else if (customer.archivedAt) {
      return false;
    }

    const query = normalizeText(searchQuery);
    if (query && !getCustomerSearchText(customer).includes(query)) return false;
    if (sourceFilter !== "all" && (customer.source || "") !== sourceFilter) return false;
    if (importSourceFilter !== "all" && (customer.importSource || "") !== importSourceFilter) return false;
    if (hotLeadFilter === "hot" && !customer.isHotLead) return false;
    if (hotLeadFilter === "not_hot" && customer.isHotLead) return false;
    if (taskStateFilter === "has_open_task" && !customer.hasOpenTask) return false;
    if (taskStateFilter === "no_open_task" && customer.hasOpenTask) return false;
    if (taskStateFilter === "overdue_task" && customer.overdueTaskCount === 0) return false;
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
    if (savedView === "hall_of_flowers" && !customer.isHallOfFlowersLead) return false;

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

  const visibleCustomerIds = visibleCustomers.map((customer) => customer.id);
  const visibleCustomerIdSet = new Set(visibleCustomerIds);
  const pendingCustomerIdSet = new Set(pendingStops.map((stop) => stop.customerId));
  const visibleCustomerIdsKey = visibleCustomerIds.join("|");
  const selectedVisibleCustomerIds = selectedCustomerIds.filter((id) => visibleCustomerIdSet.has(id));
  const selectedVisibleCustomers = visibleCustomers.filter((customer) => selectedVisibleCustomerIds.includes(customer.id));
  const allVisibleSelected = visibleCustomers.length > 0 && selectedVisibleCustomerIds.length === visibleCustomers.length;

  const visibleWithContacts = visibleCustomers.filter((customer) => customer.contactCount > 0).length;
  const visibleWithOwners = visibleCustomers.filter((customer) => customer.assignedSalesName).length;
  const hallOfFlowersCount = visibleCustomers.filter((customer) => customer.isHallOfFlowersLead).length;
  const hotLeadCount = visibleCustomers.filter((customer) => customer.isHotLead).length;
  const routeReadyCount = visibleCustomers.filter((customer) => getRouteReadiness(customer) === "route_ready").length;
  const visibleWithOrders = visibleCustomers.filter((customer) => customer.counts.orders > 0).length;
  const navCounts = {
    all: activeCustomers.length,
    hallOfFlowers: activeCustomers.filter((customer) => customer.isHallOfFlowersLead).length,
    hotLeads: activeCustomers.filter((customer) => customer.isHotLead).length,
    noTask: activeCustomers.filter((customer) => !customer.hasOpenTask).length,
    overdue: activeCustomers.filter((customer) => customer.overdueTaskCount > 0).length,
    archived: archivedCustomers.length,
  };
  const advancedFilterCount = [
    territoryFilter !== "all",
    ownerFilter !== "all",
    statusFilter !== "all",
    stageFilter !== "all",
    routeReadiness !== "all",
    orderState !== "all",
  ].filter(Boolean).length;
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

  useEffect(() => {
    const nextVisibleIds = new Set(visibleCustomerIdsKey ? visibleCustomerIdsKey.split("|") : []);
    setSelectedCustomerIds((current) => {
      const next = current.filter((id) => nextVisibleIds.has(id));
      return sameIds(current, next) ? current : next;
    });
  }, [visibleCustomerIdsKey]);

  useEffect(() => {
    if (staffRole === "admin") return;
    setBulkAction((current) => {
      const nextKind = current.kind === "assign_sales_rep" ? "assign_territory" : current.kind;
      const nextValue = current.kind === "assign_sales_rep" ? "" : current.value;
      if (nextKind === current.kind && nextValue === current.value) {
        return current;
      }
      return { ...current, kind: nextKind, value: nextValue };
    });
  }, [currentUserId, staffRole]);

  async function syncPendingStops(args: { method: "POST" | "DELETE"; body: Record<string, unknown> }) {
    const res = await fetch("/api/workspace/route-stop-queue", {
      method: args.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Pending stop update failed (${res.status})`));

    const queueRows = Array.isArray(json.queue) ? (json.queue as Array<Record<string, unknown>>) : [];
    const queueByCustomerId = new Map(initialPendingStops.map((stop) => [stop.customerId, stop]));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const nextPendingStops: PendingRouteStop[] = [];

    queueRows.forEach((row) => {
      const customerId = String(row.customer_id || row.customerId || "").trim();
      const customer = customerById.get(customerId);
      const id = String(row.id || "").trim();
      if (!customer || !id || !customerId) return;

      nextPendingStops.push({
        id,
        customerId,
        addedByUserId: String(row.added_by_user_id || row.addedByUserId || currentUserId).trim(),
        createdAt: String(row.created_at || row.createdAt || queueByCustomerId.get(customerId)?.createdAt || "").trim() || null,
        customer,
      });
    });

    setPendingStops(nextPendingStops);
    return nextPendingStops;
  }

  async function togglePendingStop(customerId: string, nextSelected: boolean) {
    setBulkStatusMessage(null);
    await syncPendingStops({
      method: nextSelected ? "POST" : "DELETE",
      body: { customer_ids: [customerId] },
    });
  }

  function toggleCustomerSelection(customerId: string) {
    setSelectedCustomerIds((current) => (current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]));
  }

  function selectAllVisible() {
    setSelectedCustomerIds(visibleCustomerIds);
    setBulkStatusMessage(null);
  }

  function clearSelection() {
    setSelectedCustomerIds([]);
    setBulkStatusMessage(null);
  }

  function handleClearSearch() {
    startTransition(() => {
      setDraftSearch("");
      setSearchQuery("");
    });
  }

  function clearConflictingFilters() {
    setHotLeadFilter("all");
    setTaskStateFilter("all");
    setOwnerFilter("all");
    setTerritoryFilter("all");
  }

  function applyWorkspacePreset(preset: WorkspacePresetKey) {
    startTransition(() => {
      setDraftSearch("");
      setSearchQuery("");
      clearConflictingFilters();
      setSavedView("all");
      setSourceFilter("all");
      setImportSourceFilter("all");

      if (preset === "hall_of_flowers") {
        setSavedView("hall_of_flowers");
        setSourceFilter("hall_of_flowers");
        setImportSourceFilter("event_quick_add");
        return;
      }
      if (preset === "hot_leads") {
        setHotLeadFilter("hot");
        return;
      }
      if (preset === "no_task") {
        setTaskStateFilter("no_open_task");
        return;
      }
      if (preset === "overdue") {
        setTaskStateFilter("overdue_task");
        return;
      }
      if (preset === "archived") {
        setSavedView("archived");
      }
    });
  }

  function resetFilters() {
    startTransition(() => {
      setDraftSearch("");
      setSearchQuery("");
      setSavedView("all");
      setSourceFilter("all");
      setImportSourceFilter("all");
      setHotLeadFilter("all");
      setTaskStateFilter("all");
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

  async function geocodeVisibleResults() {
    if (staffRole !== "admin" || visibleCustomers.length === 0 || visibleGeocodeBusy) return;

    setVisibleGeocodeBusy(true);
    setVisibleGeocodeStatus(null);

    try {
      const res = await fetch("/api/admin/customers/geocode-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 50,
          customer_ids: visibleCustomerIds.slice(0, 50),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Visible geocode failed (${res.status})`));

      setVisibleGeocodeStatus(
        `Processed visible results: attempted ${Number(json.attempted || 0)} • geocoded ${Number(json.geocoded || 0)} • failed ${Number(json.failed || 0)} • missing ${Number(
          json.missing_address || 0
        )}`
      );
      router.refresh();
    } catch (error) {
      setVisibleGeocodeStatus(error instanceof Error ? error.message : "Visible geocode failed");
    } finally {
      setVisibleGeocodeBusy(false);
    }
  }

  async function applyBulkAction() {
    if (selectedVisibleCustomers.length === 0 || bulkBusy) return;
    if (
      bulkAction.kind !== "add_to_pending_stops" &&
      bulkAction.kind !== "remove_from_pending_stops" &&
      bulkAction.kind !== "convert_to_source" &&
      bulkAction.kind !== "archive_customers" &&
      bulkAction.kind !== "restore_customers" &&
      !bulkAction.value
    ) {
      setBulkStatusMessage("Choose a value before applying the bulk action.");
      return;
    }

    setBulkBusy(true);
    setBulkStatusMessage(null);

    let successCount = 0;
    let skippedCount = 0;

    try {
      if (bulkAction.kind === "add_to_pending_stops" || bulkAction.kind === "remove_from_pending_stops") {
        await syncPendingStops({
          method: bulkAction.kind === "add_to_pending_stops" ? "POST" : "DELETE",
          body: { customer_ids: selectedVisibleCustomers.map((customer) => customer.id) },
        });
        setBulkStatusMessage(
          `${bulkAction.kind === "add_to_pending_stops" ? "Added" : "Removed"} ${selectedVisibleCustomers.length} selected account${
            selectedVisibleCustomers.length === 1 ? "" : "s"
          } ${bulkAction.kind === "add_to_pending_stops" ? "to" : "from"} pending stops.`
        );
        setSelectedCustomerIds([]);
        router.refresh();
        return;
      }

      if (bulkAction.kind === "convert_to_source") {
        const res = await fetch("/api/workspace/customers/convert-to-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_ids: selectedVisibleCustomers.map((customer) => customer.id) }),
        });
        const json = await parseJsonSafe(res);
        const converted = Number(json.converted || 0);
        const insertedSourceCount = Number(json.inserted_source_count || 0);
        if (!res.ok || json.ok !== true || converted <= 0 || insertedSourceCount <= 0) {
          throw new Error(String(json.error || `Conversion failed (${res.status})`));
        }
        setBulkStatusMessage(`Converted ${converted} selected account${converted === 1 ? "" : "s"} into Sources.`);
        setSelectedCustomerIds([]);
        router.refresh();
        return;
      }

      if (bulkAction.kind === "archive_customers" || bulkAction.kind === "restore_customers") {
        const res = await fetch("/api/workspace/customers/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_ids: selectedVisibleCustomers.map((customer) => customer.id),
            archived: bulkAction.kind === "archive_customers",
          }),
        });
        const json = await parseJsonSafe(res);
        const updatedCount = Number(json.updated_customer_count || 0);
        if (!res.ok || json.ok !== true || updatedCount <= 0) {
          throw new Error(String(json.error || `Archive update failed (${res.status})`));
        }
        setBulkStatusMessage(
          `${bulkAction.kind === "archive_customers" ? "Archived" : "Restored"} ${updatedCount} selected account${updatedCount === 1 ? "" : "s"}.`
        );
        setSelectedCustomerIds([]);
        router.refresh();
        return;
      }

      for (const customer of selectedVisibleCustomers) {
        let payload: Record<string, string | null>;

        if (bulkAction.kind === "assign_sales_rep") {
          payload = { assigned_sales_user_id: bulkAction.value || null };
        } else if (bulkAction.kind === "assign_territory") {
          payload = { territory_code: bulkAction.value || null };
        } else if (bulkAction.kind === "assign_route_day") {
          payload = { route_day: bulkAction.value || null };
        } else {
          skippedCount += 1;
          continue;
        }

        const res = await fetch(`/api/workspace/customers/${customer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await parseJsonSafe(res);
        if (!res.ok) {
          throw new Error(String(json.error || `Save failed for ${customer.name} (${res.status})`));
        }

        successCount += 1;
      }

      setBulkStatusMessage(
        `Updated ${successCount} selected account${successCount === 1 ? "" : "s"}${skippedCount ? `, skipped ${skippedCount}` : ""}.`
      );
      setSelectedCustomerIds([]);
      router.refresh();
    } catch (error) {
      setBulkStatusMessage(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const viewNavItems = [
    { key: "all" as const, label: "All Accounts", count: navCounts.all },
    { key: "hall_of_flowers" as const, label: "Hall of Flowers", count: navCounts.hallOfFlowers },
    { key: "hot_leads" as const, label: "Hot Leads", count: navCounts.hotLeads },
    { key: "no_task" as const, label: "No Task", count: navCounts.noTask },
    { key: "overdue" as const, label: "Overdue", count: navCounts.overdue },
    { key: "archived" as const, label: "Archived", count: navCounts.archived },
  ];

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 xl:sticky xl:self-start xl:top-[calc(var(--workspace-header-offset,5rem)+1rem)]">
        <section className="rounded-[24px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4 shadow-[0_10px_22px_rgba(16,42,67,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Customer Views</p>
          <div className="mt-3 space-y-2">
            {viewNavItems.map((item) => {
              const active =
                (item.key === "all" &&
                  savedView === "all" &&
                  sourceFilter === "all" &&
                  importSourceFilter === "all" &&
                  hotLeadFilter === "all" &&
                  taskStateFilter === "all") ||
                (item.key === "hall_of_flowers" && savedView === "hall_of_flowers" && sourceFilter === "hall_of_flowers") ||
                (item.key === "hot_leads" && hotLeadFilter === "hot") ||
                (item.key === "no_task" && taskStateFilter === "no_open_task") ||
                (item.key === "overdue" && taskStateFilter === "overdue_task") ||
                (item.key === "archived" && savedView === "archived");

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyWorkspacePreset(item.key)}
                  className={[
                    "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition",
                    active ? "border-[#14b8a6] bg-[#effcf9] text-[#0f766e]" : "border-[#dbe8ef] bg-white text-[#35505d] hover:border-[#97c7c1] hover:bg-[#f4fbfa]",
                  ].join(" ")}
                >
                  <span className="font-semibold">{item.label}</span>
                  <span className="rounded-full border border-current/15 px-2 py-0.5 text-xs">{item.count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 rounded-[20px] border border-[#dbe8ef] bg-white/90 p-3">
            <MetricLine label="Visible" value={String(visibleCustomers.length)} />
            <MetricLine label="Assigned" value={String(visibleWithOwners)} />
            <MetricLine label="Contacts" value={String(visibleWithContacts)} />
            <MetricLine label="Route Ready" value={String(routeReadyCount)} />
            <MetricLine label="Orders" value={String(visibleWithOrders)} />
          </div>
        </section>
      </aside>

      <div className="min-w-0 space-y-4">
        <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_12px_28px_rgba(16,42,67,0.07)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[760px]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Customer Workspace</p>
              <h2 className="mt-1 text-xl font-semibold text-[#173543]">Operational account queue for follow-up, ownership, and route prep</h2>
              <p className="mt-1 text-sm text-[#5c7483]">
                Work the segment here, then open the account page for deeper edits, history, and operational detail.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-sm text-[#4f6877]">{visibleCustomers.length} visible</span>
              <span className="rounded-full border border-[#f1ddad] bg-[#fff9eb] px-3 py-1.5 text-sm text-[#8a5b00]">{hallOfFlowersCount} Hall of Flowers</span>
              <span className="rounded-full border border-[#ffd3cf] bg-[#fff2f0] px-3 py-1.5 text-sm text-[#b44b40]">{hotLeadCount} hot</span>
            </div>
          </div>
        </section>

        <section className={["sticky z-30 space-y-3 rounded-[24px] border border-[#dbe8ef] bg-white/95 p-3 shadow-[0_10px_22px_rgba(16,42,67,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/90 xl:px-4 xl:py-4", WORKSPACE_STICKY_TOP_CLASS].join(" ")}>
          <div className="grid gap-2 xl:grid-cols-[minmax(260px,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              aria-label="Search accounts"
              placeholder="Search accounts, contacts, city, phone"
              className="h-10 rounded-full border border-[#cedde6] bg-[#fbfdfe] px-4 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
            />
            <select value={sourceFilter} onChange={(event) => startTransition(() => setSourceFilter(event.target.value))} aria-label="Source" className={toolbarSelectClass()}>
              <option value="all">All Sources</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {formatSourceLabel(source)}
                </option>
              ))}
            </select>
            <select value={hotLeadFilter} onChange={(event) => startTransition(() => setHotLeadFilter(event.target.value as HotLeadFilter))} aria-label="Hot lead" className={toolbarSelectClass()}>
              <option value="all">All Leads</option>
              <option value="hot">Hot Lead</option>
              <option value="not_hot">Not Hot</option>
            </select>
            <select value={taskStateFilter} onChange={(event) => startTransition(() => setTaskStateFilter(event.target.value as TaskStateFilter))} aria-label="Follow-up" className={toolbarSelectClass()}>
              <option value="all">All Follow-Up</option>
              <option value="has_open_task">Has Task</option>
              <option value="no_open_task">No Task</option>
              <option value="overdue_task">Overdue</option>
            </select>
            <select value={sortKey} onChange={(event) => startTransition(() => setSortKey(event.target.value as SortKey))} aria-label="Sort" className={toolbarSelectClass()}>
              <option value="activity_desc">Recent</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="orders_desc">Most Orders</option>
              <option value="owner_asc">Owner A-Z</option>
            </select>
            <button type="button" onClick={() => setShowAdvancedFilters((current) => !current)} className={denseButtonClass()}>
              More Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
            </button>
          </div>

          {showAdvancedFilters ? (
            <section className="rounded-[20px] border border-[#dbe8ef] bg-[#f8fbfc] p-3 shadow-[0_8px_18px_rgba(16,42,67,0.05)]">
              <div className="grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(6,minmax(0,1fr))]">
                <FilterSelect
                  label="Territory"
                  value={territoryFilter}
                  onChange={setTerritoryFilter}
                  options={territoryOptions.map((option) => ({ value: option.value, label: option.label }))}
                />
                <FilterSelect label="Owner" value={ownerFilter} onChange={setOwnerFilter} options={owners.map((owner) => ({ value: owner, label: owner }))} />
                <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={statuses.map((status) => ({ value: status, label: titleCase(status) }))} />
                <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={stages.map((stage) => ({ value: stage, label: titleCase(stage) }))} />
                <FilterSelect
                  label="Route Readiness"
                  value={routeReadiness}
                  onChange={(value) => setRouteReadiness(value as RouteReadinessFilter)}
                  options={[
                    { value: "route_ready", label: "Route Ready" },
                    { value: "no_territory", label: "No Territory" },
                    { value: "no_route_day", label: "No Route Day" },
                    { value: "no_route_rep", label: "No Route Rep" },
                    { value: "no_coords", label: "No Coordinates" },
                    { value: "address_ready", label: "Address Ready, No Coords" },
                  ]}
                />
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
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleClearSearch} className={denseButtonClass()}>
                  Clear search
                </button>
                <button type="button" onClick={resetFilters} className={denseButtonClass()}>
                  Reset filters
                </button>
                <button type="button" onClick={selectAllVisible} disabled={visibleCustomers.length === 0} className={denseButtonClass()}>
                  {allVisibleSelected ? "All selected" : `Select ${visibleCustomers.length}`}
                </button>
                <button type="button" onClick={clearSelection} disabled={selectedCustomerIds.length === 0} className={denseButtonClass()}>
                  Clear selection
                </button>
                {staffRole === "admin" ? (
                  <button
                    type="button"
                    onClick={() => void geocodeVisibleResults()}
                    disabled={visibleCustomers.length === 0 || visibleGeocodeBusy}
                    className={denseButtonClass()}
                  >
                    {visibleGeocodeBusy ? "Geocoding..." : "Geocode visible"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
              Selected {selectedVisibleCustomerIds.length} of {visibleCustomers.length}
            </span>
            <span className="rounded-full border border-[#bfe8e2] bg-[#f5fffd] px-3 py-1.5 text-sm font-medium text-[#0f766e]">
              Pending Stops {pendingStops.length}
            </span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
              Sort {titleCase(sortKey.replace("_", " "))}
            </span>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
              URL state synced
            </span>
            {visibleGeocodeStatus ? <span className="text-sm text-[#4f6877]">{visibleGeocodeStatus}</span> : null}
          </div>
        </section>

        {selectedVisibleCustomerIds.length > 0 ? (
          <BulkActionBar
            action={bulkAction}
            busy={bulkBusy}
            selectedCount={selectedVisibleCustomerIds.length}
            staffRole={staffRole}
            salesRepOptions={salesRepOptions}
            territoryOptions={territoryOptions}
            statusMessage={bulkStatusMessage}
            onActionChange={setBulkAction}
            onApply={() => void applyBulkAction()}
            onClear={clearSelection}
          />
        ) : null}

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

        <section className="space-y-4">
          {sections.map((section) => (
            <div
              key={section.key}
              id={organizeBy === "territory" ? `customer-segment-${section.key}` : undefined}
              className="rounded-[28px] border border-[#dbe8ef] bg-white p-4 shadow-[0_12px_32px_rgba(16,42,67,0.06)]"
            >
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">
                    {organizeBy === "none" ? "Results" : titleCase(organizeBy.replace("_", " "))}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-[#173543]">{section.label}</h3>
                  <p className="mt-1 text-sm text-[#5c7483]">{section.description}</p>
                </div>
                <div className="rounded-2xl border border-[#dbe8ef] bg-[#f8fbfc] px-4 py-3 text-sm text-[#4f6877]">{section.statLine}</div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {section.customers.map((customer) => (
                  <CustomerCard
                    key={customer.id}
                    customer={customer}
                    selected={selectedCustomerIds.includes(customer.id)}
                    pendingSelected={pendingCustomerIdSet.has(customer.id)}
                    onToggleSelected={toggleCustomerSelection}
                    onTogglePendingSelected={togglePendingStop}
                  />
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
    </div>
  );
}

function CustomerCard({
  customer,
  selected,
  pendingSelected,
  onToggleSelected,
  onTogglePendingSelected,
}: {
  customer: CustomerSummary;
  selected: boolean;
  pendingSelected: boolean;
  onToggleSelected: (customerId: string) => void;
  onTogglePendingSelected: (customerId: string, nextSelected: boolean) => void;
}) {
  const primaryContact = customer.primaryContacts[0] || null;
  const activityCount = customer.counts.estimates + customer.counts.orders + customer.counts.packagingSubmissions + customer.counts.documents;
  const primaryEmailHref = normalizeMailtoHref(primaryContact?.email || customer.primaryContactEmail);
  const phoneHref = normalizeTelHref(primaryContact?.phone || customer.mainPhone);
  const websiteHref = normalizeWebsiteHref(customer.website);
  const routeReadiness = getRouteReadiness(customer);
  const followUpState = getFollowUpState(customer);
  const metadataLine = [
    customer.source ? formatSourceLabel(customer.source) : null,
    customer.importSource ? `Import ${formatSourceLabel(customer.importSource)}` : null,
    customer.nextVisitDueAt ? `Visit ${formatDate(customer.nextVisitDueAt)}` : customer.updatedAt ? `Updated ${formatDate(customer.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <article
      className={[
        "flex h-full flex-col rounded-[24px] border bg-[linear-gradient(180deg,#ffffff_0%,#fbfdfe_100%)] p-4 shadow-[0_8px_18px_rgba(16,42,67,0.05)] transition hover:border-[#b9d5df] hover:shadow-[0_14px_28px_rgba(16,42,67,0.08)]",
        selected || pendingSelected ? "border-[#14b8a6] ring-2 ring-[#b8efe7]" : "border-[#d9e7ee]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="pt-1">
            <input type="checkbox" checked={selected} onChange={() => onToggleSelected(customer.id)} className="h-4 w-4 accent-[#14b8a6]" />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Link href={`/workspace/customers/${customer.id}`} className="truncate text-base font-semibold text-[#173543] transition hover:text-[#0f766e]">
                {customer.name}
              </Link>
              <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusChipClass(customer.status)].join(" ")}>
                {titleCase(customer.status)}
              </span>
              <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", stageChipClass(customer.stage)].join(" ")}>
                {titleCase(customer.stage, "No Stage")}
              </span>
            </div>
            <p className="text-sm text-[#5a7483]">
              {[customer.city || "No city", customer.territoryCode ? `Territory ${customer.territoryCode}` : "Territory open", customer.assignedSalesName || "Unassigned owner"]
                .filter(Boolean)
                .join(" • ")}
            </p>
          </div>
        </div>

        <RouteActionButton customer={customer} pendingSelected={pendingSelected} onTogglePendingSelected={onTogglePendingSelected} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {customer.isHallOfFlowersLead ? (
          <span className="rounded-full border border-[#f1ddad] bg-[#fff9eb] px-2 py-0.5 text-[11px] font-semibold text-[#8a5b00]">Hall of Flowers</span>
        ) : null}
        {customer.isHotLead ? (
          <span className="rounded-full border border-[#ffd3cf] bg-[#fff2f0] px-2 py-0.5 text-[11px] font-semibold text-[#b44b40]">Hot Lead</span>
        ) : null}
        <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", followUpChipClass(customer)].join(" ")}>{followUpState}</span>
        <RouteReadinessPill state={routeReadiness} />
        {customer.counts.orders > 0 ? (
          <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-2 py-0.5 text-[11px] font-semibold text-[#4f6877]">
            {customer.counts.orders} order{customer.counts.orders === 1 ? "" : "s"}
          </span>
        ) : null}
        {pendingSelected ? <span className="rounded-full border border-[#bfe8e2] bg-[#f5fffd] px-2 py-0.5 text-[11px] font-semibold text-[#0f766e]">Pending Stop</span> : null}
      </div>

      <div className="mt-3 grid gap-3 text-sm text-[#56717f] sm:grid-cols-2">
        <div className="min-w-0 rounded-[18px] border border-[#e3edf2] bg-[#f8fbfc] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a909d]">Coverage</p>
          <p className="mt-1 truncate font-medium text-[#294653]">{primaryContact?.name || "No primary contact"}</p>
          <p className="mt-1 truncate text-xs text-[#7a909d]">
            {primaryContact?.email || customer.primaryContactEmail || "No email"}
            {(primaryContact?.phone || customer.mainPhone) ? ` • ${primaryContact?.phone || customer.mainPhone}` : ""}
          </p>
        </div>

        <div className="min-w-0 rounded-[18px] border border-[#e3edf2] bg-[#f8fbfc] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a909d]">Routing</p>
          <p className="mt-1 truncate font-medium text-[#294653]">
            {customer.routeDay || "No route day"}
            {customer.assignedRouteRepName ? ` • ${customer.assignedRouteRepName}` : ""}
          </p>
          <p className="mt-1 truncate text-xs text-[#7a909d]">
            {customer.contactCount} contacts • {activityCount} linked records
          </p>
        </div>
      </div>

      <p className="mt-3 truncate text-sm text-[#5c7483]">{metadataLine || "No recent metadata yet."}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#e6eef3] pt-3">
        <QuickAction href={phoneHref} label="Call" />
        <QuickAction href={primaryEmailHref} label="Email" />
        <QuickAction href={websiteHref} label="Site" external />
        <Link href={`/workspace/customers/${customer.id}`} className={denseButtonClass("primary")}>
          Open Account
        </Link>
      </div>
    </article>
  );
}

function RouteActionButton({
  customer,
  pendingSelected,
  onTogglePendingSelected,
}: {
  customer: CustomerSummary;
  pendingSelected: boolean;
  onTogglePendingSelected: (customerId: string, nextSelected: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const routeHref = pendingSelected
    ? `/workspace/routes?pending=1&customerId=${encodeURIComponent(customer.id)}`
    : null;

  async function handlePendingToggle() {
    setBusy(true);

    try {
      await onTogglePendingSelected(customer.id, !pendingSelected);
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handlePendingToggle()}
        disabled={busy}
        className={[
          "inline-flex h-8 items-center justify-center rounded-full px-3 text-sm font-semibold transition",
          pendingSelected
            ? "border border-[#bfe8e2] bg-[#f5fffd] text-[#0f766e] hover:border-[#14b8a6]"
            : "border border-[#cddbe4] bg-white text-[#21424d] hover:border-[#14b8a6] hover:text-[#0f766e]",
        ].join(" ")}
      >
        {busy ? "Saving..." : pendingSelected ? "Pending" : "Queue"}
      </button>
      {routeHref ? (
        <Link href={routeHref} className="inline-flex h-8 items-center rounded-full border border-[#bfe8e2] px-3 text-sm font-medium text-[#0f766e] transition hover:text-[#0b5f58]">
          Pending
        </Link>
      ) : null}
    </div>
  );
}

function BulkActionBar({
  action,
  busy,
  selectedCount,
  staffRole,
  salesRepOptions,
  territoryOptions,
  statusMessage,
  onActionChange,
  onApply,
  onClear,
}: {
  action: BulkActionState;
  busy: boolean;
  selectedCount: number;
  staffRole: "admin" | "sales";
  salesRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  statusMessage: string | null;
  onActionChange: (action: BulkActionState) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const availableActions = BULK_ACTIONS.filter((item) =>
    staffRole === "admin"
      ? true
      : item.key !== "assign_sales_rep" &&
          item.key !== "convert_to_source" &&
          item.key !== "archive_customers" &&
          item.key !== "restore_customers"
  );
  const valueLabel =
    action.kind === "assign_sales_rep"
      ? "Sales rep"
      : action.kind === "assign_territory"
        ? "Territory"
        : action.kind === "assign_route_day"
          ? "Route day"
          : null;

  return (
    <section className="rounded-[24px] border border-[#bfe8e2] bg-[linear-gradient(180deg,#f5fffd_0%,#ffffff_100%)] p-4 shadow-[0_14px_30px_rgba(16,42,67,0.08)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">Bulk Actions</p>
          <p className="mt-1 text-sm text-[#35505d]">
            {selectedCount} selected account{selectedCount === 1 ? "" : "s"}
          </p>
          {statusMessage ? <p className="mt-1 text-xs text-[#4f6877]">{statusMessage}</p> : null}
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
          <label className="grid gap-1 text-sm text-[#4b6676]">
            <span className="font-medium">Action</span>
            <select
              value={action.kind}
              onChange={(event) => onActionChange({ ...action, kind: event.target.value as BulkActionKind, value: "" })}
              disabled={busy}
              className="h-10 rounded-2xl border border-[#cedde6] bg-white px-4 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
            >
              {availableActions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {valueLabel ? (
            <label className="grid gap-1 text-sm text-[#4b6676]">
              <span className="font-medium">{valueLabel}</span>
              <select
                value={action.value}
                onChange={(event) => onActionChange({ ...action, value: event.target.value })}
                disabled={busy}
                className="h-10 min-w-[220px] rounded-2xl border border-[#cedde6] bg-white px-4 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
              >
                <option value="">Select {valueLabel.toLowerCase()}</option>
                {action.kind === "assign_sales_rep"
                  ? salesRepOptions.map((option) => (
                      <option key={option.userId} value={option.userId}>
                        {option.label}
                      </option>
                    ))
                  : action.kind === "assign_territory"
                    ? territoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    : ROUTE_DAYS.map((routeDay) => (
                        <option key={routeDay} value={routeDay}>
                          {routeDay}
                        </option>
                      ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-[#d7e6ed] bg-white px-4 py-3 text-sm text-[#4f6877]">
              {action.kind === "convert_to_source"
                ? "Creates source records from the selected customer accounts and soft-removes those accounts from the active Customers workspace."
                : action.kind === "archive_customers"
                  ? "Hides the selected customers from the active Customers workspace without deleting their history."
                  : action.kind === "restore_customers"
                    ? "Restores archived customers back into the active Customers workspace."
                : "Queues or removes the current filtered selection for route generation."}
            </div>
          )}

          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="h-10 rounded-full bg-[#173543] px-4 text-sm font-semibold text-white transition hover:bg-[#0f2a35] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Applying..." : "Apply"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="h-10 rounded-full border border-[#d0dde5] bg-white px-4 text-sm font-semibold text-[#42606f] transition hover:border-[#9eb6c4] hover:text-[#173543] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </div>
    </section>
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
        className="h-10 rounded-2xl border border-[#cedde6] bg-[#fbfdfe] px-4 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6] focus:bg-white"
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

function QuickAction({ href, label, external = false }: { href: string | null; label: string; external?: boolean }) {
  if (!href) {
    return (
      <span className="inline-flex h-8 items-center justify-center rounded-full border border-[#d9e5eb] bg-[#f7fbfd] px-3 text-sm text-[#89a0ad]">
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex h-8 items-center justify-center rounded-full border border-[#cddbe4] bg-white px-3 text-sm font-medium text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
    >
      {label}
    </a>
  );
}

function RouteReadinessPill({ state }: { state: ReturnType<typeof getRouteReadiness> }) {
  const toneClass =
    state === "route_ready"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : state === "no_territory" || state === "no_route_day" || state === "no_route_rep"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  const label =
    state === "route_ready"
      ? "Route Ready"
      : state === "no_territory"
        ? "No Territory"
      : state === "no_route_day"
          ? "No Route Day"
          : state === "no_route_rep"
            ? "No Route Rep"
          : state === "address_ready"
            ? "Address Ready"
            : state === "no_coords"
              ? "No Coords"
              : "Route Open";

  return <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass].join(" ")}>{label}</span>;
}
