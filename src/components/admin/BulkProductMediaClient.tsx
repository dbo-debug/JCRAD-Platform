"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type MediaValues = {
  thumbnail_url: string | null;
  thumbnail_bucket: string | null;
  thumbnail_object_path: string | null;
  video_url: string | null;
  video_bucket: string | null;
  video_object_path: string | null;
  coa_url: string | null;
  coa_bucket: string | null;
  coa_object_path: string | null;
};

type MediaKind = "thumbnail" | "video" | "coa";

type BulkProductMediaClientProps = {
  catalogItemId: string;
  initialMedia: MediaValues;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const PUBLIC_STORAGE_BUCKETS = new Set(["catalog-public"]);
const PRODUCT_MEDIA_BUCKET = "catalog-public";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 30;

function fileExtension(file: File): string {
  return String(file.name || "").split(".").pop()?.trim().toLowerCase() || "";
}

function sanitizeFileName(fileName: string): string {
  const trimmed = String(fileName || "").trim().toLowerCase();
  const parts = trimmed.split(".");
  const ext = parts.length > 1 ? parts.pop() || "" : "";
  const stem = parts.join(".") || "video";
  const cleanStem = stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "video";
  const cleanExt = ext.replace(/[^a-z0-9]+/g, "").slice(0, 10);
  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
}

function toStorageReference(bucket: string, objectPath: string): string {
  return `${bucket}:${objectPath}`;
}

async function resolveStorageDisplayUrl(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  objectPath: string
): Promise<{ displayUrl: string; storedUrl: string }> {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(objectPath || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) {
    throw new Error("Missing storage location for uploaded video.");
  }

  if (PUBLIC_STORAGE_BUCKETS.has(cleanBucket)) {
    const { data } = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
    const publicUrl = String(data?.publicUrl || "").trim();
    if (!publicUrl) {
      throw new Error("Uploaded video is missing a public URL.");
    }
    return { displayUrl: publicUrl, storedUrl: publicUrl };
  }

  const { data, error } = await supabase.storage.from(cleanBucket).createSignedUrl(cleanPath, 60 * 60 * 24);
  if (error) {
    throw new Error(error.message);
  }

  const signedUrl = String(data?.signedUrl || "").trim();
  if (!signedUrl) {
    throw new Error("Failed to create a signed video URL.");
  }

  return {
    displayUrl: signedUrl,
    storedUrl: toStorageReference(cleanBucket, cleanPath),
  };
}

function isMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const details = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code || "") : "";
  const lower = message.toLowerCase();
  const code = details.toUpperCase();
  return code === "42703" || code === "PGRST204" || (lower.includes("column") && lower.includes("does not exist"));
}

function validateSelection(kind: MediaKind, file: File): string | null {
  const ext = fileExtension(file);
  const mime = String(file.type || "").toLowerCase();

  if (kind === "thumbnail") {
    if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(mime)) return null;
    return "Thumbnail must be jpg, jpeg, png, webp, or heic.";
  }
  if (kind === "video") {
    if (VIDEO_EXTENSIONS.has(ext) || VIDEO_MIME_TYPES.has(mime)) return null;
    return "Video must be mp4, mov, or webm.";
  }
  if (ext === "pdf" || mime === "application/pdf") return null;
  return "COA must be a PDF.";
}

function successLabel(kind: MediaKind): string {
  if (kind === "thumbnail") return "Thumbnail saved.";
  if (kind === "video") return "Phone video saved.";
  return "COA saved.";
}

