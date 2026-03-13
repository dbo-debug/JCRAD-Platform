import { NextResponse } from "next/server";
import { DEFAULT_MARKUP_PCT, deriveSellPricingFromCost } from "@/lib/pricing-defaults";
import { normalizeMaterialCostPerG } from "@/lib/pricing-normalize";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_CATEGORIES = ["flower", "concentrate", "vape"] as const;
const ALLOWED_STATUS = ["draft", "published"] as const;
const ALLOWED_MATERIAL_COST_BASIS = ["per_lb", "per_g", "per_1000g"] as const;
const LB_TO_G = 453.592;

type ProductInput = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  type?: unknown;
  tier?: unknown;
  description?: unknown;
  inventory_qty?: unknown;
  inventory_unit?: unknown;
};

type OfferInput = {
  status?: unknown;
  min_order?: unknown;
  bulk_cost_per_lb?: unknown;
  bulk_sell_per_lb?: unknown;
  material_cost_basis?: unknown;
  material_cost_input?: unknown;
  allow_bulk?: unknown;
  allow_copack?: unknown;
};

type CatalogItemInput = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  active?: unknown;
};

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  type: string | null;
  tier: string | null;
  description: string | null;
  inventory_qty: number | null;
  inventory_unit: string | null;
  created_at: string;
  updated_at: string;
};

