import { NextResponse } from "next/server";
import { DEFAULT_MARKUP_PCT, deriveSellPricingFromCost } from "@/lib/pricing-defaults";
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

  let bulk_sell_per_lb =
    body?.bulk_sell_per_lb === "" || body?.bulk_sell_per_lb == null
      ? null
      : Number(body?.bulk_sell_per_lb);
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
  if (bulk_sell_per_lb != null && !Number.isFinite(bulk_sell_per_lb)) {
    return NextResponse.json({ error: "bulk_sell_per_lb must be null or a finite number" }, { status: 400 });
  }

  const { data: productRow, error: productErr } = await supabase
    .from("products")
    .select("category")
    .eq("id", product_id)
    .maybeSingle();
  if (productErr) return NextResponse.json({ error: productErr.message }, { status: 500 });

  const sellDefaults = deriveSellPricingFromCost({
    category: (productRow as { category?: string | null } | null)?.category || null,
    costPerLb: bulk_cost_per_lb,
    costPerG: bulk_cost_per_lb,
    explicitSellPerLb: bulk_sell_per_lb,
    markupPct: DEFAULT_MARKUP_PCT,
  });
  const derivedPersistedSell =
    sellDefaults.unit === "per_g" ? sellDefaults.sellPerG : sellDefaults.sellPerLb;
  if ((bulk_sell_per_lb == null || bulk_sell_per_lb <= 0) && derivedPersistedSell != null) {
    bulk_sell_per_lb = derivedPersistedSell;
  }

  if (bulk_sell_per_lb == null || bulk_sell_per_lb <= 0) {
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
