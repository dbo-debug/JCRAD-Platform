import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type OfferWithProduct = {
  id: string;
  product_id: string;
  status: string | null;
  min_order: number | null;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number | null;
  allow_bulk: boolean | null;
  allow_copack: boolean | null;
  created_at: string;
  updated_at: string;
  products: {
    id: string;
    name: string | null;
    category: string | null;
    type: string | null;
    tier: string | null;
    inventory_qty: number | null;
    inventory_unit: string | null;
  } | null;
};

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);

  const status = (searchParams.get("status") || "").trim() || undefined;
  const category = (searchParams.get("category") || "").trim() || undefined;
  const type = (searchParams.get("type") || "").trim() || undefined;
  const tier = (searchParams.get("tier") || "").trim() || undefined;
  const product_id = (searchParams.get("product_id") || "").trim() || undefined;
  const qRaw = (searchParams.get("q") || "").trim();
  const q = qRaw ? qRaw.toLowerCase() : undefined;

  let query = supabase
    .from("offers")
    .select(
      "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, allow_bulk, allow_copack, created_at, updated_at, products:product_id(id, name, category, type, tier, inventory_qty, inventory_unit)"
    )
    .order("created_at", { ascending: false });

  // Only apply status at DB level (simple + fast)
  if (status) query = query.eq("status", status);
  if (product_id) query = query.eq("product_id", product_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const offers = ((data ?? []) as OfferWithProduct[]).filter((row) => {
    const productName = String(row?.products?.name || "").toLowerCase();
    const productCategory = String(row?.products?.category || "");
    const productType = String(row?.products?.type || "");
    const productTier = String(row?.products?.tier || "");

    if (q && !productName.includes(q)) return false;
    if (category && productCategory !== category) return false;
    if (type && productType !== type) return false;
    if (tier && productTier !== tier) return false;

    return true;
  });

  return NextResponse.json({ offers });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const id = body?.id ? String(body.id) : null;

  const product_id = body?.product_id ? String(body.product_id) : null;
  const status = body?.status ? String(body.status).toLowerCase() : "draft";
  const min_order = Number(body?.min_order || 0);

  const bulk_cost_per_lb =
    body?.bulk_cost_per_lb === "" || body?.bulk_cost_per_lb == null
      ? null
      : Number(body.bulk_cost_per_lb);

  const bulk_sell_per_lb = Number(body?.bulk_sell_per_lb || 0);
  const allow_bulk = !!body?.allow_bulk;
  const allow_copack = !!body?.allow_copack;

  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  if (!["draft", "published"].includes(status)) {
    return NextResponse.json({ error: "status must be draft or published" }, { status: 400 });
  }
  if (!Number.isFinite(min_order) || min_order < 0) {
    return NextResponse.json({ error: "min_order must be >= 0" }, { status: 400 });
  }
  if (body?.bulk_cost_per_lb !== "" && body?.bulk_cost_per_lb != null) {
    const cost = Number(body.bulk_cost_per_lb);
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "bulk_cost_per_lb must be null or >= 0" }, { status: 400 });
    }
  }
  if (!bulk_sell_per_lb || bulk_sell_per_lb <= 0) {
    return NextResponse.json({ error: "bulk_sell_per_lb must be > 0" }, { status: 400 });
  }

  const payload = {
    product_id,
    status,
    min_order,
    bulk_cost_per_lb,
    bulk_sell_per_lb,
    allow_bulk,
    allow_copack,
  };

  if (id) {
    const { data, error } = await supabase
      .from("offers")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ offer: data });
  }

  const { data, error } = await supabase
    .from("offers")
    .insert(payload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer: data });
}
