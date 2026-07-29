"use client";

import Link from "next/link";
import { useState } from "react";

type OwnerOption = {
  userId: string;
  label: string;
};

type QuickAddLeadClientProps = {
  ownerOptions: OwnerOption[];
  canAssignOwner: boolean;
  currentUserId: string;
  startLink: string;
};

type FormState = {
  accountName: string;
  contactName: string;
  mobilePhone: string;
  email: string;
  city: string;
  notes: string;
  interest: string;
  hotLead: boolean;
  ownerUserId: string;
};

type SubmitResult = {
  customerId: string;
  action: "created" | "updated";
  sms: {
    ok: boolean;
    status: string;
    error: string | null;
    to: string | null;
  };
};

const DEFAULT_INTEREST = "menu_and_estimate";

const INTEREST_OPTIONS = [
  { value: "menu_and_estimate", label: "Menu + Estimate" },
  { value: "flower", label: "Flower" },
  { value: "pre_rolls", label: "Pre-Rolls" },
  { value: "vapes", label: "Vapes" },
  { value: "concentrates", label: "Concentrates" },
  { value: "copack", label: "Copack" },
  { value: "packaging", label: "Packaging" },
  { value: "samples", label: "Samples" },
];

const INPUT_CLASS =
  "min-h-[56px] w-full rounded-[24px] border border-[#cfe0e8] bg-white px-4 text-base text-[#181817] outline-none transition focus:border-[#1b1b1a]";
const TEXTAREA_CLASS =
  "w-full rounded-[24px] border border-[#cfe0e8] bg-white px-4 py-4 text-base text-[#181817] outline-none transition focus:border-[#1b1b1a]";

function buildInitialForm(currentUserId: string): FormState {
  return {
    accountName: "",
    contactName: "",
    mobilePhone: "",
    email: "",
    city: "",
    notes: "",
    interest: DEFAULT_INTEREST,
    hotLead: false,
    ownerUserId: currentUserId,
  };
}

function smsStatusMessage(result: SubmitResult["sms"]) {
  if (result.ok) return `Follow-up SMS sent to ${result.to || "the lead"}.`;
  if (result.status === "not_configured") return "Lead saved. SMS provider is not configured yet.";
  if (result.status === "invalid_number") return "Lead saved. SMS was skipped because the phone number format was invalid.";
  return `Lead saved. SMS did not send${result.error ? `: ${result.error}` : "."}`;
}

