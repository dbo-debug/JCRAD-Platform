"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { RouteRepOption, SavedRouteSummary, TerritoryOption } from "@/lib/routeWorkspace";

type SavedRoutePlannerPanelProps = {
  customers: CustomerSummary[];
  currentUserId: string;
  routeRepOptions: RouteRepOption[];
  territoryOptions: TerritoryOption[];
  savedRoutes: SavedRouteSummary[];
};

type DraftStop = {
  customerId: string;
  customerName: string;
  territoryCode: string | null;
  routeDay: string | null;
  stopOrder: number;
  estimatedDriveMinutesFromPrevious: number;
  estimatedVisitMinutes: number;
};

const HQ_ORIGIN = {
  name: "JC RAD HQ",
  address: "1055 E. Cesar Chavez Ave, Los Angeles, CA 90033",
  latitude: 34.04536,
  longitude: -118.2355,
};
const DEFAULT_VISIT_MINUTES = 15;
const SUPPORTED_TERRITORY_CODES = new Set(["CA-LA-CORE", "CA-SAN-GABRIEL", "CA-SAN-FERNANDO-VALLEY", "CA-LONG-BEACH"]);

function haversineMiles(args: { leftLat: number; leftLng: number; rightLat: number; rightLng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const deltaLat = toRadians(args.rightLat - args.leftLat);
  const deltaLng = toRadians(args.rightLng - args.leftLng);
  const leftLat = toRadians(args.leftLat);
  const rightLat = toRadians(args.rightLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(leftLat) * Math.cos(rightLat);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveMinutes(miles: number) {
  return Math.max(5, Math.round((miles / 22) * 60));
}

function toTimeLabel(minutesFromMidnight: number) {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHour = ((hours + 11) % 12) + 1;
  return `${normalizedHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function parseStartTimeMinutes(value: string) {
  const [hoursText, minutesText] = String(value || "").split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 9 * 60;
  return hours * 60 + minutes;
}

function buildDraftStops(args: {
  candidates: CustomerSummary[];
  maxStops: number;
}): DraftStop[] {
  const remaining = args.candidates
    .filter((customer) => customer.latitude !== null && customer.longitude !== null)
    .map((customer) => ({
      customer,
      latitude: customer.latitude as number,
      longitude: customer.longitude as number,
    }));

  const orderedStops: DraftStop[] = [];
  let currentLatitude = HQ_ORIGIN.latitude;
  let currentLongitude = HQ_ORIGIN.longitude;

  while (remaining.length > 0 && orderedStops.length < args.maxStops) {
    let nearestIndex = 0;
    let nearestMiles = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const miles = haversineMiles({
        leftLat: currentLatitude,
        leftLng: currentLongitude,
        rightLat: candidate.latitude,
        rightLng: candidate.longitude,
      });
      if (miles < nearestMiles) {
        nearestMiles = miles;
        nearestIndex = index;
      }
    });

    const [nextStop] = remaining.splice(nearestIndex, 1);
    orderedStops.push({
      customerId: nextStop.customer.id,
      customerName: nextStop.customer.name,
      territoryCode: nextStop.customer.territoryCode,
      routeDay: nextStop.customer.routeDay,
      stopOrder: orderedStops.length + 1,
      estimatedDriveMinutesFromPrevious: orderedStops.length === 0 ? 0 : estimateDriveMinutes(nearestMiles),
      estimatedVisitMinutes: DEFAULT_VISIT_MINUTES,
    });
    currentLatitude = nextStop.latitude;
    currentLongitude = nextStop.longitude;
  }

  return orderedStops;
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function SavedRoutePlannerPanel({
  customers,
  currentUserId,
  routeRepOptions,
  territoryOptions,
  savedRoutes,
}: SavedRoutePlannerPanelProps) {
  const router = useRouter();
  const [territoryCode, setTerritoryCode] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [maxStops, setMaxStops] = useState("12");
  const [notes, setNotes] = useState("");
  const [draftStops, setDraftStops] = useState<DraftStop[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);

  const supportedTerritoryOptions = territoryOptions.filter((option) => SUPPORTED_TERRITORY_CODES.has(option.value));
  const selectedTerritory = territoryOptions.find((option) => option.value === territoryCode) || null;
  const candidateCustomers = customers.filter(
    (customer) => customer.territoryCode === territoryCode && customer.latitude !== null && customer.longitude !== null
  );
  const normalizedMaxStops = Math.max(1, Math.min(40, Number(maxStops) || 12));
  const estimatedDriveMinutes = draftStops.reduce((sum, stop) => sum + stop.estimatedDriveMinutesFromPrevious, 0);
  const estimatedVisitMinutes = draftStops.reduce((sum, stop) => sum + stop.estimatedVisitMinutes, 0);
  const estimatedTotalMinutes = estimatedDriveMinutes + estimatedVisitMinutes;

  function updateDraftStops(nextStops: DraftStop[]) {
    setDraftStops(nextStops.map((stop, index) => ({ ...stop, stopOrder: index + 1 })));
  }

  function generateDraft() {
    if (!territoryCode) {
      setStatusMessage("Choose a territory first.");
      return;
    }
    setBusy("generate");
    setStatusMessage(null);

    try {
      const nextDraft = buildDraftStops({
        candidates: candidateCustomers,
        maxStops: normalizedMaxStops,
      });
      updateDraftStops(nextDraft);
      setStatusMessage(
        nextDraft.length > 0
          ? `Generated a ${nextDraft.length}-stop draft from ${candidateCustomers.length} coordinate-ready territory accounts.`
          : "No coordinate-ready customers were available for that territory."
      );
    } finally {
      setBusy(null);
    }
  }

  function moveStop(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftStops.length) return;
    const nextStops = [...draftStops];
    const [stop] = nextStops.splice(index, 1);
    nextStops.splice(nextIndex, 0, stop);
    updateDraftStops(nextStops);
  }

  function removeStop(customerId: string) {
    updateDraftStops(draftStops.filter((stop) => stop.customerId !== customerId));
  }

  async function saveRoute() {
    if (!territoryCode || !assignedUserId || !routeDate || !startTime) {
      setStatusMessage("Territory, rep, route date, and start time are required.");
      return;
    }
    if (draftStops.length === 0) {
      setStatusMessage("Generate a draft before saving a route.");
      return;
    }

    setBusy("save");
    setStatusMessage(null);

    try {
      const routeName = `${territoryCode} • ${routeDate}`;
      const res = await fetch("/api/workspace/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          territory_code: territoryCode,
          origin_name: HQ_ORIGIN.name,
          origin_address: HQ_ORIGIN.address,
          origin_latitude: HQ_ORIGIN.latitude,
          origin_longitude: HQ_ORIGIN.longitude,
          assigned_user_id: assignedUserId,
          route_date: routeDate,
          status: "assigned",
          planned_start_time: startTime,
          max_stops: normalizedMaxStops,
          estimated_drive_minutes: estimatedDriveMinutes,
          estimated_visit_minutes: estimatedVisitMinutes,
          estimated_total_minutes: estimatedTotalMinutes,
          notes: notes || null,
          stops: draftStops.map((stop) => ({
            customer_id: stop.customerId,
            estimated_drive_minutes_from_previous: stop.estimatedDriveMinutesFromPrevious,
            estimated_visit_minutes: stop.estimatedVisitMinutes,
            stop_status: "planned",
            locked: false,
          })),
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));

      const routeId = String(json.route_id || "");
      setStatusMessage("Saved route.");
      setDraftStops([]);
      setNotes("");
      router.refresh();
      if (routeId) {
        router.push(`/workspace/routes/run?routeId=${routeId}`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-[#d8e6ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-5 shadow-[0_24px_60px_rgba(16,42,67,0.08)] lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-[760px]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c8797]">Saved Routes MVP</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#173543]">Generate, save, and execute territory-first daily routes</h2>
          <p className="mt-2 text-sm text-[#5c7483]">
            Drafts start from a territory, default from JC RAD HQ, and only include coordinate-ready customers. The stop order uses a simple nearest-next heuristic for now.
          </p>
        </div>
        <div className="grid w-full gap-2 rounded-2xl border border-[#dbe8ef] bg-white/90 p-4 text-sm text-[#506877] shadow-sm sm:max-w-[320px]">
          <MetricLine label="Candidate Stops" value={String(candidateCustomers.length)} />
          <MetricLine label="Draft Stops" value={String(draftStops.length)} />
          <MetricLine label="Drive Minutes" value={String(estimatedDriveMinutes)} />
          <MetricLine label="Visit Minutes" value={String(estimatedVisitMinutes)} />
          <MetricLine label="Total Minutes" value={String(estimatedTotalMinutes)} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
        <PlannerSelect label="Territory" value={territoryCode} onChange={setTerritoryCode} options={supportedTerritoryOptions.map((option) => ({ value: option.value, label: option.label }))} />
        <PlannerSelect label="Assigned Rep" value={assignedUserId} onChange={setAssignedUserId} options={routeRepOptions.map((option) => ({ value: option.userId, label: option.label }))} />
        <PlannerInput label="Route Date" type="date" value={routeDate} onChange={setRouteDate} />
        <PlannerInput label="Start Time" type="time" value={startTime} onChange={setStartTime} />
        <PlannerInput label="Max Stops" type="number" value={maxStops} onChange={setMaxStops} min="1" max="40" />
      </div>

      <label className="mt-4 grid gap-1 text-sm text-[#4b6676]">
        <span className="font-medium">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="Optional route notes"
          className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
          Origin: {HQ_ORIGIN.name}
        </span>
        <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
          Default day: {selectedTerritory?.routeDayDefault || "Not set"}
        </span>
        <button
          type="button"
          onClick={() => startTransition(generateDraft)}
          disabled={busy !== null}
          className="rounded-full bg-[#173543] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35] disabled:opacity-60"
        >
          {busy === "generate" ? "Generating..." : "Generate Draft"}
        </button>
        <button
          type="button"
          onClick={() => void saveRoute()}
          disabled={busy !== null || draftStops.length === 0}
          className="rounded-full bg-[#14b8a6] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {busy === "save" ? "Saving..." : "Save Route"}
        </button>
        {statusMessage ? <p className="text-sm text-[#4f6877]">{statusMessage}</p> : null}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Draft Stops</p>
              <h3 className="mt-1 text-lg font-semibold text-[#173543]">{draftStops.length > 0 ? `${draftStops.length} ordered stops` : "No draft yet"}</h3>
            </div>
            <span className="rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-sm text-[#4f6877]">
              Start {toTimeLabel(parseStartTimeMinutes(startTime))}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {draftStops.map((stop, index) => (
              <div key={stop.customerId} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">Stop {stop.stopOrder}</p>
                    <p className="mt-1 font-semibold text-[#173543]">{stop.customerName}</p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      Territory {stop.territoryCode || "Unassigned"} • {stop.routeDay || selectedTerritory?.routeDayDefault || "Open day"}
                    </p>
                    <p className="mt-1 text-sm text-[#5c7483]">
                      {stop.estimatedDriveMinutesFromPrevious} min drive • {stop.estimatedVisitMinutes} min visit
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0} className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] disabled:opacity-60">
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStop(index, 1)}
                      disabled={index === draftStops.length - 1}
                      className="rounded-full border border-[#d0dde5] bg-white px-3 py-1.5 text-sm text-[#42606f] disabled:opacity-60"
                    >
                      Down
                    </button>
                    <button type="button" onClick={() => removeStop(stop.customerId)} className="rounded-full border border-[#f2d1d1] bg-white px-3 py-1.5 text-sm text-[#9a3d3d]">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {draftStops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                Generate a territory-first draft to review, reorder, and save a route.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#dbe8ef] bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Saved Routes</p>
            <h3 className="mt-1 text-lg font-semibold text-[#173543]">Recent route plans</h3>
          </div>

          <div className="mt-4 space-y-3">
            {savedRoutes.map((route) => (
              <div key={route.id} className="rounded-2xl border border-[#dbe8ef] bg-[#fbfdfe] p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#173543]">{route.name}</p>
                    <span className="rounded-full border border-[#d7e6ed] bg-white px-2.5 py-1 text-xs font-semibold text-[#496574]">{route.status}</span>
                  </div>
                  <p className="text-sm text-[#5c7483]">
                    {route.routeDate || "No date"} • {route.assignedUserLabel || "Unassigned rep"} • {route.stopCount} stops
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/workspace/routes/run?routeId=${route.id}`} className="rounded-full bg-[#173543] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0f2a35]">
                      Open Runner
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            {savedRoutes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfdde6] bg-[#fbfdfe] px-4 py-10 text-center text-sm text-[#5c7483]">
                No saved routes yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function PlannerSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlannerInput({
  label,
  value,
  onChange,
  type,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "date" | "time" | "number";
  min?: string;
  max?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-[#4b6676]">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        className="rounded-2xl border border-[#cedde6] bg-white px-4 py-3 text-sm text-[#173543] outline-none transition focus:border-[#14b8a6]"
      />
    </label>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7d95a3]">{label}</span>
      <span className="text-base font-semibold text-[#173543]">{value}</span>
    </div>
  );
}
