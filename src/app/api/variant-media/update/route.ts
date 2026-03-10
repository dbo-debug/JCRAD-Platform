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

  const { id, patch } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!patch || typeof patch !== "object") return NextResponse.json({ error: "patch required" }, { status: 400 });

  // allow only safe fields
  const allowed: Record<string, boolean> = {
    approved: true,
    visibility: true,
    title: true,
    notes: true,
    sort_order: true,
    is_featured: true,
  };

  const cleanPatch: Record<string, any> = {};
  for (const k of Object.keys(patch)) {
    if (allowed[k]) cleanPatch[k] = patch[k];
  }

  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: "No valid fields in patch" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("variant_media")
    .update(cleanPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, media: data });
}