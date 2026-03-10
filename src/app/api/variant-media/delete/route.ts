import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  await requireAdmin();

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Get row first (need bucket + object_path)
  const { data: row, error: readErr } = await supabaseAdmin
    .from("variant_media")
    .select("id, bucket, object_path")
    .eq("id", id)
    .single();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  // Remove from storage
  const { error: storageErr } = await supabaseAdmin.storage
    .from(row.bucket)
    .remove([row.object_path]);

  if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 });

  // Remove DB row
  const { error: dbErr } = await supabaseAdmin
    .from("variant_media")
    .delete()
    .eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}