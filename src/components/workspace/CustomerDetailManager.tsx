"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VISIT_OUTCOMES } from "@/components/workspace/routeUtils";

type StaffOption = {
  userId: string;
  label: string;
};

type TerritoryOption = {
  code: string;
  label: string;
  routeDayDefault: string | null;
};

type PrimaryContact = {
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

type CustomerDetailManagerProps = {
  customerId: string;
  companyName: string;
  status: string;
  stage: string | null;
  primaryContactEmail: string | null;
  mainPhone: string | null;
  assignedSalesUserId: string | null;
  territoryCode: string | null;
  routeDay: string | null;
  assignedRouteRepUserId: string | null;
  routePriority: number | null;
  visitStatus: string | null;
  lastVisitAt: string | null;
  nextVisitDueAt: string | null;
  latitude: number | null;
  longitude: number | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  geocodeStatus: "geocoded" | "missing_address" | "failed" | "needs_review" | null;
  geocodedAddress: string | null;
  lastGeocodedAt: string | null;
  geocodeProvider: string | null;
  address: string | null;
  staffRole: "admin" | "sales";
  salesOptions: StaffOption[];
  routeRepOptions: StaffOption[];
  territoryOptions: TerritoryOption[];
  primaryContact: PrimaryContact | null;
};

const ROUTE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const VISIT_STATUS_OPTIONS = [
  "due",
  "scheduled",
  "visited",
  "overdue",
  "skipped",
  "needs_follow_up",
  "met_buyer",
  "no_answer",
  "unavailable",
  "sample_drop",
  "interested",
  "revisit_needed",
];

const sectionClass = "rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm";
const inputClass = "rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]";

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function titleCase(value: string | null | undefined, fallback = "Unspecified") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toDateTimeLocalValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseCoordinate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidCoordinates(latitude: string, longitude: string) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  if (lat === null || lng === null) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function buildAddressMapHref(args: {
  geocodedAddress: string | null;
  composedAddress: string | null;
  latitude: string;
  longitude: string;
}) {
  const addressQuery = String(args.geocodedAddress || args.composedAddress || "").trim();
  if (addressQuery) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;
  }
  if (hasValidCoordinates(args.latitude, args.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${args.latitude.trim()},${args.longitude.trim()}`)}`;
  }
  return null;
}

function buildCoordinateMapHref(latitude: string, longitude: string) {
  if (!hasValidCoordinates(latitude, longitude)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude.trim()},${longitude.trim()}`)}`;
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

function addDaysDateValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDateTime(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "Never";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "Never";
  return new Date(parsed).toLocaleString();
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "warn" | "ok" }) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
        : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  return <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}>{label}</span>;
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#5c7483]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export default function CustomerDetailManager(props: CustomerDetailManagerProps) {
  const router = useRouter();
  const [accountBusy, setAccountBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [routeQueueBusy, setRouteQueueBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(props.companyName);
  const [status, setStatus] = useState(props.status || "active");
  const [stage, setStage] = useState(props.stage || "new");
  const [primaryContactEmail, setPrimaryContactEmail] = useState(props.primaryContactEmail || "");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState(props.assignedSalesUserId || "");

  const [territoryCode, setTerritoryCode] = useState(props.territoryCode || "");
  const [routeDay, setRouteDay] = useState(props.routeDay || "");
  const [assignedRouteRepUserId, setAssignedRouteRepUserId] = useState(props.assignedRouteRepUserId || "");
  const [routePriority, setRoutePriority] = useState(props.routePriority === null ? "" : String(props.routePriority));
  const [visitStatus, setVisitStatus] = useState(props.visitStatus || "");
  const [lastVisitAt, setLastVisitAt] = useState(toDateTimeLocalValue(props.lastVisitAt));
  const [nextVisitDueAt, setNextVisitDueAt] = useState(toDateTimeLocalValue(props.nextVisitDueAt));
  const [latitude, setLatitude] = useState(props.latitude === null ? "" : String(props.latitude));
  const [longitude, setLongitude] = useState(props.longitude === null ? "" : String(props.longitude));
  const [address1, setAddress1] = useState(props.address1 || "");
  const [address2, setAddress2] = useState(props.address2 || "");
  const [city, setCity] = useState(props.city || "");
  const [stateCode, setStateCode] = useState(props.state || "");
  const [postalCode, setPostalCode] = useState(props.postalCode || "");
  const [geocodeStatus, setGeocodeStatus] = useState(props.geocodeStatus);
  const [geocodedAddress, setGeocodedAddress] = useState(props.geocodedAddress);
  const [lastGeocodedAt, setLastGeocodedAt] = useState(props.lastGeocodedAt);
  const [geocodeProvider, setGeocodeProvider] = useState(props.geocodeProvider);

  const [contactName, setContactName] = useState(props.primaryContact?.name || "");
  const [contactEmail, setContactEmail] = useState(props.primaryContact?.email || "");
  const [contactPhone, setContactPhone] = useState(props.primaryContact?.phone || "");
  const [contactTitle, setContactTitle] = useState(props.primaryContact?.title || "");
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDetails, setActivityDetails] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState(props.assignedSalesUserId || "");
  const [taskPriority, setTaskPriority] = useState("2");
  const [routeOutcomeBusy, setRouteOutcomeBusy] = useState<string | null>(null);
  const [routeOutcomeTaskEnabled, setRouteOutcomeTaskEnabled] = useState(false);
  const [routeOutcomeTaskTitle, setRouteOutcomeTaskTitle] = useState("");
  const [routeOutcomeTaskDueDate, setRouteOutcomeTaskDueDate] = useState("");
  const taskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const activitySummaryInputRef = useRef<HTMLInputElement | null>(null);
  const accountCompanyInputRef = useRef<HTMLInputElement | null>(null);

  const composedAddress = [address1, address2, [city, stateCode, postalCode].filter(Boolean).join(", ")].filter(Boolean).join(" • ") || null;
  const addressMapHref = buildAddressMapHref({
    geocodedAddress,
    composedAddress: composedAddress || props.address,
    latitude,
    longitude,
  });
  const coordinateMapHref = buildCoordinateMapHref(latitude, longitude);
  const territoryMeta = props.territoryOptions.find((option) => option.code === territoryCode) || null;
  const hasCoords = hasValidCoordinates(latitude, longitude);
  const hasAddress = Boolean(address1.trim() || city.trim() || stateCode.trim() || postalCode.trim());
  const callHref = normalizeTelHref(props.primaryContact?.phone || props.mainPhone);
  const emailHref = normalizeMailtoHref(props.primaryContact?.email || primaryContactEmail);
  const coordinateCoverageState =
    hasCoords ? "has_coords" : geocodeStatus === "failed" ? "failed" : geocodeStatus === "needs_review" ? "needs_review" : hasAddress ? "address_ready" : "missing_address";
  const coordinateStatusLabel =
    coordinateCoverageState === "has_coords"
      ? "Map Ready"
      : coordinateCoverageState === "failed"
        ? "Geocode Failed"
        : coordinateCoverageState === "needs_review"
          ? "Needs Review"
      : coordinateCoverageState === "address_ready"
        ? "Has Address, Missing Coords"
        : "No Address, Missing Coords";
  const missingRouteStates = [
    !territoryCode ? "No territory" : null,
    !routeDay ? "No route day" : null,
    !hasCoords ? "No coordinates" : null,
  ].filter(Boolean) as string[];
  const hasRouteConfig = Boolean(
    territoryCode ||
      routeDay ||
      assignedRouteRepUserId ||
      routePriority ||
      visitStatus ||
      lastVisitAt ||
      nextVisitDueAt ||
      latitude ||
      longitude
  );

  async function refreshWithMessage(message: string) {
    setSuccess(message);
    setError(null);
    router.refresh();
  }

  function syncGeocodeState(payload: Record<string, unknown>) {
    setGeocodeStatus((payload.geocode_status as CustomerDetailManagerProps["geocodeStatus"]) ?? geocodeStatus);
    setGeocodedAddress((payload.geocoded_address as string | null | undefined) ?? geocodedAddress);
    setLastGeocodedAt((payload.last_geocoded_at as string | null | undefined) ?? lastGeocodedAt);
    setGeocodeProvider((payload.geocode_provider as string | null | undefined) ?? geocodeProvider);
    if ("latitude" in payload) setLatitude(payload.latitude == null ? "" : String(payload.latitude));
    if ("longitude" in payload) setLongitude(payload.longitude == null ? "" : String(payload.longitude));
  }

  async function saveAccount() {
    setAccountBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          status,
          stage,
          primary_contact_email: primaryContactEmail,
          address_1: address1 || null,
          address_2: address2 || null,
          city: city || null,
          state: stateCode || null,
          postal_code: postalCode || null,
          assigned_sales_user_id: assignedSalesUserId || null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      syncGeocodeState(json);
      await refreshWithMessage("Customer account updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function saveRouteOps() {
    setRouteBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          territory_code: territoryCode || null,
          route_day: routeDay || null,
          assigned_route_rep_user_id: assignedRouteRepUserId || null,
          route_priority: routePriority ? Number(routePriority) : null,
          visit_status: visitStatus || null,
          last_visit_at: lastVisitAt || null,
          next_visit_due_at: nextVisitDueAt || null,
          latitude: latitude || null,
          longitude: longitude || null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      syncGeocodeState(json);
      await refreshWithMessage(hasRouteConfig ? "Route settings updated." : "Route settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRouteBusy(false);
    }
  }

  async function savePrimaryContact() {
    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/primary-contact`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          title: contactTitle,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      await refreshWithMessage("Primary contact updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactBusy(false);
    }
  }

  async function addContact() {
    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          title: contactTitle,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactTitle("");
      await refreshWithMessage("Contact added. Primary contact unchanged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactBusy(false);
    }
  }

  async function createNote() {
    if (!note.trim()) {
      setError("Enter a note first.");
      return;
    }

    setNoteBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setNote("");
      await refreshWithMessage("Note added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setNoteBusy(false);
    }
  }

  async function createActivity() {
    if (!activitySummary.trim()) {
      setError("Enter an activity summary first.");
      return;
    }

    setActivityBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmedDetails = activityDetails.trim();
      const details = trimmedDetails ? { notes: trimmedDetails } : undefined;

      const res = await fetch(`/api/workspace/customers/${props.customerId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: activityType,
          summary: activitySummary,
          details,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setActivitySummary("");
      setActivityDetails("");
      await refreshWithMessage("Activity logged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActivityBusy(false);
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) {
      setError("Enter a task title first.");
      return;
    }

    setTaskBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          due_date: taskDueDate || null,
          assigned_user_id: taskAssignedUserId || null,
          priority: taskPriority ? Number(taskPriority) : null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setTaskTitle("");
      setTaskDueDate("");
      setTaskPriority("2");
      await refreshWithMessage("Task created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setTaskBusy(false);
    }
  }

  async function createTaskRequest(task: { title: string; dueDate?: string | null; assignedUserId?: string | null; priority?: number | null }) {
    const res = await fetch(`/api/workspace/customers/${props.customerId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        due_date: task.dueDate || null,
        assigned_user_id: (task.assignedUserId ?? taskAssignedUserId) || null,
        priority: task.priority ?? (taskPriority ? Number(taskPriority) : null),
      }),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
  }

  async function applyRouteOutcome(outcome: (typeof VISIT_OUTCOMES)[number]) {
    setRouteOutcomeBusy(outcome.key);
    setError(null);
    setSuccess(null);

    try {
      const preserveBlankNextVisit = outcome.nextVisitDays === null && !nextVisitDueAt;
      const res = await fetch(`/api/workspace/customers/${props.customerId}/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: outcome.key,
          summary: `${outcome.label} at ${props.companyName}`,
          notes: null,
          next_visit_due_at: nextVisitDueAt || null,
          preserve_blank_next_visit: preserveBlankNextVisit,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      const nextVisit = String(json.next_visit_due_at || "").trim();
      const nextStatus = String(json.visit_status || outcome.visitStatus).trim();
      const lastVisit = String(json.last_visit_at || "").trim();

      setVisitStatus(nextStatus || outcome.visitStatus);
      if (nextVisit) {
        setNextVisitDueAt(toDateTimeLocalValue(nextVisit));
      } else if (preserveBlankNextVisit) {
        setNextVisitDueAt("");
      }
      if (lastVisit) {
        setLastVisitAt(toDateTimeLocalValue(lastVisit));
      }

      if (routeOutcomeTaskEnabled) {
        const defaultTaskTitle =
          outcome.key === "interested"
            ? `Follow up with ${props.companyName}`
            : outcome.key === "revisit_needed"
              ? `Revisit ${props.companyName}`
              : outcome.key === "sample_drop"
                ? `Check in after sample drop for ${props.companyName}`
                : outcome.key === "met_buyer"
                  ? `Send recap to ${props.companyName}`
                  : `Follow up with ${props.companyName}`;

        await createTaskRequest({
          title: routeOutcomeTaskTitle.trim() || defaultTaskTitle,
          dueDate: routeOutcomeTaskDueDate || (outcome.nextVisitDays !== null ? addDaysDateValue(outcome.nextVisitDays) : null),
          assignedUserId: assignedRouteRepUserId || taskAssignedUserId || null,
          priority: routePriority ? Number(routePriority) : taskPriority ? Number(taskPriority) : null,
        });
        setRouteOutcomeTaskTitle("");
        setRouteOutcomeTaskDueDate("");
        setRouteOutcomeTaskEnabled(false);
        await refreshWithMessage(`${outcome.label} recorded and follow-up task created.`);
        return;
      }

      await refreshWithMessage(`${outcome.label} recorded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRouteOutcomeBusy(null);
    }
  }

  function handleGenerateCoordinates() {
    if (!addressMapHref) {
      setError("Add an address or valid coordinates before opening Maps.");
      setSuccess(null);
      return;
    }

    setError(null);
    window.open(addressMapHref, "_blank", "noopener,noreferrer");
    setSuccess("Maps opened with address context when available. Saved address changes will also attempt automatic geocoding on the server.");
  }

  function handleReviewCoordinates() {
    if (!coordinateMapHref) {
      setError("Valid latitude and longitude are required before reviewing coordinates.");
      setSuccess(null);
      return;
    }

    setError(null);
    window.open(coordinateMapHref, "_blank", "noopener,noreferrer");
    setSuccess("Maps opened to review the raw coordinate pin.");
  }

  async function retryGeocode() {
    setRouteBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_1: address1 || null,
          address_2: address2 || null,
          city: city || null,
          state: stateCode || null,
          postal_code: postalCode || null,
          force_geocode: true,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Retry failed (${res.status})`));
      syncGeocodeState(json);
      await refreshWithMessage("Geocode retry completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRouteBusy(false);
    }
  }

  function jumpToSection(sectionId: string, focusTarget?: HTMLElement | null) {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(() => {
      focusTarget?.focus();
    }, 180);
  }

  async function addToRoute() {
    setRouteQueueBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/workspace/route-stop-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_ids: [props.customerId] }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Queue failed (${res.status})`));
      router.push("/workspace/routes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed");
    } finally {
      setRouteQueueBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
      {success ? <p className="rounded-xl border border-[#bfe8df] bg-[#effcf8] px-3 py-2 text-sm text-[#0f766e]">{success}</p> : null}

      <section className="rounded-[28px] border border-[#cfe5e8] bg-[linear-gradient(180deg,#173543_0%,#1d4658_100%)] p-4 text-white shadow-[0_16px_40px_rgba(16,42,67,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9fd9d2]">Quick Actions</p>
            <h2 className="mt-1 text-xl font-semibold">Work the account without hunting through the page</h2>
            <p className="mt-1 text-sm text-[#d3e6eb]">Calls and email fire immediately. The other actions jump straight into the existing account, task, activity, route, and timeline sections.</p>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-[#d7edf0]">
            {territoryCode || "No territory"} • {routeDay || "No route day"} • {visitStatus ? titleCase(visitStatus) : "No visit status"}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <ActionButton href={callHref} label="Call" />
          <ActionButton href={emailHref} label="Email" />
          <ActionButton label="Text" disabled helper="Coming soon" />
          <ActionButton label="New Task" onClick={() => jumpToSection("customer-create-task", taskTitleInputRef.current)} />
          <ActionButton label="Account" onClick={() => jumpToSection("customer-account-management", accountCompanyInputRef.current)} />
          <ActionButton label="Log Activity" onClick={() => jumpToSection("customer-log-activity", activitySummaryInputRef.current)} />
          <ActionButton label={routeQueueBusy ? "Adding..." : "Add to Route"} onClick={() => void addToRoute()} disabled={routeQueueBusy} />
          <ActionButton label="Recent Activity" onClick={() => jumpToSection("customer-activity-timeline")} />
        </div>
      </section>

      <section id="customer-route-field-ops" className={[sectionClass, "scroll-mt-28"].join(" ")}>
        <SectionHeader
          title="Route & Field Ops"
          description="Territory-driven stop planning, routing readiness, and field execution."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {addressMapHref ? (
                <a
                  href={addressMapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                >
                  Open in Maps
                </a>
              ) : (
                <span className="rounded-full border border-[#d9e5eb] bg-[#f7fbfd] px-3 py-1.5 text-sm text-[#89a0ad]">Open in Maps</span>
              )}
              <button
                type="button"
                onClick={() => void saveRouteOps()}
                disabled={routeBusy}
                className="rounded-full bg-[#173543] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {routeBusy ? "Saving..." : hasRouteConfig ? "Update Route Settings" : "Save Route Settings"}
              </button>
            </div>
          }
        />

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusPill label={territoryCode ? `Territory ${territoryCode}` : "Territory Missing"} tone={territoryCode ? "ok" : "warn"} />
              <StatusPill label={routeDay ? `Route ${routeDay}` : "Route Day Missing"} tone={routeDay ? "ok" : "warn"} />
              <StatusPill label={hasCoords ? "Coords Ready" : "Coords Missing"} tone={hasCoords ? "ok" : "warn"} />
              <StatusPill label={coordinateStatusLabel} tone={hasCoords ? "ok" : "warn"} />
              {visitStatus ? <StatusPill label={titleCase(visitStatus)} /> : null}
            </div>

            <div className="rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#173543]">Quick Visit Outcomes</p>
                  <p className="mt-1 text-xs text-[#5c7483]">One tap updates visit status, logs activity, and applies default follow-up timing.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#4a6575]">
                  <input
                    type="checkbox"
                    checked={routeOutcomeTaskEnabled}
                    onChange={(event) => setRouteOutcomeTaskEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-[#cfdde6] text-[#14b8a6]"
                  />
                  <span>Create task</span>
                </label>
              </div>

              {routeOutcomeTaskEnabled ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_180px]">
                  <label className="grid gap-1 text-sm text-[#4a6575]">
                    <span>Task Title</span>
                    <input value={routeOutcomeTaskTitle} onChange={(event) => setRouteOutcomeTaskTitle(event.target.value)} className={inputClass} placeholder={`Follow up with ${props.companyName}`} />
                  </label>
                  <label className="grid gap-1 text-sm text-[#4a6575]">
                    <span>Due Date</span>
                    <input type="date" value={routeOutcomeTaskDueDate} onChange={(event) => setRouteOutcomeTaskDueDate(event.target.value)} className={inputClass} />
                  </label>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {VISIT_OUTCOMES.map((outcome) => (
                  <button
                    key={outcome.key}
                    type="button"
                    onClick={() => void applyRouteOutcome(outcome)}
                    disabled={routeBusy || routeOutcomeBusy !== null}
                    className={["rounded-full border px-3 py-1.5 text-sm font-semibold disabled:opacity-60", outcome.accentClass].join(" ")}
                  >
                    {routeOutcomeBusy === outcome.key ? "Saving..." : outcome.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-12">
              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-5">
                <span>Territory</span>
                <select
                  value={territoryCode}
                  onChange={(event) => {
                    const nextCode = event.target.value;
                    const territory = props.territoryOptions.find((option) => option.code === nextCode) || null;
                    setTerritoryCode(nextCode);
                    if (!routeDay && territory?.routeDayDefault) {
                      setRouteDay(territory.routeDayDefault);
                    }
                  }}
                  disabled={routeBusy}
                  className={inputClass}
                >
                  <option value="">Unassigned</option>
                  {props.territoryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-3">
                <span>Route Day</span>
                <select value={routeDay} onChange={(event) => setRouteDay(event.target.value)} disabled={routeBusy} className={inputClass}>
                  <option value="">Unassigned</option>
                  {ROUTE_DAYS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-4">
                <span>Assigned Route Rep</span>
                <select
                  value={assignedRouteRepUserId}
                  onChange={(event) => setAssignedRouteRepUserId(event.target.value)}
                  disabled={props.staffRole !== "admin" || routeBusy}
                  className={inputClass}
                >
                  <option value="">Unassigned</option>
                  {props.routeRepOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-3">
                <span>Priority</span>
                <select value={routePriority} onChange={(event) => setRoutePriority(event.target.value)} disabled={routeBusy} className={inputClass}>
                  <option value="">Unassigned</option>
                  {["1", "2", "3", "4", "5"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-4">
                <span>Visit Status</span>
                <select value={visitStatus} onChange={(event) => setVisitStatus(event.target.value)} disabled={routeBusy} className={inputClass}>
                  <option value="">Unassigned</option>
                  {VISIT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-5">
                <span>Next Visit Due</span>
                <input type="datetime-local" value={nextVisitDueAt} onChange={(event) => setNextVisitDueAt(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-5">
                <span>Last Visit</span>
                <input type="datetime-local" value={lastVisitAt} onChange={(event) => setLastVisitAt(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-3">
                <span>Latitude</span>
                <input type="number" step="0.000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>

              <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-4">
                <span>Longitude</span>
                <input type="number" step="0.000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>
            </div>
          </div>

          <aside className="grid gap-3 rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3 text-sm text-[#4a6575]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8398a5]">Routing Snapshot</p>
              <div className="mt-2 space-y-1.5">
                <p className="font-medium text-[#173543]">{territoryMeta?.label || "Territory not assigned"}</p>
                <p>{routeDay ? `Default run day: ${routeDay}` : "Route day still open"}</p>
                <p>{assignedRouteRepUserId ? "Route rep assigned" : "No route rep assigned"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8398a5]">Coverage Gaps</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingRouteStates.length > 0 ? missingRouteStates.map((item) => <StatusPill key={item} label={item} tone="warn" />) : <StatusPill label="Route Ready" tone="ok" />}
              </div>
            </div>

            <div className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8398a5]">Coordinate Status</p>
                  <p className="mt-1 text-sm font-medium text-[#173543]">{coordinateStatusLabel}</p>
                  <p className="mt-1 text-xs text-[#5c7483]">
                    {hasCoords
                      ? "Coordinates are ready for route mapping."
                      : coordinateCoverageState === "failed"
                        ? "Automatic geocoding failed. Retry geocoding or review the address."
                        : coordinateCoverageState === "needs_review"
                          ? "The address needs review before coordinates can be trusted."
                        : hasAddress
                          ? "Address is present. Saving the address will attempt automatic geocoding."
                        : "Add an address first before coordinates can be generated or verified."}
                  </p>
                  <p className="mt-1 text-xs text-[#6d8593]">
                    Status {titleCase(geocodeStatus, "Unknown")} • Provider {geocodeProvider || "Not set"} • Last geocoded {formatShortDateTime(lastGeocodedAt)}
                  </p>
                  {geocodedAddress ? <p className="mt-1 text-xs text-[#6d8593]">Geocoded address: {geocodedAddress}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateCoordinates}
                    disabled={!addressMapHref}
                    className="rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:border-[#d9e5eb] disabled:bg-[#f7fbfd] disabled:text-[#89a0ad]"
                  >
                    Open in Maps
                  </button>
                  <button
                    type="button"
                    onClick={handleReviewCoordinates}
                    disabled={!coordinateMapHref}
                    className="rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:border-[#d9e5eb] disabled:bg-[#f7fbfd] disabled:text-[#89a0ad]"
                  >
                    Review Coordinates
                  </button>
                  <button
                    type="button"
                    onClick={() => void retryGeocode()}
                    disabled={!hasAddress || routeBusy}
                    className="rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:cursor-not-allowed disabled:border-[#d9e5eb] disabled:bg-[#f7fbfd] disabled:text-[#89a0ad]"
                  >
                    {routeBusy ? "Saving..." : "Retry Geocode"}
                  </button>
                </div>
              </div>
              {!hasCoords ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill label={coordinateStatusLabel} tone={coordinateCoverageState === "failed" || coordinateCoverageState === "missing_address" ? "warn" : "neutral"} />
                  <StatusPill label={hasAddress ? "Address On File" : "Address Missing"} tone={hasAddress ? "neutral" : "warn"} />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8398a5]">Address</p>
              <p className="mt-1 text-sm text-[#456271]">{composedAddress || "No address on file"}</p>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section id="customer-account-management" className={[sectionClass, "scroll-mt-28"].join(" ")}>
          <SectionHeader title="Account Management" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Company Name</span>
              <input ref={accountCompanyInputRef} value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={props.staffRole !== "admin" || accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Primary Contact Email</span>
              <input value={primaryContactEmail} onChange={(e) => setPrimaryContactEmail(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={accountBusy} className={inputClass}>
                {["active", "prospect", "lead", "on_hold", "inactive"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Stage</span>
              <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={accountBusy} className={inputClass}>
                {["new", "qualified", "active", "paused", "closed"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Assigned Sales Rep</span>
              <select value={assignedSalesUserId} onChange={(e) => setAssignedSalesUserId(e.target.value)} disabled={props.staffRole !== "admin" || accountBusy} className={inputClass}>
                <option value="">Unassigned</option>
                {props.salesOptions.map((option) => (
                  <option key={option.userId} value={option.userId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Address 1</span>
              <input value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Address 2</span>
              <input value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>State</span>
              <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>

            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Postal Code</span>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={accountBusy} className={inputClass} />
            </label>
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => void saveAccount()} disabled={accountBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {accountBusy ? "Saving..." : "Save Account"}
            </button>
          </div>
        </section>

        <section id="customer-primary-contact" className={[sectionClass, "scroll-mt-28"].join(" ")}>
          <SectionHeader
            title="Primary Contact"
            action={
              <button
                type="button"
                onClick={() => void addContact()}
                disabled={contactBusy}
                className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
              >
                {contactBusy ? "Saving..." : "Add Contact"}
              </button>
            }
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Name</span>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={contactBusy} className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Title</span>
              <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} disabled={contactBusy} className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Email</span>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={contactBusy} className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Phone</span>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={contactBusy} className={inputClass} />
            </label>
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => void savePrimaryContact()} disabled={contactBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {contactBusy ? "Saving..." : "Save Primary Contact"}
            </button>
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className={[sectionClass, "scroll-mt-28"].join(" ")}>
          <SectionHeader title="Add Internal Note" />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            disabled={noteBusy}
            className="mt-3 w-full rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            placeholder="Add relationship context, follow-up notes, or handoff details."
          />
          <div className="mt-3">
            <button type="button" onClick={() => void createNote()} disabled={noteBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {noteBusy ? "Saving..." : "Add Note"}
            </button>
          </div>
        </section>

        <section id="customer-create-task" className={[sectionClass, "scroll-mt-28"].join(" ")}>
          <SectionHeader title="Create Task" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Title</span>
              <input ref={taskTitleInputRef} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} disabled={taskBusy} className={inputClass} placeholder="Send updated pricing sheet." />
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Due Date</span>
              <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} disabled={taskBusy} className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575]">
              <span>Priority</span>
              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)} disabled={taskBusy} className={inputClass}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
              <span>Assigned To</span>
              <select value={taskAssignedUserId} onChange={(e) => setTaskAssignedUserId(e.target.value)} disabled={taskBusy} className={inputClass}>
                <option value="">Unassigned</option>
                {props.salesOptions.map((option) => (
                  <option key={option.userId} value={option.userId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => void createTask()} disabled={taskBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {taskBusy ? "Saving..." : "Create Task"}
            </button>
          </div>
        </section>
      </div>

      <section id="customer-log-activity" className={[sectionClass, "scroll-mt-28"].join(" ")}>
        <SectionHeader title="Log Activity" />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[0.8fr_1.2fr]">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Activity Type</span>
            <select value={activityType} onChange={(e) => setActivityType(e.target.value)} disabled={activityBusy} className={inputClass}>
              {["note", "call", "email", "meeting", "task_update"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Summary</span>
            <input ref={activitySummaryInputRef} value={activitySummary} onChange={(e) => setActivitySummary(e.target.value)} disabled={activityBusy} className={inputClass} placeholder="Called buyer to confirm next steps." />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
            <span>Details</span>
            <textarea
              value={activityDetails}
              onChange={(e) => setActivityDetails(e.target.value)}
              rows={3}
              disabled={activityBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
              placeholder="Optional context for the timeline entry."
            />
          </label>
        </div>
        <div className="mt-3">
          <button type="button" onClick={() => void createActivity()} disabled={activityBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {activityBusy ? "Saving..." : "Log Activity"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionButton({
  href,
  label,
  onClick,
  disabled = false,
  helper,
}: {
  href?: string | null;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  helper?: string;
}) {
  const className = [
    "flex min-h-12 items-center justify-center rounded-[18px] border px-3 py-3 text-center text-sm font-semibold transition",
    disabled || (!href && !onClick)
      ? "cursor-not-allowed border-white/10 bg-white/10 text-[#9db8c2]"
      : "border-[#7fd0c7] bg-[#effcf9] text-[#173543] hover:border-white hover:bg-white",
  ].join(" ");

  if (href && !disabled) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled || (!href && !onClick)} className={className}>
      {helper ? `${label} · ${helper}` : label}
    </button>
  );
}
