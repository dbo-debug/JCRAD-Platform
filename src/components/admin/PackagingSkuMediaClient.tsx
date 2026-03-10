"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

type PackagingSkuMedia = {
  id: string;
  name: string | null;
  thumbnail_url: string | null;
  thumbnail_bucket?: string | null;
  thumbnail_object_path?: string | null;
};

export default function PackagingSkuMediaClient({ id }: { id: string }) {
  const [sku, setSku] = useState<PackagingSkuMedia | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      setSaved(null);

      const response = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!mounted) return;

      if (!response.ok) {
        setError(String(json?.error || "Failed to load packaging SKU media"));
        setSku(null);
        setLoading(false);
        return;
      }

      setSku((json?.sku || null) as PackagingSkuMedia | null);
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const thumbnailSrc = useMemo(
    () => String(sku?.thumbnail_url || "").trim() || "/brand/PRIMARY.png",
    [sku?.thumbnail_url]
  );

  async function onUpload() {
    if (!selectedFile) {
      setError("Pick an image file first.");
      return;
    }
    setUploading(true);
    setError(null);
    setSaved(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(id)}/upload-thumbnail`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(json?.error || `Upload failed (${response.status})`));
      }

      const nextUrl = String(json?.publicUrl || "").trim();
      const nextObjectPath = String(json?.objectPath || "").trim();
      setSku((prev) =>
        prev
          ? {
              ...prev,
              thumbnail_url: nextUrl || prev.thumbnail_url || null,
              thumbnail_bucket: "catalog-public",
              thumbnail_object_path: nextObjectPath || prev.thumbnail_object_path || null,
            }
          : prev
      );
      setSelectedFile(null);
      setSaved("Saved thumbnail.");
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Media: ${String(sku?.name || "Packaging SKU")}`}
        description="Manage packaging thumbnail media."
      />

      <div className="space-y-4 rounded-xl border border-[var(--surface-border)] bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm text-[#5b7382]">Current Thumbnail</div>
          {loading ? (
            <p className="mt-2 text-sm text-[#5b7382]">Loading thumbnail...</p>
          ) : (
            <img
              src={thumbnailSrc}
              alt={`${String(sku?.name || "Packaging")} thumbnail`}
              className="mt-2 h-40 w-40 rounded-md border border-[#dbe9ef] object-cover"
            />
          )}
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-[#4f6877]">Upload image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
          />
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading || !selectedFile || loading}
            className="w-fit rounded bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload Thumbnail"}
          </button>
          {error ? <p className="text-sm text-[#991b1b]">{error}</p> : null}
          {saved ? <p className="text-sm text-[#0f766e]">{saved}</p> : null}
          {sku?.thumbnail_object_path ? (
            <p className="text-xs text-[#5b7382]">Object: {sku.thumbnail_object_path}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
