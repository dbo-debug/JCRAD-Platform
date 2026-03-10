import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type OfferRow = {
  id: string;
  product_id: string;
  status: string | null;
  min_order: number | null;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number | null;
  material_cost_per_g: number | null;
  material_cost_basis: string | null;
  material_cost_input: number | null;
  allow_bulk: boolean | null;
  allow_copack: boolean | null;
  created_at: string;
  updated_at: string;
};

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const product_id = body?.product_id ? String(body.product_id).trim() : "";
  const status = body?.status ? String(body.status).trim().toLowerCase() : "";

  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  if (status !== "published" && status !== "draft") {
    return NextResponse.json({ error: "status must be published or draft" }, { status: 400 });
  }

  const { data: latestOfferData, error: latestOfferErr } = await supabase
    .from("offers")
    .select(
      "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_per_g, material_cost_basis, material_cost_input, allow_bulk, allow_copack, created_at, updated_at"
    )
    .eq("product_id", product_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestOfferErr) return NextResponse.json({ error: latestOfferErr.message }, { status: 500 });

  let latestOffer = latestOfferData as OfferRow | null;
  if (!latestOffer) {
    const { data: insertedOffer, error: insertErr } = await supabase
      .from("offers")
      .insert({
        product_id,
        status: "draft",
        min_order: 0,
        bulk_cost_per_lb: null,
        bulk_sell_per_lb: null,
        material_cost_per_g: null,
        material_cost_basis: null,
        material_cost_input: null,
        allow_bulk: true,
        allow_copack: true,
      })
      .select(
        "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_per_g, material_cost_basis, material_cost_input, allow_bulk, allow_copack, created_at, updated_at"
      )
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    latestOffer = insertedOffer as OfferRow;
  }

  if (status === "published") {
    const { error: draftOthersErr } = await supabase
      .from("offers")
      .update({ status: "draft" })
      .eq("product_id", product_id)
      .neq("id", latestOffer.id);
    if (draftOthersErr) return NextResponse.json({ error: draftOthersErr.message }, { status: 500 });
  }

  const { data: updatedOffer, error: updateErr } = await supabase
    .from("offers")
    .update({ status })
    .eq("id", latestOffer.id)
    .select(
      "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_per_g, material_cost_basis, material_cost_input, allow_bulk, allow_copack, created_at, updated_at"
    )
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ offer: updatedOffer });
}
