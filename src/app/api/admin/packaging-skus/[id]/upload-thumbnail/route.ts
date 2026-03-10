import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "42703" || code === "PGRST204" || (message.includes("column") && message.includes("does not exist"));
}

function safeExtension(filename: string, mimeType: string): string {
  const fromName = String(filename || "").split(".").pop()?.trim().toLowerCase() || "";
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

function ymdUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
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
  if (!String(file.type || "").startsWith("image/")) {
    return NextResponse.json({ error: "file must be an image" }, { status: 400 });
  }

  const bucket = "catalog-public";
  const ext = safeExtension(file.name, file.type || "");
  const objectPath = `packaging/${id}/thumbnail/${ymdUTC(new Date())}/${crypto.randomUUID()}.${ext}`;

  const upload = await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const publicUrl = String(publicData?.publicUrl || "").trim();
  if (!publicUrl) {
    return NextResponse.json({ error: "Failed to generate public URL" }, { status: 500 });
  }

  const fullPayload = {
    thumbnail_url: publicUrl,
    thumbnail_bucket: bucket,
    thumbnail_object_path: objectPath,
  };

  const fullUpdate = await supabase.from("packaging_skus").update(fullPayload).eq("id", id).select("id").single();
  if (fullUpdate.error) {
    if (!isMissingColumnError(fullUpdate.error)) {
      return NextResponse.json({ error: fullUpdate.error.message }, { status: 500 });
    }

    const fallbackUpdate = await supabase
      .from("packaging_skus")
      .update({ thumbnail_url: publicUrl })
      .eq("id", id)
      .select("id")
      .single();

    if (fallbackUpdate.error) {
      return NextResponse.json({ error: fallbackUpdate.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ publicUrl, objectPath });
}
