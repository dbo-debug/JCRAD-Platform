"use client";

import { useEffect, useState } from "react";

type PackagingSkuThumbnailUploaderProps = {
  skuId: string;
};

type SkuResponse = {
  sku?: {
    thumbnail_url?: string | null;
    name?: string | null;
  } | null;
};

export default function PackagingSkuThumbnailUploader({ skuId }: PackagingSkuThumbnailUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("/brand/PRIMARY.png");
  const [name, setName] = useState<string>("Packaging SKU");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCurrent() {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(skuId)}`, {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as SkuResponse;
      if (!mounted) return;

      if (!response.ok) {
        setError("Failed to load current thumbnail.");
        setLoading(false);
        return;
      }

      const nextUrl = String(json?.sku?.thumbnail_url || "").trim() || "/brand/PRIMARY.png";
      const nextName = String(json?.sku?.name || "").trim() || "Packaging SKU";
      setPreviewUrl(nextUrl);
      setName(nextName);
      setLoading(false);
    }

    void loadCurrent();
    return () => {
      mounted = false;
    };
  }, [skuId]);

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
      setSuccess("Saved thumbnail.");
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
        <p className="mt-1 text-sm text-[#5b7382]">Upload the primary image for {name}.</p>
      </div>

      {loading ? (
        <p className="text-sm text-[#5b7382]">Loading thumbnail...</p>
      ) : (
        <img
          src={previewUrl}
          alt={`${name} thumbnail`}
          className="h-40 w-40 rounded-md border border-[#dbe9ef] object-cover"
        />
      )}

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
    </section>
  );
}
