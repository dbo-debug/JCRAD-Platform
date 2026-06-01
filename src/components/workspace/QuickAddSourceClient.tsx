"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FormState = {
  name: string;
  sourceType: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  stage: string;
  notes: string;
};

const INPUT_CLASS =
  "min-h-[56px] w-full rounded-[24px] border border-[#cfe0e8] bg-white px-4 text-base text-[#173543] outline-none transition focus:border-[#8f52dc]";
const TEXTAREA_CLASS =
  "w-full rounded-[24px] border border-[#cfe0e8] bg-white px-4 py-4 text-base text-[#173543] outline-none transition focus:border-[#8f52dc]";

function buildInitialForm(): FormState {
  return {
    name: "",
    sourceType: "",
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    status: "active",
    stage: "new",
    notes: "",
  };
}

export default function QuickAddSourceClient() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(buildInitialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/workspace/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          source_type: form.sourceType,
          company_name: form.companyName,
          contact_name: form.contactName,
          contact_email: form.contactEmail,
          contact_phone: form.contactPhone,
          status: form.status,
          stage: form.stage,
          notes: form.notes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) {
        throw new Error(String(payload?.error || "Quick add failed."));
      }

      router.push(`/workspace/sources/${payload.id}`);
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Quick add failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl">
      <div className="rounded-[32px] border border-[#d5e4eb] bg-[linear-gradient(180deg,#ffffff_0%,#fdf7fb_100%)] p-5 shadow-[0_18px_45px_rgba(16,42,67,0.08)] sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">Procurement Capture</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#173543]">Quick Add Source</h2>
          <p className="mt-2 text-sm text-[#5b7382]">Minimal supplier intake. Save the source fast, then continue working from the full source record.</p>
          <p className="mt-3 inline-flex rounded-full border border-[#e5d8ef] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#5b7382]">
            Low-friction create
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Source Name" required>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Source or supplier name"
              className={INPUT_CLASS}
              required
            />
          </Field>

          <Field label="Source Type">
            <input
              value={form.sourceType}
              onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
              placeholder="farm, broker, processor, manufacturer"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Company Name">
            <input
              value={form.companyName}
              onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
              placeholder="Operating company"
              className={INPUT_CLASS}
            />
          </Field>

          <details className="rounded-[24px] border border-[#e5d8ef] bg-[#fcf7fd] px-4 py-3" open>
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#173543]">
              Contact and follow-up
              <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7891a0]">Optional</span>
            </summary>
            <div className="mt-4 space-y-4">
              <Field label="Contact Name">
                <input
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  placeholder="Primary sourcing contact"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="Contact Email">
                <input
                  type="email"
                  autoComplete="email"
                  value={form.contactEmail}
                  onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                  placeholder="name@source.com"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="Contact Phone">
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.contactPhone}
                  onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                  placeholder="(555) 555-5555"
                  className={INPUT_CLASS}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={INPUT_CLASS}>
                    {["active", "prospect", "lead", "on_hold", "inactive"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Stage">
                  <select value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} className={INPUT_CLASS}>
                    {["new", "qualified", "active", "paused", "closed"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Supply categories, pricing context, sample status, next steps."
                  className={TEXTAREA_CLASS}
                />
              </Field>
            </div>
          </details>

          {error ? <p className="rounded-[24px] border border-[#f0c8c8] bg-[#fff6f6] px-4 py-3 text-sm text-[#9f2d2d]">{error}</p> : null}

          <div className="sticky bottom-3 z-10 rounded-[28px] border border-[#cfe0e8] bg-[rgba(255,255,255,0.96)] p-3 shadow-[0_12px_30px_rgba(16,42,67,0.08)] backdrop-blur">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[58px] w-full rounded-full bg-[#8f52dc] px-5 py-3 text-base font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving Source..." : "Save Source"}
            </button>
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
      <span className="text-sm font-semibold text-[#173543]">
        {label}
        {required ? <span className="ml-1 text-[#6f32b5]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
