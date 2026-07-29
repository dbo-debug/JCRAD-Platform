"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCOUNT_OWNERSHIP_OPTIONS,
  DEFAULT_COMMISSION_RATE,
  OPPORTUNITY_STAGE_OPTIONS,
  SALES_ZONE_OPTIONS,
} from "@/lib/namelessWorkspace";

type DuplicateMatch = {
  id: string;
  storeName: string;
  legalName: string | null;
  licenseNumber: string | null;
  city: string | null;
  reasons: string[];
};

const inputClass =
  "min-h-12 w-full rounded-xl border border-[#cfe0e8] bg-white px-4 py-3 text-base text-[#173543] outline-none focus:border-[#0d6f7a] focus:ring-2 focus:ring-[#0d6f7a]/15";

function labelize(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function RetailAccountCreateForm({ canOverrideCommission }: { canOverrideCommission: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [form, setForm] = useState({
    storeName: "",
    legalName: "",
    licenseNumber: "",
    licenseType: "",
    licenseStatus: "",
    address1: "",
    city: "",
    postalCode: "",
    areaZone: "San Fernando Valley",
    website: "",
    instagram: "",
    mainPhone: "",
    buyerName: "",
    buyerTitle: "Buyer",
    buyerEmail: "",
    buyerMobile: "",
    distributor: "",
    numberOfLocations: "1",
    currentBrands: "",
    leadSource: "In-person retail outreach",
    ownershipStatus: "unverified",
    ownershipNotes: "",
    commissionRate: String(DEFAULT_COMMISSION_RATE * 100),
    stage: "new_prospect",
    nextAction: "",
    nextFollowUpDate: "",
    notes: "",
  });

  const requestBody = useMemo(
    () => ({
      store_name: form.storeName,
      dba_name: form.storeName,
      legal_business_name: form.legalName,
      license_number: form.licenseNumber,
      license_type: form.licenseType,
      license_status: form.licenseStatus,
      address: [form.address1, form.city, "CA", form.postalCode].filter(Boolean).join(" "),
      address_1: form.address1,
      city: form.city,
      state: "CA",
      postal_code: form.postalCode,
      area_zone: form.areaZone,
      website: form.website,
      instagram: form.instagram,
      main_phone: form.mainPhone,
      buyer_name: form.buyerName,
      buyer_title: form.buyerTitle,
      buyer_email: form.buyerEmail,
      buyer_mobile: form.buyerMobile,
      distributor: form.distributor,
      number_of_locations: form.numberOfLocations,
      current_brands_carried: form.currentBrands.split(",").map((value) => value.trim()).filter(Boolean),
      lead_source: form.leadSource,
      ownership_status: form.ownershipStatus,
      ownership_notes: form.ownershipNotes,
      commission_rate: Number(form.commissionRate) / 100,
      stage: form.stage,
      next_action: form.nextAction,
      next_follow_up_date: form.nextFollowUpDate,
      notes: form.notes,
    }),
    [form]
  );

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDuplicateChecked(false);
    setDuplicateOverride(false);
  }

  async function checkDuplicates() {
    setBusy("check");
    setError(null);
    try {
      const response = await fetch("/api/workspace/retail/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, action: "check_duplicates" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(json.error || "Duplicate check failed."));
      setMatches(Array.isArray(json.matches) ? json.matches : []);
      setDuplicateChecked(true);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Duplicate check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!duplicateChecked) {
      setError("Run the existing-account check before creating this account.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/workspace/retail/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, action: "create", duplicate_override: duplicateOverride }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (Array.isArray(json.matches)) setMatches(json.matches);
        throw new Error(String(json.error || "Account creation failed."));
      }
      router.push(`/workspace/customers/${encodeURIComponent(String(json.customerId || ""))}`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Account creation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-[28px] border border-[#d8e6ed] bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold text-[#173543]">Retail account</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="DBA / store name" required><input required value={form.storeName} onChange={(e) => update("storeName", e.target.value)} className={inputClass} /></Field>
          <Field label="Legal business name"><input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} className={inputClass} /></Field>
          <Field label="License number"><input value={form.licenseNumber} onChange={(e) => update("licenseNumber", e.target.value)} className={inputClass} /></Field>
          <Field label="License type"><input value={form.licenseType} onChange={(e) => update("licenseType", e.target.value)} className={inputClass} /></Field>
          <Field label="License status"><input value={form.licenseStatus} onChange={(e) => update("licenseStatus", e.target.value)} className={inputClass} /></Field>
          <Field label="Main phone"><input type="tel" value={form.mainPhone} onChange={(e) => update("mainPhone", e.target.value)} className={inputClass} /></Field>
          <Field label="Store address" className="md:col-span-2"><input value={form.address1} onChange={(e) => update("address1", e.target.value)} className={inputClass} /></Field>
          <Field label="City"><input value={form.city} onChange={(e) => update("city", e.target.value)} className={inputClass} /></Field>
          <Field label="ZIP code"><input inputMode="numeric" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} className={inputClass} /></Field>
          <Field label="Sales zone"><select value={form.areaZone} onChange={(e) => update("areaZone", e.target.value)} className={inputClass}>{SALES_ZONE_OPTIONS.map((zone) => <option key={zone}>{zone}</option>)}</select></Field>
          <Field label="Number of locations"><input type="number" min="1" value={form.numberOfLocations} onChange={(e) => update("numberOfLocations", e.target.value)} className={inputClass} /></Field>
          <Field label="Website"><input value={form.website} onChange={(e) => update("website", e.target.value)} className={inputClass} /></Field>
          <Field label="Instagram"><input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} className={inputClass} /></Field>
          <Field label="Distributor"><input value={form.distributor} onChange={(e) => update("distributor", e.target.value)} className={inputClass} /></Field>
          <Field label="Current brands carried"><input value={form.currentBrands} onChange={(e) => update("currentBrands", e.target.value)} placeholder="Comma separated" className={inputClass} /></Field>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#d8e6ed] bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold text-[#173543]">Buyer</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Buyer name"><input value={form.buyerName} onChange={(e) => update("buyerName", e.target.value)} className={inputClass} /></Field>
          <Field label="Buyer title"><input value={form.buyerTitle} onChange={(e) => update("buyerTitle", e.target.value)} className={inputClass} /></Field>
          <Field label="Buyer email"><input type="email" value={form.buyerEmail} onChange={(e) => update("buyerEmail", e.target.value)} className={inputClass} /></Field>
          <Field label="Buyer mobile"><input type="tel" value={form.buyerMobile} onChange={(e) => update("buyerMobile", e.target.value)} className={inputClass} /></Field>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#d8e6ed] bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold text-[#173543]">Ownership and next action</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Lead source"><input value={form.leadSource} onChange={(e) => update("leadSource", e.target.value)} className={inputClass} /></Field>
          <Field label="Ownership status"><select value={form.ownershipStatus} onChange={(e) => update("ownershipStatus", e.target.value)} className={inputClass}>{ACCOUNT_OWNERSHIP_OPTIONS.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
          <Field label="Pipeline stage"><select value={form.stage} onChange={(e) => update("stage", e.target.value)} className={inputClass}>{OPPORTUNITY_STAGE_OPTIONS.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
          <Field label="Commission rate">{canOverrideCommission ? <div className="relative"><input type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={(e) => update("commissionRate", e.target.value)} className={inputClass} /><span className="pointer-events-none absolute right-4 top-3.5 text-[#5c7483]">%</span></div> : <p className="flex min-h-12 items-center rounded-xl border border-[#d8e6ed] bg-[#f5f9fb] px-4 text-[#173543]">5%</p>}</Field>
          <Field label="Next action"><input value={form.nextAction} onChange={(e) => update("nextAction", e.target.value)} className={inputClass} /></Field>
          <Field label="Next follow-up date"><input type="date" value={form.nextFollowUpDate} onChange={(e) => update("nextFollowUpDate", e.target.value)} className={inputClass} /></Field>
          <Field label="Ownership notes" className="md:col-span-2"><textarea rows={3} value={form.ownershipNotes} onChange={(e) => update("ownershipNotes", e.target.value)} className={inputClass} /></Field>
          <Field label="Account notes" className="md:col-span-2"><textarea rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} className={inputClass} /></Field>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#f1ddad] bg-[#fffaf0] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-[#173543]">Existing-account check</h2>
            <p className="mt-1 text-sm text-[#5c7483]">Checks store name, legal name, license, address, buyer email, and phone.</p>
          </div>
          <button type="button" onClick={() => void checkDuplicates()} disabled={busy !== null || !form.storeName.trim()} className="min-h-12 rounded-full border border-[#c9a95b] bg-white px-5 py-3 font-semibold text-[#6b5313] disabled:opacity-50">
            {busy === "check" ? "Checking..." : "Run Existing-Account Check"}
          </button>
        </div>
        {duplicateChecked && matches.length === 0 ? <p className="mt-4 rounded-xl bg-[#effcf8] px-4 py-3 text-sm font-semibold text-[#0d6f7a]">No likely Nameless account match found.</p> : null}
        {matches.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="font-semibold text-[#991b1b]">Possible existing account found. Nothing will be merged automatically.</p>
            {matches.map((match) => <div key={match.id} className="rounded-xl border border-[#f1d1d1] bg-white px-4 py-3"><p className="font-semibold text-[#173543]">{match.storeName}</p><p className="mt-1 text-sm text-[#5c7483]">{[match.legalName, match.licenseNumber, match.city].filter(Boolean).join(" • ") || "Limited account details"}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#991b1b]">Matched: {match.reasons.join(", ")}</p></div>)}
            {form.ownershipStatus === "douglas_originated_account" ? <label className="flex items-start gap-3 rounded-xl border border-[#f1d1d1] bg-white p-4 text-sm text-[#5c7483]"><input type="checkbox" checked={duplicateOverride} onChange={(e) => setDuplicateOverride(e.target.checked)} className="mt-0.5 h-5 w-5" /><span>I reviewed these matches and still want to create a separate Douglas-originated account.</span></label> : null}
          </div>
        ) : null}
      </section>

      {error ? <p role="alert" className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-4 py-3 text-[#991b1b]">{error}</p> : null}
      <button type="submit" disabled={busy !== null || !duplicateChecked || (matches.length > 0 && form.ownershipStatus === "douglas_originated_account" && !duplicateOverride)} className="min-h-14 w-full rounded-full bg-[#173543] px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {busy === "create" ? "Creating account..." : "Create Nameless Retail Account"}
      </button>
    </form>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={["grid gap-1.5 text-sm font-semibold text-[#355160]", className || ""].join(" ")}><span>{label}{required ? " *" : ""}</span>{children}</label>;
}