type OfferRow = {
  id: string;
  product_id: string;
  status: string;
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

type CatalogItemRow = {
  id: string;
  product_id: string | null;
  name: string | null;
  category: string | null;
  active: boolean | null;
  created_at: string;
  updated_at: string;
};

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const bodyObj = typeof body === "object" && body != null ? (body as Record<string, unknown>) : {};
  const productInput = ((bodyObj.product as ProductInput | undefined) || {}) as ProductInput;
  const offerInput = ((bodyObj.offer as OfferInput | undefined) || {}) as OfferInput;
  const catalogItemInput = ((bodyObj.catalog_item as CatalogItemInput | undefined) || {}) as CatalogItemInput;

  const productId = asNullableString(productInput?.id);
  const name = String(productInput?.name || "").trim();
  const rawCategory = asNullableString(productInput?.category)?.toLowerCase() || null;
  const category = rawCategory === "pre_roll" || rawCategory === "pre-roll" || rawCategory === "preroll"
    ? "flower"
    : rawCategory;
  const type = asNullableString(productInput?.type)?.toLowerCase() || null;
  const tier = asNullableString(productInput?.tier)?.toLowerCase() || null;
  const description = asNullableString(productInput?.description);
  const inventory_qty = Number(productInput?.inventory_qty ?? 0);
  const inventory_unit = (asNullableString(productInput?.inventory_unit)?.toLowerCase() || "lb") as "lb" | "g";
  const catalogItemId = asNullableString(catalogItemInput?.id);
  const rawCatalogCategory = asNullableString(catalogItemInput?.category)?.toLowerCase() || rawCategory || category;
  const catalogCategory = rawCatalogCategory === "pre-roll" || rawCatalogCategory === "preroll"
    ? "pre_roll"
    : rawCatalogCategory;
  const catalogName = asNullableString(catalogItemInput?.name) || name;
  const catalogActive = asBoolean(catalogItemInput?.active, true);

  const status = (asNullableString(offerInput?.status)?.toLowerCase() || "draft") as "draft" | "published";
  const min_order = Number(offerInput?.min_order ?? 0);
  const bulk_cost_per_lb =
    offerInput?.bulk_cost_per_lb === "" || offerInput?.bulk_cost_per_lb == null
      ? null
      : Number(offerInput?.bulk_cost_per_lb);
  let bulk_sell_per_lb =
    offerInput?.bulk_sell_per_lb === "" || offerInput?.bulk_sell_per_lb == null
      ? null
      : Number(offerInput?.bulk_sell_per_lb);
  const material_cost_basis = asNullableString(offerInput?.material_cost_basis)?.toLowerCase() || null;
  const materialInputProvided = offerInput?.material_cost_input !== "" && offerInput?.material_cost_input != null;
  const material_cost_input = materialInputProvided ? Number(offerInput?.material_cost_input) : null;
  const allow_bulk = asBoolean(offerInput?.allow_bulk, true);
  const allow_copack = asBoolean(offerInput?.allow_copack, true);

  const materialBasisProvided = material_cost_basis != null;
  if (materialBasisProvided !== materialInputProvided) {
    return NextResponse.json(
      { error: "material_cost_basis and material_cost_input must both be provided together" },
      { status: 400 }
    );
  }

  let material_cost_per_g: number | null = null;
  if (materialBasisProvided && material_cost_input != null) {
    if (
      !ALLOWED_MATERIAL_COST_BASIS.includes(material_cost_basis as (typeof ALLOWED_MATERIAL_COST_BASIS)[number])
    ) {
      return NextResponse.json({ error: "material_cost_basis must be per_lb, per_g, or per_1000g" }, { status: 400 });
    }
    if (!Number.isFinite(material_cost_input) || material_cost_input < 0) {
      return NextResponse.json({ error: "material_cost_input must be >= 0" }, { status: 400 });
    }

    material_cost_per_g = normalizeMaterialCostPerG({
      materialCostBasis: material_cost_basis,
      materialCostInput: material_cost_input,
      bulkCostPerLb: null,
      inventoryUnit: inventory_unit,
    });
  }

  if ((material_cost_per_g == null || material_cost_per_g <= 0) && bulk_cost_per_lb != null && bulk_cost_per_lb > 0) {
    material_cost_per_g = normalizeMaterialCostPerG({
      materialCostBasis: null,
      materialCostInput: null,
      bulkCostPerLb: bulk_cost_per_lb,
      inventoryUnit: inventory_unit,
    });
  }

  const inferredCostPerLb = material_cost_per_g != null && material_cost_per_g > 0
    ? material_cost_per_g * LB_TO_G
    : null;
  const sellDefaults = deriveSellPricingFromCost({
    category,
    costPerLb: inferredCostPerLb,
    costPerG: material_cost_per_g,
    explicitSellPerLb: bulk_sell_per_lb,
    markupPct: DEFAULT_MARKUP_PCT,
  });
  const derivedPersistedSell =
    sellDefaults.unit === "per_g" ? sellDefaults.sellPerG : sellDefaults.sellPerLb;
  if ((bulk_sell_per_lb == null || bulk_sell_per_lb <= 0) && derivedPersistedSell != null) {
    bulk_sell_per_lb = derivedPersistedSell;
  }

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!category || !ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
    return NextResponse.json({ error: "category must be flower, concentrate, or vape" }, { status: 400 });
  }
  if (!Number.isFinite(inventory_qty) || inventory_qty < 0) {
    return NextResponse.json({ error: "inventory_qty must be >= 0" }, { status: 400 });
  }
  if (!["lb", "g"].includes(inventory_unit)) {
    return NextResponse.json({ error: "inventory_unit must be lb or g" }, { status: 400 });
  }
  if (!ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: "status must be draft or published" }, { status: 400 });
  }
  if (!Number.isFinite(min_order) || min_order < 0) {
    return NextResponse.json({ error: "min_order must be >= 0" }, { status: 400 });
  }
  if (bulk_sell_per_lb != null && !Number.isFinite(bulk_sell_per_lb)) {
    return NextResponse.json({ error: "bulk_sell_per_lb must be null or a finite number" }, { status: 400 });
  }
  if (bulk_cost_per_lb != null && (!Number.isFinite(bulk_cost_per_lb) || bulk_cost_per_lb < 0)) {
    return NextResponse.json({ error: "bulk_cost_per_lb must be null or >= 0" }, { status: 400 });
  }
  if (typeof allow_bulk !== "boolean" || typeof allow_copack !== "boolean") {
    return NextResponse.json({ error: "allow_bulk and allow_copack must be boolean" }, { status: 400 });
  }
  if (allow_bulk && (bulk_sell_per_lb == null || bulk_sell_per_lb <= 0) && (material_cost_per_g == null || material_cost_per_g <= 0)) {
    return NextResponse.json(
      { error: "Provide cost per unit and/or sell override for bulk pricing." },
      { status: 400 }
    );
  }

  const productPayload = {
    name,
    category,
    type,
    tier: category === "flower" ? tier : null,
    description,
    inventory_qty,
    inventory_unit,
  };

  let savedProduct: ProductRow | null = null;

  if (productId) {
    const { data, error } = await supabase
      .from("products")
      .update(productPayload)
      .eq("id", productId)
      .select("id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedProduct = data as ProductRow;
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert(productPayload)
      .select("id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedProduct = data as ProductRow;
  }

  const offerPayload = {
    product_id: String(savedProduct.id),
    status,
    min_order,
    bulk_cost_per_lb,
    bulk_sell_per_lb,
    material_cost_per_g,
    material_cost_basis,
    material_cost_input,
    allow_bulk,
    allow_copack,
  };

  const { data: existingOffer, error: existingOfferErr } = await supabase
    .from("offers")
    .select("id")
    .eq("product_id", String(savedProduct.id))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingOfferErr) return NextResponse.json({ error: existingOfferErr.message }, { status: 500 });
  const existingOfferId = (existingOffer as { id: string } | null)?.id;

  let savedOffer: OfferRow | null = null;

  if (existingOfferId) {
    const { data, error } = await supabase
      .from("offers")
      .update(offerPayload)
      .eq("id", existingOfferId)
      .select(
        "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_per_g, material_cost_basis, material_cost_input, allow_bulk, allow_copack, created_at, updated_at"
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedOffer = data as OfferRow;
  } else {
    const { data, error } = await supabase
      .from("offers")
      .insert(offerPayload)
      .select(
        "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_per_g, material_cost_basis, material_cost_input, allow_bulk, allow_copack, created_at, updated_at"
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedOffer = data as OfferRow;
  }

  const catalogPayload = {
    product_id: String(savedProduct.id),
    name: catalogName,
    category: catalogCategory || category,
    active: catalogActive,
  };

  let resolvedCatalogItemId = catalogItemId;
  if (!resolvedCatalogItemId) {
    const { data: existingCatalogItem, error: existingCatalogErr } = await supabase
      .from("catalog_items")
      .select("id")
      .eq("product_id", String(savedProduct.id))
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingCatalogErr) return NextResponse.json({ error: existingCatalogErr.message }, { status: 500 });
    resolvedCatalogItemId = (existingCatalogItem as { id?: string } | null)?.id || null;
  }

  let savedCatalogItem: CatalogItemRow | null = null;
  if (resolvedCatalogItemId) {
    const { data, error } = await supabase
      .from("catalog_items")
      .update(catalogPayload)
      .eq("id", resolvedCatalogItemId)
      .select("id, product_id, name, category, active, created_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedCatalogItem = data as CatalogItemRow;
  } else {
    const { data, error } = await supabase
      .from("catalog_items")
      .insert({
        ...catalogPayload,
        sort_order: 0,
      })
      .select("id, product_id, name, category, active, created_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedCatalogItem = data as CatalogItemRow;
  }

  return NextResponse.json({ product: savedProduct, offer: savedOffer, catalog_item: savedCatalogItem });
}
