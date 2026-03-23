"use client";

import { useMemo, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

const REQUIRED_DOCS = [
  { key: "cannabis_license", label: "Cannabis License" },
  { key: "sellers_permit", label: "Seller's Permit" },
  { key: "w9", label: "W9" },
  { key: "irs_form_8300", label: "IRS Form 8300" },
] as const;

type UploadState = Record<string, File | null>;
const DOCUMENTS_BUCKET = "catalog-public";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function normalizeDocumentType(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "upload";
}

function extensionFromFile(file: File): string {
  return String(file.name || "").split(".").pop()?.trim().toLowerCase() || "bin";
}

export default function OnboardingUploadForm() {
  const supabase = useMemo(() => createClient(), []);
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
        const prepRes = await fetch("/api/portal/onboarding", { method: "GET" });
        const prepJson = await prepRes.json().catch(() => ({}));
        if (!prepRes.ok) {
          throw new Error(String(prepJson?.error || `Upload prep failed (${prepRes.status})`));
        }
        const customerAccountId = String(prepJson?.customer_account_id || "").trim();
        const bucket = String(prepJson?.bucket || DOCUMENTS_BUCKET).trim() || DOCUMENTS_BUCKET;
        if (!customerAccountId) {
          throw new Error("No linked customer account found for this user.");
        }

        const uploads: Array<{
          document_type: string;
          title: string;
          file_name: string;
          bucket: string;
          object_path: string;
          file_url: string;
        }> = [];

        for (const doc of REQUIRED_DOCS) {
          const file = files[doc.key];
          if (!file) continue;
          if (file.size > MAX_UPLOAD_BYTES) {
            throw new Error(`${file.name} exceeds the 10MB limit.`);
          }

          const documentType = normalizeDocumentType(doc.key);
          const ext = extensionFromFile(file);
          const objectPath = `customer-documents/${customerAccountId}/${documentType}/${Date.now()}-${safeFileName(file.name || `${documentType}.${ext}`)}`;
          const contentType = String(file.type || "").trim() || "application/octet-stream";

          const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
            cacheControl: "3600",
            contentType,
            upsert: false,
          });
          if (uploadError) {
            throw new Error(uploadError.message || `Failed to upload ${doc.label}.`);
          }

          const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
          uploads.push({
            document_type: documentType,
            title: file.name || doc.label,
            file_name: file.name || `${documentType}.${ext}`,
            bucket,
            object_path: objectPath,
            file_url: String(publicData?.publicUrl || "").trim(),
          });
        }

        if (uploads.length === 0) {
          throw new Error("Upload at least one onboarding document.");
        }

        const res = await fetch("/api/portal/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ uploads }),
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
