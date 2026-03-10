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

export async function GET(_req: Request, { params }: RouteParams) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const fullSelect = "id, name, thumbnail_url, thumbnail_bucket, thumbnail_object_path";
  const fallbackSelect = "id, name, thumbnail_url";

  const full = await supabase.from("packaging_skus").select(fullSelect).eq("id", id).single();

  if (full.error && !isMissingColumnError(full.error)) {
    return NextResponse.json({ error: full.error.message }, { status: 500 });
  }

  if (!full.error && full.data) {
    return NextResponse.json({ sku: full.data });
  }

  const fallback = await supabase.from("packaging_skus").select(fallbackSelect).eq("id", id).single();
  if (fallback.error) {
    const status = String(fallback.error?.code || "") === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: fallback.error.message }, { status });
  }

  return NextResponse.json({
    sku: {
      ...(fallback.data || {}),
      thumbnail_bucket: null,
      thumbnail_object_path: null,
    },
  });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const active = typeof body?.active === "boolean" ? body.active : true;

  const { data, error } = await supabase
    .from("packaging_skus")
    .update({ active })
    .eq("id", id)
    .select("id, active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Packaging SKU not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, sku: data });
}
