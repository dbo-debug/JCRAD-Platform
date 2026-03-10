import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = {
  params: Promise<{ id: string }>;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "42703" || code === "PGRST204" || (message.includes("column") && message.includes("does not exist"));
}

function extensionFromFile(file: File): string | null {
  const fromName = String(file.name || "").split(".").pop()?.trim().toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  const fromMime = IMAGE_MIME_EXTENSIONS[String(file.type || "").toLowerCase()];
  return fromMime || null;
}

export async function POST(req: Request, { params }: RouteParams) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const ext = extensionFromFile(file);
  if (!ext) {
    return NextResponse.json({ error: "thumbnail must be jpg, jpeg, png, webp, or heic" }, { status: 400 });
  }

  const bucket = "catalog-public";
  const objectPath = `products/${id}/thumbnail.${ext}`;
  const contentType = String(file.type || "").trim() || "application/octet-stream";

  const upload = await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert: true,
    contentType,
  });
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const url = String(publicData?.publicUrl || "").trim();
  if (!url) {
    return NextResponse.json({ error: "Failed to generate public URL" }, { status: 500 });
  }

  const fullUpdate = await supabase
    .from("catalog_items")
    .update({
      thumbnail_url: url,
      thumbnail_bucket: bucket,
      thumbnail_object_path: objectPath,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (fullUpdate.error) {
    if (!isMissingColumnError(fullUpdate.error)) {
      return NextResponse.json({ error: fullUpdate.error.message }, { status: 500 });
    }

    const fallback = await supabase
      .from("catalog_items")
      .update({ thumbnail_url: url })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    if (!fallback.data) {
      return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
    }
  } else if (!fullUpdate.data) {
    return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
  }

  return NextResponse.json({ url, bucket, object_path: objectPath });
}
