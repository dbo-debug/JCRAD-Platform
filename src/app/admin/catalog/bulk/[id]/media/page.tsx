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

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "42703" || code === "PGRST204" || (message.includes("column") && message.includes("does not exist"));
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
  let lastError: any = null;

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
          video_url: String(row.video_url || "").trim() || null,
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
