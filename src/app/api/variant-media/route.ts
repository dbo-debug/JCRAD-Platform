import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { variant_id } = await req.json();

  if (!variant_id) {
    return NextResponse.json({ error: "variant_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("variant_media")
    .select("id, variant_id, media_type, bucket, object_path, title, notes, is_featured, sort_order, created_at")
    .eq("variant_id", variant_id)
    .eq("approved", true)
    .eq("visibility", "public")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Convert object_path -> public URL
  const media = (data ?? []).map((m) => {
    const { data: pub } = supabase.storage.from("catalog-public").getPublicUrl(m.object_path);
    return { ...m, url: pub.publicUrl };
  });

  return NextResponse.json({ media });
}