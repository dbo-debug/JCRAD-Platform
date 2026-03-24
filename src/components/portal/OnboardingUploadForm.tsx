"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

const REQUIRED_DOCS = [
  { key: "cannabis_license", label: "Cannabis License" },
  { key: "sellers_permit", label: "Seller's Permit" },
  { key: "w9", label: "W9" },
  { key: "irs_form_8300", label: "IRS Form 8300" },
] as const;

type UploadState = Record<string, File | null>;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default function OnboardingUploadForm() {
  const [files, setFiles] = useState<UploadState>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setFile(key: string, file: File | null) {
    setFiles((current) => ({ ...current, [key]: file }));
  }

  function onSubmit() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const formData = new FormData();

        for (const doc of REQUIRED_DOCS) {
          const file = files[doc.key];
          if (!file) continue;
          if (file.size > MAX_UPLOAD_BYTES) {
            throw new Error(`${file.name} exceeds the 10MB limit.`);
          }
          formData.append(doc.key, file);
        }

        if (Array.from(formData.keys()).length === 0) {
          throw new Error("Upload at least one onboarding document.");
        }

        const res = await fetch("/api/portal/onboarding", {
          method: "POST",
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(json?.error || `Upload finalize failed (${res.status})`));
        }

        setMessage("Documents uploaded. A team member will review your documents within 24 hours.");
        setFiles({});
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type=\"file\"]');
        inputs.forEach((input) => {
          input.value = "";
        });
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3 text-sm text-[#355060]">
        Upload only what you have. If your company uses a single onboarding packet, attach that under <span className="font-semibold text-[#173543]">Cannabis License</span> and you do not need to upload all four documents separately.
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {REQUIRED_DOCS.map((doc) => (
          <Card key={doc.key} className="border border-[var(--surface-border)] bg-white p-5 text-[var(--text)] shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-[#173543]">{doc.label}</h2>
              <span className="rounded-full border border-[#d4e2e9] bg-[#f6fafc] px-2.5 py-1 text-xs text-[#5d7685]">
                Optional per upload
              </span>
            </div>

            <Input
              type="file"
              className="mt-4 border-[#d0dee6] bg-white text-[#173543] focus-visible:ring-[#14b8a6] focus-visible:ring-offset-white file:mr-3 file:rounded-md file:border-0 file:bg-[#14b8a6]/12 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#0f766e]"
              onChange={(event) => setFile(doc.key, event.target.files?.[0] || null)}
            />

            <p className="mt-3 text-xs text-[#5d7685]">{files[doc.key] ? "File selected" : "Upload document"}</p>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="rounded-full bg-[#14b8a6] text-white hover:bg-[#14b8a6] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Uploading..." : "Upload Documents"}
        </Button>
        {message ? <p className="text-sm text-[#0f766e]">{message}</p> : null}
        {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      </div>
    </div>
  );
}
