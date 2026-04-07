"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  id?: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary?: boolean;
};

type CustomerDetailManagerProps = {
  customerId: string;
  companyName: string;
  status: string;
  stage: string | null;
  isHotLead: boolean;
  isHallOfFlowersLead: boolean;
  primaryContactEmail: string | null;
  mainPhone: string | null;
  assignedSalesUserId: string | null;
  assignedSalesLabel: string | null;
  territoryCode: string | null;
  routeDay: string | null;
  assignedRouteRepUserId: string | null;
  assignedRouteRepLabel: string | null;
  routePriority: number | null;
  visitStatus: string | null;
  lastVisitAt: string | null;
  nextVisitDueAt: string | null;
  hasOpenTask: boolean;
  openTaskCount: number;
  overdueTaskCount: number;
  nextTaskDueAt: string | null;
  lastActivityAt: string | null;
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
  currentStaffUserId: string;
  currentStaffLabel: string | null;
  salesOptions: StaffOption[];
  routeRepOptions: StaffOption[];
  territoryOptions: TerritoryOption[];
  primaryContact: PrimaryContact | null;
  contacts: PrimaryContact[];
  website: string | null;
};

type GmailConnectionState =
  | { loading: true; connected: false; gmailEmail: null; error: null; oauthStatus: null }
  | { loading: false; connected: true; gmailEmail: string; error: null; oauthStatus: string | null }
  | { loading: false; connected: false; gmailEmail: null; error: string | null; oauthStatus: string | null };

type EmailRecipientPreview = {
  key: string;
  contactId: string | null;
  label: string;
  email: string;
  kind: "primary" | "contact";
};

