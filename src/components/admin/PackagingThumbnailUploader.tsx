"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PackagingThumbnailUploaderProps = {
  skuId: string;
  initialThumbnailUrl?: string | null;
  name?: string | null;
};

export default function PackagingThumbnailUploader({
  skuId,
  initialThumbnailUrl,
  name,
}: PackagingThumbnailUploaderProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(String(initialThumbnailUrl || "").trim() || "/brand/PRIMARY.png");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const hasPreview = !!String(previewUrl || "").trim();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onUpload() {
    if (!selectedFile) {
      setError("Select an image file first.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(skuId)}/upload-thumbnail`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(json?.error || `Upload failed (${response.status})`));
      }

      const nextUrl = String(json?.publicUrl || "").trim();
      if (nextUrl) setPreviewUrl(nextUrl);
      setSelectedFile(null);
      setSuccess("Thumbnail saved.");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--surface-border)] bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-[#173543]">Thumbnail</h2>
        <p className="mt-1 text-sm text-[#5b7382]">Upload the primary image for {name || "this packaging SKU"}.</p>
      </div>

      <img
        src={previewUrl}
        alt={`${name || "Packaging SKU"} thumbnail`}
        className="h-40 w-40 cursor-pointer rounded-md border border-[#dbe9ef] object-cover"
        onClick={() => {
          if (hasPreview) setOpen(true);
        }}
      />
      {hasPreview ? <p className="text-xs text-[#5b7382]">Click thumbnail to view full size</p> : null}

      <div className="grid gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
        />

        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || !selectedFile}
          className="w-fit rounded bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Upload Thumbnail"}
        </button>

        {error ? <p className="text-sm text-[#991b1b]">{error}</p> : null}
        {success ? <p className="text-sm text-[#0f766e]">{success}</p> : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl rounded-lg border border-[#dbe9ef] bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 rounded border border-[#cfdde5] px-2 py-1 text-[#4f6877] hover:text-[#173543]"
              onClick={() => setOpen(false)}
            >
              X
            </button>
            <img
              src={previewUrl}
              alt={`${name || "Packaging SKU"} full size`}
              className="mx-auto max-h-[80vh] w-auto max-w-full rounded-md object-contain"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
