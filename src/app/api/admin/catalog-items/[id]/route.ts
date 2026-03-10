import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function updateActive(id: string, active: boolean) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .update({ active })
    .eq("id", id)
    .select("id, active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, catalog_item: data });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  await requireAdmin();
  const { id } = await params;
  return updateActive(id, false);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nextActive = typeof body?.active === "boolean" ? body.active : true;
  return updateActive(id, nextActive);
}
