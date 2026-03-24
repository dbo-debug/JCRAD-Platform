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
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
        const selectedUploads: Array<{
          document_type: string;
          title: string;
          file_name: string;
          content_type: string;
          file_size: number;
          file: File;
        }> = [];

        for (const doc of REQUIRED_DOCS) {
          const file = files[doc.key];
          if (!file) continue;
          if (file.size > MAX_UPLOAD_BYTES) {
            throw new Error(`${file.name} exceeds the 25MB limit.`);
          }
          selectedUploads.push({
            document_type: doc.key,
            title: file.name || doc.label,
            file_name: file.name || doc.label,
            content_type: String(file.type || "").trim() || "application/octet-stream",
            file_size: file.size,
            file,
          });
        }

        if (selectedUploads.length === 0) {
          throw new Error("Upload at least one onboarding document.");
        }

        const prepareRes = await fetch("/api/portal/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            uploads: selectedUploads.map((upload) => ({
              document_type: upload.document_type,
              title: upload.title,
              file_name: upload.file_name,
              content_type: upload.content_type,
              file_size: upload.file_size,
            })),
          }),
        });
        const prepareJson = await prepareRes.json().catch(() => ({}));
        if (!prepareRes.ok) {
          throw new Error(String(prepareJson?.error || `Upload prepare failed (${prepareRes.status})`));
        }

        const preparedUploads = Array.isArray(prepareJson?.uploads)
          ? (prepareJson.uploads as Array<{
              document_type: string;
              title: string;
              file_name: string;
              content_type: string;
              file_size: number;
              bucket: string;
              object_path: string;
              upload_token: string;
            }>)
          : [];

        if (preparedUploads.length !== selectedUploads.length) {
          throw new Error("Upload preparation returned an unexpected file count.");
        }

        for (const preparedUpload of preparedUploads) {
          const localUpload = selectedUploads.find((upload) => upload.document_type === preparedUpload.document_type);
          if (!localUpload) {
            throw new Error(`Missing selected file for ${preparedUpload.document_type}.`);
          }

          const uploadResult = await supabase.storage
            .from(preparedUpload.bucket)
            .uploadToSignedUrl(preparedUpload.object_path, preparedUpload.upload_token, localUpload.file, {
              cacheControl: "3600",
              contentType: preparedUpload.content_type,
              upsert: false,
            });

          if (uploadResult.error) {
            throw new Error(uploadResult.error.message || `Failed to upload ${localUpload.file_name}.`);
          }
        }

        const finalizeRes = await fetch("/api/portal/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "finalize",
            uploads: preparedUploads.map((upload) => ({
              document_type: upload.document_type,
              title: upload.title,
              file_name: upload.file_name,
              content_type: upload.content_type,
              file_size: upload.file_size,
              bucket: upload.bucket,
              object_path: upload.object_path,
              file_url: "",
            })),
          }),
        });
        const finalizeJson = await finalizeRes.json().catch(() => ({}));
        if (!finalizeRes.ok) {
          throw new Error(String(finalizeJson?.error || `Upload finalize failed (${finalizeRes.status})`));
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
      <p className="text-sm text-[#5d7685]">Up to 25 MB per file. PDFs work best for onboarding packets and compliance documents.</p>

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
