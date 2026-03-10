import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const side = form.get("side")?.toString() || "front";

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = file.name.split(".").pop() || "bin";
  const objectPath = `packaging/${crypto.randomUUID()}-${side}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage.from("catalog-public").upload(objectPath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data } = supabase.storage.from("catalog-public").getPublicUrl(objectPath);
  return NextResponse.json({ url: data.publicUrl, object_path: objectPath });
}