export default function QuickAddLeadClient(props: QuickAddLeadClientProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(props.currentUserId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);

  const filledCount = [form.accountName, form.mobilePhone, form.contactName, form.email, form.city, form.notes].filter((value) => value.trim()).length;
  const completionSeconds = filledCount <= 2 ? "Under 20 seconds" : "Fast mobile capture";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/workspace/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: form.accountName,
          contact_name: form.contactName,
          mobile_phone: form.mobilePhone,
          email: form.email,
          city: form.city,
          notes: form.notes,
          interest: form.interest,
          hot_lead: form.hotLead,
          owner_user_id: props.canAssignOwner ? form.ownerUserId || null : props.currentUserId,
          source: "hall_of_flowers",
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (SubmitResult & { error?: string })
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(String(payload && "error" in payload ? payload.error : "Quick add failed."));
      }

      setResult(payload as SubmitResult);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Quick add failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(props.startLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function resetForm() {
    setForm(buildInitialForm(props.currentUserId));
    setResult(null);
    setError(null);
    setCopied(false);
  }

  if (result) {
    return (
      <section className="mx-auto max-w-xl rounded-[28px] border border-[#cfe1e8] bg-white p-5 shadow-[0_18px_45px_rgba(16,42,67,0.08)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1b1b1a]">Lead Captured</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#181817]">
              {result.action === "created" ? "New CRM lead saved" : "Existing account updated"}
            </h2>
            <p className="mt-2 text-sm text-[#5b7382]">{smsStatusMessage(result.sms)}</p>
          </div>
          <span className="rounded-full border border-[#d9ddd9] bg-[#f7f7f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#1b1b1a]">
            Hall of Flowers
          </span>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={resetForm}
            className="min-h-[56px] w-full rounded-full bg-[#1b1b1a] px-4 py-3 text-base font-semibold text-white transition hover:opacity-95"
          >
            Add Another Lead
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={`/workspace/customers/${result.customerId}`}
              className="min-h-[52px] rounded-full border border-[#c7dce5] bg-white px-4 py-3 text-center text-sm font-semibold text-[#23414e] transition hover:border-[#1b1b1a] hover:text-[#1b1b1a]"
            >
              Open Customer
            </Link>
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-[52px] rounded-full border border-[#c7dce5] bg-[#f7f7f4] px-4 py-3 text-sm font-semibold text-[#23414e] transition hover:border-[#1b1b1a] hover:text-[#1b1b1a]"
            >
              {copied ? "Start Link Copied" : "Copy Direct Link"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[#deded8] bg-[#f7f7f4] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6e8796]">Public handoff link</p>
          <p className="mt-1 break-all text-sm text-[#181817]">{props.startLink}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <div className="rounded-[32px] border border-[#d5e4eb] bg-[linear-gradient(180deg,#ffffff_0%,#f7f7f4_100%)] p-5 shadow-[0_18px_45px_rgba(16,42,67,0.08)] sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Event Capture</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#181817]">Quick Add Lead</h2>
          <p className="mt-2 text-sm text-[#5b7382]">Fast booth handoff form. Keep it simple, save the lead, then text the start link.</p>
          <p className="mt-3 inline-flex rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#5b7382]">
            {completionSeconds}
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Account / Store Name" required>
            <input
              value={form.accountName}
              onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
              placeholder="Store or account name"
              className={INPUT_CLASS}
              required
            />
          </Field>

          <Field label="Contact Name">
            <input
              value={form.contactName}
              onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
              placeholder="Buyer or rep name"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Mobile Phone" required>
            <input
              inputMode="tel"
              autoComplete="tel"
              value={form.mobilePhone}
              onChange={(event) => setForm((current) => ({ ...current, mobilePhone: event.target.value }))}
              placeholder="(555) 555-5555"
              className={INPUT_CLASS}
              required
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="name@store.com"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Interest">
            <select
              value={form.interest}
              onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))}
              className={INPUT_CLASS}
            >
              {INTEREST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="What they want, timing, sample asks, pricing context."
              className={TEXTAREA_CLASS}
            />
          </Field>

          <details className="rounded-[24px] border border-[#deded8] bg-[#f7f7f4] px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#181817]">
              More options
              <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7891a0]">Optional</span>
            </summary>
            <div className="mt-4 space-y-4">
              <Field label="City">
                <input
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                  placeholder="Los Angeles"
                  className={INPUT_CLASS}
                />
              </Field>

              {props.canAssignOwner ? (
                <Field label="Owner / Rep">
                  <select
                    value={form.ownerUserId}
                    onChange={(event) => setForm((current) => ({ ...current, ownerUserId: event.target.value }))}
                    className={INPUT_CLASS}
                  >
                    <option value="">Unassigned</option>
                    {props.ownerOptions.map((option) => (
                      <option key={option.userId} value={option.userId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <label className="flex items-center justify-between gap-4 rounded-[24px] border border-[#deded8] bg-white px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#181817]">Hot Lead</p>
                  <p className="text-xs text-[#5b7382]">Creates a follow-up task automatically for this event lead.</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.hotLead}
                  onChange={(event) => setForm((current) => ({ ...current, hotLead: event.target.checked }))}
                  className="h-6 w-6 rounded border-[#b4ccd8] text-[#1b1b1a] focus:ring-[#1b1b1a]"
                />
              </label>
            </div>
          </details>

          {error ? <p className="rounded-[24px] border border-[#f0c8c8] bg-[#fff6f6] px-4 py-3 text-sm text-[#9f2d2d]">{error}</p> : null}

          <div className="sticky bottom-3 z-10 rounded-[28px] border border-[#cfe0e8] bg-[rgba(255,255,255,0.96)] p-3 shadow-[0_12px_30px_rgba(16,42,67,0.08)] backdrop-blur">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[58px] w-full rounded-full bg-[#1b1b1a] px-5 py-3 text-base font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving Lead..." : "Save Lead + Send SMS"}
            </button>
            <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-[#7891a0]">
              Source tag `hall_of_flowers` is applied automatically
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2.5">
      <span className="text-sm font-semibold text-[#181817]">
        {label}
        {required ? <span className="ml-1 text-[#1b1b1a]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