async function readVideoDurationSeconds(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = objectUrl;
      video.onloadedmetadata = () => {
        const next = Number(video.duration || 0);
        if (!Number.isFinite(next) || next <= 0) {
          reject(new Error("Could not read video duration. Try another file."));
          return;
        }
        resolve(next);
      };
      video.onerror = () => reject(new Error("Unable to read video metadata. Try MP4 or MOV."));
    });
    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function BulkProductMediaClient({ catalogItemId, initialMedia }: BulkProductMediaClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [media, setMedia] = useState<MediaValues>(initialMedia);
  const [uploading, setUploading] = useState<Record<MediaKind, boolean>>({
    thumbnail: false,
    video: false,
    coa: false,
  });
  const [errors, setErrors] = useState<Record<MediaKind, string>>({
    thumbnail: "",
    video: "",
    coa: "",
  });
  const [saved, setSaved] = useState<Record<MediaKind, string>>({
    thumbnail: "",
    video: "",
    coa: "",
  });

  const thumbnailSrc = useMemo(
    () => String(media.thumbnail_url || "").trim() || "/brand/PRIMARY.png",
    [media.thumbnail_url]
  );

  async function uploadVideoDirect(file: File) {
    const ext = fileExtension(file);
    const sanitizedFileName = sanitizeFileName(file.name || `phone-video.${ext || "mp4"}`);
    const objectPath = `products/${catalogItemId}/phone-video/${Date.now()}-${sanitizedFileName}`;
    const contentType = String(file.type || "").trim() || "application/octet-stream";

    const { error: uploadError } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(objectPath, file, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });
    if (uploadError) {
      throw new Error(uploadError.message || "Video upload failed.");
    }

    const { displayUrl, storedUrl } = await resolveStorageDisplayUrl(supabase, PRODUCT_MEDIA_BUCKET, objectPath);

    const fullUpdate = await supabase
      .from("catalog_items")
      .update({
        video_url: storedUrl,
        video_bucket: PRODUCT_MEDIA_BUCKET,
        video_object_path: objectPath,
      })
      .eq("id", catalogItemId)
      .select("id")
      .maybeSingle();

    if (fullUpdate.error) {
      if (!isMissingColumnError(fullUpdate.error)) {
        throw new Error(fullUpdate.error.message);
      }

      const fallback = await supabase
        .from("catalog_items")
        .update({ video_url: storedUrl })
        .eq("id", catalogItemId)
        .select("id")
        .maybeSingle();
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
      if (!fallback.data) {
        throw new Error("Catalog item not found.");
      }
    } else if (!fullUpdate.data) {
      throw new Error("Catalog item not found.");
    }

    return {
      bucket: PRODUCT_MEDIA_BUCKET,
      objectPath,
      url: displayUrl,
    };
  }

  async function upload(kind: MediaKind, file: File, input: HTMLInputElement) {
    setUploading((prev) => ({ ...prev, [kind]: true }));
    setErrors((prev) => ({ ...prev, [kind]: "" }));
    setSaved((prev) => ({ ...prev, [kind]: "" }));

    try {
      const validationError = validateSelection(kind, file);
      if (validationError) throw new Error(validationError);
      if (kind === "video") {
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error("Video must be 50MB or smaller.");
        }
        const durationSeconds = await readVideoDurationSeconds(file);
        if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
          throw new Error("Video must be 30 seconds or shorter.");
        }

        const result = await uploadVideoDirect(file);
        setMedia((prev) => ({
          ...prev,
          video_url: result.url,
          video_bucket: result.bucket,
          video_object_path: result.objectPath,
        }));
        setSaved((prev) => ({ ...prev, video: successLabel("video") }));
        return;
      }

      const form = new FormData();
      form.append("file", file);

      const response = await fetch(`/api/admin/catalog-items/${encodeURIComponent(catalogItemId)}/upload-${kind}`, {
        method: "POST",
        body: form,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(json?.error || `Upload failed (${response.status})`));
      }

      const url = String(json?.url || "").trim() || null;
      const bucket = String(json?.bucket || "").trim() || null;
      const objectPath = String(json?.object_path || "").trim() || null;

      setMedia((prev) => {
        if (kind === "thumbnail") {
          return {
            ...prev,
            thumbnail_url: url,
            thumbnail_bucket: bucket,
            thumbnail_object_path: objectPath,
          };
        }
        return {
          ...prev,
          coa_url: url,
          coa_bucket: bucket,
          coa_object_path: objectPath,
        };
      });

      setSaved((prev) => ({ ...prev, [kind]: successLabel(kind) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setErrors((prev) => ({ ...prev, [kind]: message }));
    } finally {
      input.value = "";
      setUploading((prev) => ({ ...prev, [kind]: false }));
    }
  }

  function onSelect(kind: MediaKind, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] || null;
    if (!file) return;
    void upload(kind, file, input);
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--surface-border)] bg-white p-5 shadow-sm">
      <section className="space-y-3">
        <div className="text-sm text-[#5b7382]">Thumbnail</div>
        <img
          src={thumbnailSrc}
          alt="Product thumbnail"
          className="h-40 w-40 rounded-md border border-[#dbe9ef] object-cover"
        />
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
          onChange={(event) => onSelect("thumbnail", event)}
          disabled={uploading.thumbnail}
          className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
        />
        {uploading.thumbnail ? <p className="text-sm text-[#5b7382]">Uploading thumbnail...</p> : null}
        {errors.thumbnail ? <p className="text-sm text-[#991b1b]">{errors.thumbnail}</p> : null}
        {saved.thumbnail ? <p className="text-sm text-[#0f766e]">{saved.thumbnail}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="text-sm text-[#5b7382]">Phone Video</div>
        {media.video_url ? (
          <div className="space-y-2">
            <video
              controls
              src={media.video_url}
              className="max-h-64 w-full max-w-lg rounded-md border border-[#dbe9ef] bg-[#f6fbfd]"
            />
            <a href={media.video_url} target="_blank" rel="noreferrer" className="text-sm text-[#0f766e] underline">
              Open video
            </a>
          </div>
        ) : (
          <p className="text-sm text-[#5b7382]">No phone video uploaded.</p>
        )}
        <input
          type="file"
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          onChange={(event) => onSelect("video", event)}
          disabled={uploading.video}
          className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
        />
        {uploading.video ? <p className="text-sm text-[#5b7382]">Uploading video...</p> : null}
        {errors.video ? <p className="text-sm text-[#991b1b]">{errors.video}</p> : null}
        {saved.video ? <p className="text-sm text-[#0f766e]">{saved.video}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="text-sm text-[#5b7382]">COA PDF</div>
        {media.coa_url ? (
          <a href={media.coa_url} target="_blank" rel="noreferrer" className="text-sm text-[#0f766e] underline">
            Open COA PDF
          </a>
        ) : (
          <p className="text-sm text-[#5b7382]">No COA uploaded.</p>
        )}
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => onSelect("coa", event)}
          disabled={uploading.coa}
          className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
        />
        {uploading.coa ? <p className="text-sm text-[#5b7382]">Uploading COA...</p> : null}
        {errors.coa ? <p className="text-sm text-[#991b1b]">{errors.coa}</p> : null}
        {saved.coa ? <p className="text-sm text-[#0f766e]">{saved.coa}</p> : null}
      </section>
    </div>
  );
}
