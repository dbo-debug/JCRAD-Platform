import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  console.log("[api/variant-media/list] POST hit");
  // Protect admin API
  await requireAdmin();

  const { variant_id } = await req.json().catch(() => ({}));
  if (!variant_id) return NextResponse.json({ error: "variant_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("variant_media")
    .select("id, variant_id, media_type, bucket, object_path, title, notes, visibility, approved, is_featured, sort_order, created_at, updated_at")
    .eq("variant_id", variant_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const media = (data ?? []).map((m: any) => {
    const { data: pub } = supabaseAdmin.storage.from(m.bucket).getPublicUrl(m.object_path);
    return { ...m, url: pub.publicUrl };
  });

  return NextResponse.json({ media });
}