type EmailSendResult = {
  customerId: string;
  contactId: string | null;
  toEmail: string;
  status: "sent" | "failed";
  providerMessageId: string | null;
  providerThreadId: string | null;
  gmailEmail: string | null;
  error: string | null;
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
const inputClass = "min-w-0 w-full rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]";

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

function normalizeWebsiteHref(value: string | null | undefined) {
  const href = String(value || "").trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return `https://${href}`;
}

function isValidEmail(value: string | null | undefined) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildEmailRecipientPreview(args: { primaryContact: PrimaryContact | null; contacts: PrimaryContact[] }) {
  const items: EmailRecipientPreview[] = [];
  const seen = new Set<string>();
  const pushItem = (item: EmailRecipientPreview | null) => {
    if (!item) return;
    const normalizedEmail = item.email.trim().toLowerCase();
    if (!normalizedEmail || seen.has(normalizedEmail)) return;
    seen.add(normalizedEmail);
    items.push({ ...item, email: normalizedEmail });
  };

  if (args.primaryContact?.email && isValidEmail(args.primaryContact.email)) {
    pushItem({
      key: `primary:${String(args.primaryContact.id || "primary")}`,
      contactId: String(args.primaryContact.id || "").trim() || null,
      label: args.primaryContact.name || "Primary contact",
      email: args.primaryContact.email,
      kind: "primary",
    });
  }

  for (const contact of args.contacts) {
    if (!isValidEmail(contact.email)) continue;
    pushItem({
      key: `contact:${String(contact.id || contact.email || "")}`,
      contactId: String(contact.id || "").trim() || null,
      label: contact.name || contact.email || "Contact",
      email: String(contact.email || ""),
      kind: contact.isPrimary ? "primary" : "contact",
    });
  }

  return items;
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

  return (
    <span
      title={label}
      className={["inline-flex max-w-full min-w-0 items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}
    >
      {label}
    </span>
  );
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

function FocusCard({
  eyebrow,
  title,
  detail,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  eyebrow: string;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#effcf9]"
      : tone === "warn"
        ? "border-[#f1ddad] bg-[#fffaf0]"
        : "border-[#dbe9ef] bg-[#f9fcfd]";

  return (
    <div className={["rounded-2xl border p-3", toneClass].join(" ")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a909d]">{eyebrow}</p>
      <p className="mt-1 text-sm font-semibold text-[#173543]">{title}</p>
      <p className="mt-1 text-sm text-[#4a6575]">{detail}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function CustomerDetailManager(props: CustomerDetailManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultTaskAssigneeUserId = props.assignedSalesUserId || props.currentStaffUserId;
  const defaultTaskAssigneeLabel = props.assignedSalesLabel || props.currentStaffLabel || "You";
  const [accountBusy, setAccountBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [hotLeadBusy, setHotLeadBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [routeQueueBusy, setRouteQueueBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionState>({
    loading: true,
    connected: false,
    gmailEmail: null,
    error: null,
    oauthStatus: null,
  });
  const [emailDrawerOpen, setEmailDrawerOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBatchLabel, setEmailBatchLabel] = useState("");
  const [selectedEmailRecipientKeys, setSelectedEmailRecipientKeys] = useState<string[]>([]);
  const [emailResults, setEmailResults] = useState<EmailSendResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(props.companyName);
  const [status, setStatus] = useState(props.status || "active");
  const [stage, setStage] = useState(props.stage || "new");
  const [isHotLead, setIsHotLead] = useState(props.isHotLead);
  const [hasOpenTaskState, setHasOpenTaskState] = useState(props.hasOpenTask);
  const [openTaskCountState, setOpenTaskCountState] = useState(props.openTaskCount);
  const [overdueTaskCountState, setOverdueTaskCountState] = useState(props.overdueTaskCount);
  const [nextTaskDueAtState, setNextTaskDueAtState] = useState(props.nextTaskDueAt);
  const [lastActivityAtState, setLastActivityAtState] = useState(props.lastActivityAt);
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
  const [contacts, setContacts] = useState(props.contacts);
  const [isPrimaryEditorOpen, setIsPrimaryEditorOpen] = useState(false);
  const [isContactComposerOpen, setIsContactComposerOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState("");
  const [secondaryContactName, setSecondaryContactName] = useState("");
  const [secondaryContactEmail, setSecondaryContactEmail] = useState("");
  const [secondaryContactPhone, setSecondaryContactPhone] = useState("");
  const [secondaryContactTitle, setSecondaryContactTitle] = useState("");
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDetails, setActivityDetails] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState(defaultTaskAssigneeUserId);
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
  const callHref = normalizeTelHref(contactPhone || props.mainPhone);
  const emailHref = normalizeMailtoHref(contactEmail || primaryContactEmail);
  const websiteHref = normalizeWebsiteHref(props.website);
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
  const hasPrimaryContact = Boolean(contactName.trim() || contactEmail.trim() || contactPhone.trim());
  const activeFollowUpLabel =
    overdueTaskCountState > 0
      ? `${overdueTaskCountState} overdue follow-up task${overdueTaskCountState === 1 ? "" : "s"}`
      : hasOpenTaskState
        ? nextTaskDueAtState
          ? `Follow-up due ${formatShortDateTime(nextTaskDueAtState)}`
          : `${openTaskCountState} open follow-up task${openTaskCountState === 1 ? "" : "s"}`
        : "No open follow-up task";
  const routeReadinessLabel = missingRouteStates.length > 0 ? `Blocked: ${missingRouteStates.join(" • ")}` : "Route ready for field work";
  const accountPrioritySummary = overdueTaskCountState > 0
    ? "This account has overdue follow-up. Clear the queue or log the outcome before more work drifts."
    : isHotLead
      ? "This account is marked hot. Prioritize contact, capture the latest signal, and set the next step."
      : !hasPrimaryContact
        ? "The account is missing a primary contact. Capture buyer info before the next handoff."
        : missingRouteStates.length > 0
          ? "Route prep is partially blocked. Clean up missing territory or coordinates before staging stops."
          : "The account is operational. Use quick actions to continue follow-up, routing, or activity capture.";
  const nextActionSummary =
    overdueTaskCountState > 0
      ? "Review the overdue follow-up and log the latest interaction."
      : hasOpenTaskState
        ? "Work the active follow-up queue and confirm the next due date."
        : isHotLead
          ? "Create the next follow-up task before this lead cools off."
          : !hasPrimaryContact
            ? "Add the primary contact so the next outreach has a clear owner."
          : "Update routing or log the latest account touchpoint.";
  const emailRecipients = useMemo(
    () =>
      buildEmailRecipientPreview({
        primaryContact: {
          id: props.primaryContact?.id,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          title: contactTitle,
          isPrimary: true,
        },
        contacts,
      }),
    [contactEmail, contactName, contactPhone, contactTitle, contacts, props.primaryContact?.id]
  );
  const selectedEmailRecipients = useMemo(
    () => emailRecipients.filter((recipient) => selectedEmailRecipientKeys.includes(recipient.key)),
    [emailRecipients, selectedEmailRecipientKeys]
  );
  const additionalContacts = useMemo(() => contacts.filter((contact) => !contact.isPrimary), [contacts]);
  const primaryDisplayName = contactName.trim() || "No primary contact";
  const primaryDisplayTitle = contactTitle?.trim() || "No title";
  const primaryDisplayEmail = contactEmail?.trim() || "No email";

  useEffect(() => {
    setContacts(props.contacts);
  }, [props.contacts]);

  useEffect(() => {
    setContactName(props.primaryContact?.name || "");
    setContactEmail(props.primaryContact?.email || "");
    setContactPhone(props.primaryContact?.phone || "");
    setContactTitle(props.primaryContact?.title || "");
  }, [props.primaryContact?.email, props.primaryContact?.id, props.primaryContact?.name, props.primaryContact?.phone, props.primaryContact?.title]);

  useEffect(() => {
    setIsHotLead(props.isHotLead);
  }, [props.isHotLead]);

  useEffect(() => {
    setHasOpenTaskState(props.hasOpenTask);
    setOpenTaskCountState(props.openTaskCount);
    setOverdueTaskCountState(props.overdueTaskCount);
    setNextTaskDueAtState(props.nextTaskDueAt);
  }, [props.hasOpenTask, props.openTaskCount, props.overdueTaskCount, props.nextTaskDueAt]);

  useEffect(() => {
    setLastActivityAtState(props.lastActivityAt);
  }, [props.lastActivityAt]);

  useEffect(() => {
    setTaskAssignedUserId((current) => current || defaultTaskAssigneeUserId);
  }, [defaultTaskAssigneeUserId]);

  useEffect(() => {
    setSelectedEmailRecipientKeys((current) => {
      const available = new Set(emailRecipients.map((recipient) => recipient.key));
      const filtered = current.filter((key) => available.has(key));
      const fallback = emailRecipients.slice(0, 10).map((recipient) => recipient.key);
      const next = filtered.length > 0 ? filtered : fallback;
      if (next.length === current.length && next.every((item, index) => item === current[index])) {
        return current;
      }
      return next;
    });
  }, [emailRecipients]);

  useEffect(() => {
    let active = true;

    async function loadGmailStatus() {
      try {
        const res = await fetch("/api/workspace/email/connection", { cache: "no-store" });
        const json = await parseJsonSafe(res);
        if (!active) return;
        if (!res.ok) {
          setGmailStatus({
            loading: false,
            connected: false,
            gmailEmail: null,
            error: String(json.error || `Unable to load Gmail status (${res.status})`),
            oauthStatus: null,
          });
          return;
        }

        const oauthStatus = String(json.oauthStatus || "").trim() || null;
        const connected = json.connected === true && typeof json.connection === "object" && json.connection !== null;
        if (connected) {
          setGmailStatus({
            loading: false,
            connected: true,
            gmailEmail: String((json.connection as Record<string, unknown>).gmailEmail || ""),
            error: null,
            oauthStatus,
          });
          return;
        }

        setGmailStatus({
          loading: false,
          connected: false,
          gmailEmail: null,
          error: String(json.error || "").trim() || null,
          oauthStatus,
        });
      } catch (loadError) {
        if (!active) return;
        setGmailStatus({
          loading: false,
          connected: false,
          gmailEmail: null,
          error: loadError instanceof Error ? loadError.message : "Unable to load Gmail connection status",
          oauthStatus: null,
        });
      }
    }

    void loadGmailStatus();

    return () => {
      active = false;
    };
  }, []);

  const selectedTaskAssigneeLabel =
    props.salesOptions.find((option) => option.userId === taskAssignedUserId)?.label ||
    (taskAssignedUserId === props.currentStaffUserId ? defaultTaskAssigneeLabel : null);

  function setSuccessMessage(message: string) {
    setSuccess(message);
    setError(null);
  }

  function toggleEmailRecipient(key: string) {
    setSelectedEmailRecipientKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function connectGoogleMailbox() {
    const returnTo = pathname || `/workspace/customers/${props.customerId}`;
    window.location.href = `/api/workspace/email/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  function markActivityTouched(timestamp = new Date().toISOString()) {
    setLastActivityAtState(timestamp);
  }

  function registerTaskCreated(dueDate: string | null | undefined) {
    const dueAt = String(dueDate || "").trim() || null;
    setHasOpenTaskState(true);
    setOpenTaskCountState((current) => current + 1);
    if (dueAt) {
      setNextTaskDueAtState((current) => {
        if (!current) return dueAt;
        const currentMs = Date.parse(current);
        const nextMs = Date.parse(dueAt);
        if (!Number.isFinite(currentMs)) return dueAt;
        if (!Number.isFinite(nextMs)) return current;
        return nextMs < currentMs ? dueAt : current;
      });
      const dueMs = Date.parse(dueAt);
      if (Number.isFinite(dueMs) && dueMs < Date.now()) {
        setOverdueTaskCountState((current) => current + 1);
      }
    }
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
      setSuccessMessage("Customer account updated.");
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
      setSuccessMessage(hasRouteConfig ? "Route settings updated." : "Route settings saved.");
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
      setIsPrimaryEditorOpen(false);
      router.refresh();
      setSuccessMessage("Primary contact updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactBusy(false);
    }
  }

  function resetSecondaryContactDraft() {
    setIsContactComposerOpen(false);
    setEditingContactId("");
    setSecondaryContactName("");
    setSecondaryContactEmail("");
    setSecondaryContactPhone("");
    setSecondaryContactTitle("");
  }

  function startAddingContact() {
    setIsContactComposerOpen(true);
    setEditingContactId("");
    setSecondaryContactName("");
    setSecondaryContactEmail("");
    setSecondaryContactPhone("");
    setSecondaryContactTitle("");
  }

  function startEditingContact(contact: PrimaryContact) {
    setIsContactComposerOpen(true);
    setEditingContactId(String(contact.id || ""));
    setSecondaryContactName(contact.name || "");
    setSecondaryContactEmail(contact.email || "");
    setSecondaryContactPhone(contact.phone || "");
    setSecondaryContactTitle(contact.title || "");
  }

  async function saveSecondaryContact() {
    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/contacts`, {
        method: editingContactId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: editingContactId || null,
          name: secondaryContactName,
          email: secondaryContactEmail,
          phone: secondaryContactPhone,
          title: secondaryContactTitle,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      resetSecondaryContactDraft();
      router.refresh();
      setSuccessMessage(editingContactId ? "Contact updated." : "Contact added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactBusy(false);
    }
  }

  async function removeSecondaryContact(contactId: string) {
    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Delete failed (${res.status})`));
      if (editingContactId === contactId) {
        resetSecondaryContactDraft();
      }
      router.refresh();
      setSuccessMessage("Contact removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setContactBusy(false);
    }
  }

  async function promoteContactToPrimary() {
    if (!editingContactId) return;

    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/primary-contact`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: editingContactId,
          name: secondaryContactName,
          email: secondaryContactEmail,
          phone: secondaryContactPhone,
          title: secondaryContactTitle,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Promote failed (${res.status})`));
      resetSecondaryContactDraft();
      router.refresh();
      setSuccessMessage("Contact promoted to primary.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
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
      markActivityTouched();
      setSuccessMessage("Note added.");
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
      markActivityTouched();
      setSuccessMessage("Activity logged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActivityBusy(false);
    }
  }

  async function updateHotLead(nextState: boolean) {
    setHotLeadBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "hot_lead_status",
          summary: nextState ? "Marked account as hot lead" : "Cleared hot lead status",
          details: {
            hot_lead: nextState,
            source: "customer_detail_manual_toggle",
          },
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setIsHotLead(nextState);
      markActivityTouched();
      setSuccessMessage(nextState ? "Hot lead status marked." : "Hot lead status cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setHotLeadBusy(false);
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
          assigned_user_id: taskAssignedUserId || defaultTaskAssigneeUserId,
          priority: taskPriority ? Number(taskPriority) : null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setTaskTitle("");
      setTaskDueDate("");
      setTaskPriority("2");
      registerTaskCreated(taskDueDate);
      markActivityTouched();
      setSuccessMessage("Task created.");
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
        assigned_user_id: task.assignedUserId || taskAssignedUserId || defaultTaskAssigneeUserId,
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
        registerTaskCreated(routeOutcomeTaskDueDate || (outcome.nextVisitDays !== null ? addDaysDateValue(outcome.nextVisitDays) : null));
        markActivityTouched(lastVisit || new Date().toISOString());
        setSuccessMessage(`${outcome.label} recorded and follow-up task created.`);
        return;
      }

      markActivityTouched(lastVisit || new Date().toISOString());
      setSuccessMessage(`${outcome.label} recorded.`);
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
      const retryMessage =
        json.geocode_coordinate_outcome === "updated"
          ? "Geocode retry succeeded and updated coordinates."
          : json.geocode_coordinate_outcome === "preserved"
            ? "Geocode retry did not resolve the address. Existing coordinates were preserved."
            : "Geocode retry completed.";
      setSuccessMessage(retryMessage);
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

  async function sendRouteEmail() {
    if (!gmailStatus.connected) {
      setError(gmailStatus.error || "Connect a Google mailbox before sending route email.");
      setSuccess(null);
      return;
    }

    if (!emailSubject.trim()) {
      setError("Enter an email subject first.");
      setSuccess(null);
      return;
    }

    if (!emailBody.trim()) {
      setError("Enter an email body first.");
      setSuccess(null);
      return;
    }

    if (selectedEmailRecipients.length === 0) {
      setError("Select at least one recipient with a valid email.");
      setSuccess(null);
      return;
    }

    setEmailBusy(true);
    setError(null);
    setSuccess(null);
    setEmailResults([]);

    try {
      const res = await fetch("/api/workspace/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: props.customerId,
          subject: emailSubject,
          body: emailBody,
          batch_label: emailBatchLabel || null,
          route_day: routeDay || null,
          recipients: selectedEmailRecipients.map((recipient) => ({
            customer_id: props.customerId,
            contact_id: recipient.contactId,
            email: recipient.email,
          })),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Send failed (${res.status})`));

      const results = Array.isArray(json.results) ? (json.results as EmailSendResult[]) : [];
      setEmailResults(results);
      markActivityTouched();
      setSuccessMessage(`Route email finished: ${Number(json.sentCount || 0)} sent, ${Number(json.failedCount || 0)} failed.`);
      router.refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Send failed");
      setSuccess(null);
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
      {success ? <p className="rounded-xl border border-[#bfe8df] bg-[#effcf8] px-3 py-2 text-sm text-[#0f766e]">{success}</p> : null}

      <section className="rounded-[28px] border border-[#dbe9ef] bg-[linear-gradient(180deg,#fbfefe_0%,#f3f9fb_100%)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a8796]">Account Operating Summary</p>
            <h2 className="mt-1 text-lg font-semibold text-[#173543]">What matters now on this account</h2>
            <p className="mt-1 max-w-3xl text-sm text-[#4a6575]">{accountPrioritySummary}</p>
          </div>
          <div className="max-w-full rounded-full border border-[#d7e6ed] bg-white px-3 py-1.5 text-xs font-medium text-[#4f6877]">
            {props.assignedSalesLabel || "No assigned sales rep"} • {visitStatus ? titleCase(visitStatus) : "No visit status"} • {lastActivityAtState ? `Last activity ${formatShortDateTime(lastActivityAtState)}` : "No recent activity"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {props.isHallOfFlowersLead ? <StatusPill label="Hall of Flowers" tone="warn" /> : null}
          {isHotLead ? <StatusPill label="Hot Lead" tone="warn" /> : <StatusPill label="Not Hot" tone="neutral" />}
          <StatusPill label={activeFollowUpLabel} tone={overdueTaskCountState > 0 ? "warn" : hasOpenTaskState ? "ok" : "neutral"} />
          <StatusPill label={routeReadinessLabel} tone={missingRouteStates.length > 0 ? "warn" : "ok"} />
          <StatusPill label={hasPrimaryContact ? "Primary contact ready" : "Primary contact missing"} tone={hasPrimaryContact ? "ok" : "warn"} />
          {nextVisitDueAt ? <StatusPill label={`Next visit ${formatShortDateTime(nextVisitDueAt)}`} tone="neutral" /> : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <FocusCard
            eyebrow="Follow-Up"
            title={activeFollowUpLabel}
            detail={nextActionSummary}
            actionLabel={hasOpenTaskState ? "Review Task Queue" : "Create Follow-Up"}
            onAction={() => jumpToSection(hasOpenTaskState ? "customer-linked-task-list" : "customer-create-task", hasOpenTaskState ? null : taskTitleInputRef.current)}
            tone={overdueTaskCountState > 0 ? "warn" : hasOpenTaskState ? "ok" : "neutral"}
          />
          <FocusCard
            eyebrow="Field Ops"
            title={routeReadinessLabel}
            detail={
              missingRouteStates.length > 0
                ? "Fix route coverage gaps before staging this account into the pending stop queue."
                : routeDay
                  ? `Route plan is staged for ${routeDay}.`
                  : "Routing details are ready for staging and handoff."
            }
            actionLabel="Open Route & Field Ops"
            onAction={() => jumpToSection("customer-route-field-ops")}
            tone={missingRouteStates.length > 0 ? "warn" : "ok"}
          />
          <FocusCard
            eyebrow="Contact Coverage"
            title={hasPrimaryContact ? "Buyer contact is on file" : "Primary contact needs cleanup"}
            detail={
              hasPrimaryContact
                ? "Keep the buyer current so follow-up, notes, and route handoffs stay grounded."
                : "Capture the primary buyer before the next outreach or handoff."
            }
            actionLabel="Open Contacts"
            onAction={() => jumpToSection("customer-primary-contact")}
            tone={hasPrimaryContact ? "ok" : "warn"}
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[#cfe5e8] bg-[linear-gradient(180deg,#173543_0%,#1d4658_100%)] p-4 text-white shadow-[0_16px_40px_rgba(16,42,67,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9fd9d2]">Quick Actions</p>
            <h2 className="mt-1 text-lg font-semibold">Continue the account workflow without hunting</h2>
            <p className="mt-1 text-sm text-[#d3e6eb]">Calls and email fire immediately. The rest jump to the existing follow-up, routing, account, and timeline surfaces below.</p>
          </div>
          <div className="max-w-full rounded-full border border-white/15 bg-black/10 px-3 py-1.5 text-xs font-medium text-[#d7edf0]">
            {territoryCode || "No territory"} • {visitStatus ? titleCase(visitStatus) : "No visit status"} • {hasCoords ? "Map ready" : "Needs coords"}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <ActionButton href={callHref} label="Call" />
          <ActionButton label="Route Email" onClick={() => jumpToSection("customer-route-email")} />
          <ActionButton label="Text" disabled helper="Coming soon" />
          <ActionButton label="New Task" onClick={() => jumpToSection("customer-create-task", taskTitleInputRef.current)} />
          <ActionButton href={websiteHref} label="SITE" disabled={!websiteHref} />
          <ActionButton
            label={hotLeadBusy ? "Saving..." : isHotLead ? "Clear Hot Lead" : "Mark Hot Lead"}
            helper={isHotLead ? "current" : "manual"}
            onClick={() => void updateHotLead(!isHotLead)}
            disabled={hotLeadBusy}
          />
          <ActionButton label={routeQueueBusy ? "Adding..." : "Add to Route"} onClick={() => void addToRoute()} disabled={routeQueueBusy} />
          <ActionButton label="Recent Activity" onClick={() => jumpToSection("customer-activity-timeline")} />
        </div>
      </section>

      <section className={sectionClass}>
        <SectionHeader
          title="Next Steps"
          description="Use the account state above to decide what happens next. These shortcuts enter the exact section that advances the account."
        />
        <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a909d]">Hot Lead Status</p>
            <p className="mt-1 text-sm font-semibold text-[#173543]">{isHotLead ? "This account is currently hot." : "This account is not currently hot."}</p>
            <p className="mt-1 text-sm text-[#4a6575]">
              Manual mark and clear actions write explicit customer activity, and the newest hot-lead signal decides the visible state.
            </p>
            <button
              type="button"
              onClick={() => void updateHotLead(!isHotLead)}
              disabled={hotLeadBusy}
              className="mt-3 inline-flex rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
            >
              {hotLeadBusy ? "Saving..." : isHotLead ? "Clear Hot Lead" : "Mark Hot Lead"}
            </button>
          </div>
          <FocusCard
            eyebrow="Do Now"
            title={overdueTaskCountState > 0 ? "Clear overdue follow-up" : hasOpenTaskState ? "Work active follow-up" : "Start the next follow-up"}
            detail={
              overdueTaskCountState > 0
                ? "There is overdue task work on this account. Review the queue and set the next customer touch."
                : hasOpenTaskState
                  ? "There is already active follow-up. Review the current account task list before creating more."
                  : "No follow-up is open right now. Create the next task to keep ownership explicit."
            }
            actionLabel={hasOpenTaskState ? "Review Account Tasks" : "Create Follow-Up Task"}
            onAction={() => jumpToSection(hasOpenTaskState ? "customer-linked-task-list" : "customer-create-task", hasOpenTaskState ? null : taskTitleInputRef.current)}
            tone={overdueTaskCountState > 0 ? "warn" : hasOpenTaskState ? "ok" : "neutral"}
          />
          <FocusCard
            eyebrow="Log Signal"
            title="Capture the latest account touch"
            detail={
              lastActivityAtState
                ? `Last activity was ${formatShortDateTime(lastActivityAtState)}. Log the next call, email, or meeting here.`
                : "No recent activity is on file. Log the latest customer signal so the timeline stays current."
            }
            actionLabel="Log Activity"
            onAction={() => jumpToSection("customer-log-activity", activitySummaryInputRef.current)}
          />
          <FocusCard
            eyebrow="Route Prep"
            title={missingRouteStates.length > 0 ? "Unblock route setup" : "Stage into route work"}
            detail={
              missingRouteStates.length > 0
                ? `Routing is blocked by ${missingRouteStates.join(" and ")}. Clean that up before adding stops.`
                : "Routing fields are workable. Update field ops or stage the account into the pending stop queue."
            }
            actionLabel={missingRouteStates.length > 0 ? "Fix Route Readiness" : "Open Route Prep"}
            onAction={() => jumpToSection("customer-route-field-ops")}
            tone={missingRouteStates.length > 0 ? "warn" : "ok"}
          />
          <FocusCard
            eyebrow="Account Coverage"
            title={!hasPrimaryContact ? "Add the buyer contact" : "Keep account coverage current"}
            detail={
              !hasPrimaryContact
                ? "This account needs a primary contact before the next outreach or handoff."
                : props.assignedRouteRepLabel
                  ? `Route rep ${props.assignedRouteRepLabel} is set. Keep contacts and ownership aligned.`
                  : "Verify ownership, contact info, and routing coverage before the next handoff."
            }
            actionLabel={!hasPrimaryContact ? "Add Primary Contact" : "Review Account Setup"}
            onAction={() => jumpToSection(!hasPrimaryContact ? "customer-primary-contact" : "customer-account-management", !hasPrimaryContact ? null : accountCompanyInputRef.current)}
            tone={!hasPrimaryContact ? "warn" : "neutral"}
          />
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

        <div className="mt-3 grid gap-3 2xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusPill label={territoryCode ? `Territory ${territoryCode}` : "Territory Missing"} tone={territoryCode ? "ok" : "warn"} />
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

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-5">
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

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-3">
                <span>Run Day (Optional)</span>
                <select value={routeDay} onChange={(event) => setRouteDay(event.target.value)} disabled={routeBusy} className={inputClass}>
                  <option value="">Unassigned</option>
                  {ROUTE_DAYS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] md:col-span-2 xl:col-span-4">
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

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-3">
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

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-4">
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

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-5">
                <span>Next Visit Due</span>
                <input type="datetime-local" value={nextVisitDueAt} onChange={(event) => setNextVisitDueAt(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-5">
                <span>Last Visit</span>
                <input type="datetime-local" value={lastVisitAt} onChange={(event) => setLastVisitAt(event.target.value)} disabled={routeBusy} className={inputClass} />
              </label>

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-3">
                <span>Latitude</span>
                <input type="text" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={routeBusy} className={inputClass} spellCheck={false} autoComplete="off" />
              </label>

              <label className="grid min-w-0 gap-1 text-sm text-[#4a6575] xl:col-span-4">
                <span>Longitude</span>
                <input type="text" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={routeBusy} className={inputClass} spellCheck={false} autoComplete="off" />
              </label>
            </div>
          </div>

          <aside className="grid min-w-0 gap-3 rounded-2xl border border-[#e1ebf1] bg-[#fbfdfe] p-3 text-sm text-[#4a6575]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8398a5]">Routing Snapshot</p>
              <div className="mt-2 space-y-1.5">
                <p className="break-words font-medium text-[#173543]">{territoryMeta?.label || "Territory not assigned"}</p>
                <p>{routeDay ? `Run day saved for later: ${routeDay}` : "Run day is optional for now."}</p>
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
          <SectionHeader
            title="Account Setup"
            description="Keep ownership, lifecycle, and location details accurate so follow-up and route handoffs stay clean."
          />
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
          <SectionHeader title="Contacts" description="Keep the primary buyer current and maintain the wider account contact bench from one place." />

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a909d]">Primary Contact</p>
                  <p className="mt-1 text-sm text-[#5c7483]">Account-level email and call quick actions use this contact by default.</p>
                </div>
                {!isPrimaryEditorOpen ? (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={normalizeMailtoHref(contactEmail) || undefined}
                      className={[
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                        normalizeMailtoHref(contactEmail)
                          ? "border-[#d0dde5] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]"
                          : "cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac] pointer-events-none",
                      ].join(" ")}
                    >
                      Email
                    </a>
                    <a
                      href={normalizeTelHref(contactPhone) || undefined}
                      className={[
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                        normalizeTelHref(contactPhone)
                          ? "border-[#d0dde5] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]"
                          : "cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac] pointer-events-none",
                      ].join(" ")}
                    >
                      Call
                    </a>
                    <button type="button" onClick={() => setIsPrimaryEditorOpen(true)} className="rounded-full bg-[#173543] px-3.5 py-1.5 text-sm font-semibold text-white">
                      Edit Primary
                    </button>
                  </div>
                ) : null}
              </div>

              {!isPrimaryEditorOpen ? (
                <div className="mt-3 rounded-xl border border-[#dbe9ef] bg-white px-3 py-3">
                  <p className="font-semibold text-[#173543]">{primaryDisplayName}</p>
                  <p className="mt-1 text-sm text-[#4a6575]">{primaryDisplayTitle}</p>
                  <p className="mt-1 text-sm text-[#4a6575]">{primaryDisplayEmail}{contactPhone?.trim() ? ` • ${contactPhone.trim()}` : ""}</p>
                </div>
              ) : (
                <>
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void savePrimaryContact()} disabled={contactBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {contactBusy ? "Saving..." : "Save Primary"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContactName(props.primaryContact?.name || "");
                        setContactEmail(props.primaryContact?.email || "");
                        setContactPhone(props.primaryContact?.phone || "");
                        setContactTitle(props.primaryContact?.title || "");
                        setIsPrimaryEditorOpen(false);
                      }}
                      disabled={contactBusy}
                      className="rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a909d]">Additional Contacts</p>
                  <p className="mt-1 text-sm text-[#5c7483]">Work the broader contact bench with explicit row actions instead of a persistent editor.</p>
                </div>
                {!isContactComposerOpen ? (
                  <button type="button" onClick={startAddingContact} className="rounded-full bg-[#173543] px-3.5 py-1.5 text-sm font-semibold text-white">
                    Add Contact
                  </button>
                ) : (
                  <button type="button" onClick={resetSecondaryContactDraft} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]">
                    Cancel
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2.5">
                {additionalContacts.map((contact) => {
                  const isEditingRow = editingContactId === String(contact.id || "");
                  const rowEmailHref = normalizeMailtoHref(contact.email);
                  const rowCallHref = normalizeTelHref(contact.phone);

                  return (
                  <div key={contact.id} className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#173543]">{contact.name || "Unnamed contact"}</p>
                        <p className="mt-1 text-sm text-[#4a6575]">{contact.title || "No title"}</p>
                        <p className="mt-1 text-sm text-[#4a6575]">{contact.email || "No email"}{contact.phone ? ` • ${contact.phone}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={rowEmailHref || undefined}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                            rowEmailHref
                              ? "border-[#d0dde5] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]"
                              : "cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac] pointer-events-none",
                          ].join(" ")}
                        >
                          Email
                        </a>
                        <a
                          href={rowCallHref || undefined}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                            rowCallHref
                              ? "border-[#d0dde5] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]"
                              : "cursor-not-allowed border-[#e2eaee] bg-[#f5f8fa] text-[#8ba0ac] pointer-events-none",
                          ].join(" ")}
                        >
                          Call
                        </a>
                        <button
                          type="button"
                          onClick={() => startEditingContact(contact)}
                          disabled={contactBusy}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60",
                            isEditingRow
                              ? "border-[#14b8a6] bg-[#effcf8] text-[#0f766e]"
                              : "border-[#d0dde5] bg-white text-[#24404d] hover:border-[#14b8a6] hover:text-[#0f766e]",
                          ].join(" ")}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSecondaryContact(String(contact.id || ""))}
                          disabled={contactBusy}
                          className="rounded-full border border-[#f1d1d1] bg-white px-3 py-1.5 text-sm font-semibold text-[#9f2a2a] transition hover:border-[#dc2626] hover:text-[#b91c1c] disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {isEditingRow ? (
                      <>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-sm text-[#4a6575]">
                            <span>Name</span>
                            <input value={secondaryContactName} onChange={(e) => setSecondaryContactName(e.target.value)} disabled={contactBusy} className={inputClass} />
                          </label>
                          <label className="grid gap-1 text-sm text-[#4a6575]">
                            <span>Title</span>
                            <input value={secondaryContactTitle} onChange={(e) => setSecondaryContactTitle(e.target.value)} disabled={contactBusy} className={inputClass} />
                          </label>
                          <label className="grid gap-1 text-sm text-[#4a6575]">
                            <span>Email</span>
                            <input value={secondaryContactEmail} onChange={(e) => setSecondaryContactEmail(e.target.value)} disabled={contactBusy} className={inputClass} />
                          </label>
                          <label className="grid gap-1 text-sm text-[#4a6575]">
                            <span>Phone</span>
                            <input value={secondaryContactPhone} onChange={(e) => setSecondaryContactPhone(e.target.value)} disabled={contactBusy} className={inputClass} />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void saveSecondaryContact()} disabled={contactBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                            {contactBusy ? "Saving..." : "Save"}
                          </button>
                          <button type="button" onClick={() => void promoteContactToPrimary()} disabled={contactBusy} className="rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60">
                            Promote To Primary
                          </button>
                          <button type="button" onClick={resetSecondaryContactDraft} disabled={contactBusy} className="rounded-full border border-[#d0dde5] bg-white px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e] disabled:opacity-60">
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )})}
                {additionalContacts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-white px-3 py-4 text-sm text-[#5d7685]">No additional contacts yet.</div>
                ) : null}
              </div>

              {isContactComposerOpen && !editingContactId ? (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm text-[#4a6575]">
                      <span>Name</span>
                      <input value={secondaryContactName} onChange={(e) => setSecondaryContactName(e.target.value)} disabled={contactBusy} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm text-[#4a6575]">
                      <span>Title</span>
                      <input value={secondaryContactTitle} onChange={(e) => setSecondaryContactTitle(e.target.value)} disabled={contactBusy} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm text-[#4a6575]">
                      <span>Email</span>
                      <input value={secondaryContactEmail} onChange={(e) => setSecondaryContactEmail(e.target.value)} disabled={contactBusy} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-sm text-[#4a6575]">
                      <span>Phone</span>
                      <input value={secondaryContactPhone} onChange={(e) => setSecondaryContactPhone(e.target.value)} disabled={contactBusy} className={inputClass} />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveSecondaryContact()} disabled={contactBusy} className="rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {contactBusy ? "Saving..." : "Add Contact"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <section className={sectionClass}>
        <SectionHeader
          title="Log And Create Follow-Up"
          description="Capture the latest account context, assign the next task, and leave clean internal handoff notes from one place."
        />
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <div id="customer-route-email" className="scroll-mt-28 rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3 xl:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#173543]">Route Email</p>
                <p className="mt-1 text-sm text-[#5c7483]">Send one Gmail message per selected contact and log each send attempt into the account timeline.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={
                    gmailStatus.loading
                      ? "Checking mailbox"
                      : gmailStatus.connected
                        ? `Connected ${gmailStatus.gmailEmail}`
                        : "Mailbox disconnected"
                  }
                  tone={gmailStatus.loading ? "neutral" : gmailStatus.connected ? "ok" : "warn"}
                />
                <button
                  type="button"
                  onClick={connectGoogleMailbox}
                  className="rounded-full border border-[#cfdde6] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                >
                  {gmailStatus.connected ? "Reconnect Google" : "Connect Google"}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailDrawerOpen((current) => !current)}
                  className="rounded-full bg-[#173543] px-3.5 py-1.5 text-sm font-semibold text-white"
                >
                  {emailDrawerOpen ? "Close Compose" : "Open Compose"}
                </button>
              </div>
            </div>

            {gmailStatus.oauthStatus ? (
              <p
                className={[
                  "mt-3 rounded-xl border px-3 py-2 text-sm",
                  gmailStatus.oauthStatus.startsWith("connected:")
                    ? "border-[#bfe8df] bg-[#effcf8] text-[#0f766e]"
                    : "border-[#f1d1d1] bg-[#fff5f5] text-[#991b1b]",
                ].join(" ")}
              >
                {gmailStatus.oauthStatus.startsWith("connected:")
                  ? `Google mailbox connected: ${gmailStatus.oauthStatus.replace(/^connected:/, "").trim()}`
                  : gmailStatus.oauthStatus}
              </p>
            ) : null}

            {!emailDrawerOpen ? null : (
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm text-[#4a6575]">
                    <span>Subject</span>
                    <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} disabled={emailBusy} className={inputClass} placeholder="Route follow-up for this week" />
                  </label>
                  <label className="grid gap-1 text-sm text-[#4a6575]">
                    <span>Body</span>
                    <textarea
                      value={emailBody}
                      onChange={(event) => setEmailBody(event.target.value)}
                      rows={8}
                      disabled={emailBusy}
                      className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
                      placeholder="Write the route outreach message. Each selected recipient gets an individual Gmail send."
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-[#4a6575]">
                    <span>Batch Label</span>
                    <input value={emailBatchLabel} onChange={(event) => setEmailBatchLabel(event.target.value)} disabled={emailBusy} className={inputClass} placeholder="SFV Tuesday route" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void sendRouteEmail()} disabled={emailBusy || !gmailStatus.connected} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      {emailBusy ? "Sending..." : `Send ${selectedEmailRecipients.length} Email${selectedEmailRecipients.length === 1 ? "" : "s"}`}
                    </button>
                    {emailHref ? <ActionButton href={emailHref} label="Open Mailto" /> : null}
                  </div>
                </div>

                <aside className="rounded-2xl border border-[#dbe9ef] bg-white p-3">
                  <p className="text-sm font-semibold text-[#173543]">Recipient Preview</p>
                  <p className="mt-1 text-sm text-[#5c7483]">Blank or invalid emails are excluded automatically. Max 50 recipients per request.</p>
                  <div className="mt-3 space-y-2.5">
                    {emailRecipients.map((recipient) => {
                      const checked = selectedEmailRecipientKeys.includes(recipient.key);
                      return (
                        <label key={recipient.key} className="flex items-start gap-3 rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmailRecipient(recipient.key)}
                            className="mt-1 h-4 w-4 rounded border-[#cfdde6] text-[#14b8a6]"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[#173543]">{recipient.label}</span>
                            <span className="mt-1 block text-sm text-[#4a6575]">{recipient.email}</span>
                            <span className="mt-1 block text-xs uppercase tracking-wide text-[#6b8593]">{recipient.kind === "primary" ? "Primary contact" : "Additional contact"}</span>
                          </span>
                        </label>
                      );
                    })}
                    {emailRecipients.length === 0 ? <div className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-3 py-4 text-sm text-[#5d7685]">No valid contact emails are available on this account.</div> : null}
                  </div>
                </aside>
              </div>
            )}

            {emailResults.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-[#dbe9ef] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={`${emailResults.filter((result) => result.status === "sent").length} sent`} tone="ok" />
                  <StatusPill label={`${emailResults.filter((result) => result.status === "failed").length} failed`} tone={emailResults.some((result) => result.status === "failed") ? "warn" : "neutral"} />
                </div>
                <div className="mt-3 space-y-2.5">
                  {emailResults.map((result) => (
                    <div key={`${result.toEmail}:${result.contactId || "none"}`} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#173543]">{result.toEmail}</p>
                        <StatusPill label={result.status === "sent" ? "Sent" : "Failed"} tone={result.status === "sent" ? "ok" : "warn"} />
                      </div>
                      <p className="mt-1 text-sm text-[#4a6575]">
                        {result.gmailEmail || "Gmail mailbox unavailable"}
                        {result.providerThreadId ? ` • Thread ${result.providerThreadId}` : ""}
                      </p>
                      {result.error ? <p className="mt-1 text-sm text-[#9f2a2a]">{result.error}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div id="customer-log-activity" className="scroll-mt-28 rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
            <p className="text-sm font-semibold text-[#173543]">Log Activity</p>
            <p className="mt-1 text-sm text-[#5c7483]">Capture the call, email, meeting, or task update that moved the account.</p>
            <div className="mt-3 grid gap-3">
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
              <label className="grid gap-1 text-sm text-[#4a6575]">
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
          </div>

          <div id="customer-create-task" className="scroll-mt-28 rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
            <p className="text-sm font-semibold text-[#173543]">Create Follow-Up Task</p>
            <p className="mt-1 text-sm text-[#5c7483]">Assign the next explicit owner, due date, and priority for this account.</p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm text-[#4a6575]">
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
              <label className="grid gap-1 text-sm text-[#4a6575]">
                <span>Assigned To</span>
                <select value={taskAssignedUserId} onChange={(e) => setTaskAssignedUserId(e.target.value)} disabled={taskBusy} className={inputClass}>
                  {props.salesOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#6b8593]">
                  Defaulting to {selectedTaskAssigneeLabel || defaultTaskAssigneeLabel}.
                </span>
              </label>
            </div>
            <div className="mt-3">
              <button type="button" onClick={() => void createTask()} disabled={taskBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {taskBusy ? "Saving..." : "Create Task"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-3">
            <p className="text-sm font-semibold text-[#173543]">Add Internal Note</p>
            <p className="mt-1 text-sm text-[#5c7483]">Leave relationship context, handoff notes, or operational detail that should stay internal.</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={8}
              disabled={noteBusy}
              className="mt-3 w-full rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
              placeholder="Add relationship context, follow-up notes, or handoff details."
            />
            <div className="mt-3">
              <button type="button" onClick={() => void createNote()} disabled={noteBusy} className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {noteBusy ? "Saving..." : "Add Note"}
              </button>
            </div>
          </div>
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
    "flex h-9 items-center justify-center whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold tracking-[0.01em] transition",
    disabled || (!href && !onClick)
      ? "cursor-not-allowed border-white/8 bg-white/[0.06] text-[#89a8b2]"
      : "border-white/10 bg-white/[0.08] text-[#f2fbfd] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-[#8de0d6] hover:bg-white/[0.14]",
  ].join(" ");

  const labelContent = (
    <span className="truncate">
      {label}
      {helper ? <span className="ml-1 text-[11px] font-medium uppercase tracking-[0.08em] text-current/75">{helper}</span> : null}
    </span>
  );

  if (href && !disabled) {
    return (
      <a href={href} className={className}>
        {labelContent}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled || (!href && !onClick)} className={className}>
      {labelContent}
    </button>
  );
}
