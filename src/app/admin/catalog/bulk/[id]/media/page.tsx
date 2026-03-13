import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BulkProductMediaClient from "@/components/admin/BulkProductMediaClient";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

type MediaRow = {
  id: string;
  name: string | null;
  thumbnail_url?: string | null;
  thumbnail_bucket?: string | null;
  thumbnail_object_path?: string | null;
  video_url?: string | null;
  video_bucket?: string | null;
  video_object_path?: string | null;
  coa_url?: string | null;
  coa_bucket?: string | null;
  coa_object_path?: string | null;
};

const PUBLIC_STORAGE_BUCKETS = new Set(["catalog-public"]);

function isMissingColumnError(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message || "").toLowerCase() : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code || "").toUpperCase() : "";
  return code === "42703" || code === "PGRST204" || (message.includes("column") && message.includes("does not exist"));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function parseStorageReference(value: string): { bucket: string; objectPath: string } | null {
  const clean = String(value || "").trim();
  const idx = clean.indexOf(":");
  if (idx <= 0) return null;
  const bucket = clean.slice(0, idx).trim();
  const objectPath = clean.slice(idx + 1).trim().replace(/^\/+/, "");
  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

async function resolveStorageUrl(
  supabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  objectPath: string
): Promise<string | null> {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(objectPath || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;

  if (PUBLIC_STORAGE_BUCKETS.has(cleanBucket)) {
    const { data } = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
    return String(data?.publicUrl || "").trim() || null;
  }

  const { data, error } = await supabase.storage.from(cleanBucket).createSignedUrl(cleanPath, 60 * 60 * 24);
  if (error) return null;
  return String(data?.signedUrl || "").trim() || null;
}

async function resolveStoredMediaUrl(
  supabase: ReturnType<typeof createAdminClient>,
  rawUrl: string | null | undefined,
  bucket: string | null | undefined,
  objectPath: string | null | undefined
): Promise<string | null> {
  const direct = String(rawUrl || "").trim();
  if (bucket && objectPath) {
    const resolved = await resolveStorageUrl(supabase, bucket, objectPath);
    if (resolved) return resolved;
  }
  if (!direct) return null;
  if (isHttpUrl(direct) || direct.startsWith("/")) return direct;

  const ref = parseStorageReference(direct);
  if (!ref) return direct;
  return resolveStorageUrl(supabase, ref.bucket, ref.objectPath);
}

export default async function AdminCatalogBulkMediaPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const selectAttempts = [
    "id, name, thumbnail_url, thumbnail_bucket, thumbnail_object_path, video_url, video_bucket, video_object_path, coa_url, coa_bucket, coa_object_path",
    "id, name, thumbnail_url, video_url, coa_url",
    "id, name",
  ];

  let row: MediaRow | null = null;
  let lastError: Error | { message?: string } | null = null;

  for (const selectCols of selectAttempts) {
    const result = await supabase.from("catalog_items").select(selectCols).eq("id", id).maybeSingle();
    if (!result.error) {
      row = (result.data as MediaRow | null) || null;
      lastError = null;
      break;
    }
    if (!isMissingColumnError(result.error)) {
      throw new Error(result.error.message);
    }
    lastError = result.error;
  }

  if (lastError) {
    throw new Error(lastError.message);
  }
  if (!row) notFound();

  const resolvedVideoUrl = await resolveStoredMediaUrl(
    supabase,
    row.video_url,
    row.video_bucket,
    row.video_object_path
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Media: ${String(row.name || "Untitled")}`}
        description="Upload thumbnail, phone video, and COA. Files save immediately."
      />
      <BulkProductMediaClient
        catalogItemId={id}
        initialMedia={{
          thumbnail_url: String(row.thumbnail_url || "").trim() || null,
          thumbnail_bucket: String(row.thumbnail_bucket || "").trim() || null,
          thumbnail_object_path: String(row.thumbnail_object_path || "").trim() || null,
          video_url: resolvedVideoUrl,
          video_bucket: String(row.video_bucket || "").trim() || null,
          video_object_path: String(row.video_object_path || "").trim() || null,
          coa_url: String(row.coa_url || "").trim() || null,
          coa_bucket: String(row.coa_bucket || "").trim() || null,
          coa_object_path: String(row.coa_object_path || "").trim() || null,
        }}
      />
    </div>
  );
}
