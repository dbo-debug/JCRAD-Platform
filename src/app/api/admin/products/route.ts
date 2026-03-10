import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

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
  material_cost_basis: string | null;
  material_cost_input: number | null;
  material_cost_per_g: number | null;
  allow_bulk: boolean | null;
  allow_copack: boolean | null;
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  catalog_item_id: string;
  display_name: string | null;
  active: boolean | null;
  code: string | null;
  sort_order: number | null;
  created_at: string | null;
};

type MediaRow = {
  id: string;
  variant_id: string;
  file_url?: string | null;
  display_order?: number | null;
  created_at?: string | null;
  is_public?: boolean | null;
  file_path?: string | null;
  object_path?: string | null;
  bucket?: string | null;
  media_type: string | null;
};

type CatalogItemRow = {
  id: string;
  product_id: string | null;
  name: string | null;
  category: string | null;
  active: boolean | null;
  thumbnail_url?: string | null;
  thumbnail_bucket?: string | null;
  thumbnail_object_path?: string | null;
  created_at: string | null;
  updated_at: string | null;
  products: ProductRow | null;
  variants: VariantRow[] | null;
};

function isMissingTableOrRelationError(error: unknown, tableOrRelation: string): boolean {
  const message = String((error as any)?.message || "").toLowerCase();
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("could not find a relationship") && message.includes(tableOrRelation.toLowerCase())) ||
    (message.includes("table") && message.includes(tableOrRelation.toLowerCase()))
  );
}

function normalizeCategory(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "pre-roll" || value === "preroll") return "pre_roll";
  return value;
}

async function loadVariantMediaRows(args: {
  supabase: ReturnType<typeof createAdminClient>;
  variantIds: string[];
}): Promise<MediaRow[]> {
  const { supabase, variantIds } = args;
  if (variantIds.length === 0) return [];

  const attempts = [
    "id, variant_id, media_type, file_url, display_order, is_public, created_at, bucket, object_path",
    "id, variant_id, media_type, file_url, display_order, created_at, bucket, object_path",
    "id, variant_id, media_type, file_url, created_at, bucket, object_path",
    "id, variant_id, media_type, object_path, bucket, created_at, sort_order",
    "id, variant_id, media_type, object_path, bucket, sort_order",
  ];

  for (const selectCols of attempts) {
    const res = await supabase.from("variant_media").select(selectCols).in("variant_id", variantIds);
    if (!res.error) return (res.data ?? []) as MediaRow[];

    if (isMissingTableOrRelationError(res.error, "variant_media")) {
      return [];
    }
  }

  return [];
}

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const activeParam = (searchParams.get("active") || "").trim().toLowerCase();
  const activeFilter = activeParam === "true" ? true : activeParam === "false" ? false : undefined;

  const catalogItemSelectAttempts = [
    "id, product_id, name, category, active, thumbnail_url, thumbnail_bucket, thumbnail_object_path, created_at, updated_at, products:product_id(id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at), variants:catalog_variants(id, catalog_item_id, display_name, active, code, sort_order, created_at)",
    "id, product_id, name, category, active, thumbnail_url, created_at, updated_at, products:product_id(id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at), variants:catalog_variants(id, catalog_item_id, display_name, active, code, sort_order, created_at)",
    "id, product_id, name, category, active, created_at, updated_at, products:product_id(id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at), variants:catalog_variants(id, catalog_item_id, display_name, active, code, sort_order, created_at)",
  ];

  let data: CatalogItemRow[] | null = null;
  let lastError: any = null;
  for (const selectCols of catalogItemSelectAttempts) {
    let query = supabase.from("catalog_items").select(selectCols);
    if (q) query = query.ilike("name", `%${q}%`);
    if (typeof activeFilter === "boolean") query = query.eq("active", activeFilter);
    query = query.order("created_at", { ascending: false });
    const result = await query;
    if (!result.error) {
      data = (result.data ?? []) as CatalogItemRow[];
      lastError = null;
      break;
    }
    lastError = result.error;
  }
  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 });
  }

  const items = (data ?? []) as CatalogItemRow[];
  const productIds = Array.from(
    new Set(items.map((item) => String(item.product_id || "")).filter(Boolean))
  );

  const offerByProductId = new Map<string, OfferRow>();
  if (productIds.length > 0) {
    const { data: offers, error: offersErr } = await supabase
      .from("offers")
      .select(
        "id, product_id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, material_cost_basis, material_cost_input, material_cost_per_g, allow_bulk, allow_copack, created_at, updated_at"
      )
      .in("product_id", productIds)
      .order("created_at", { ascending: true });
    if (offersErr) return NextResponse.json({ error: offersErr.message }, { status: 500 });

    for (const offer of (offers || []) as OfferRow[]) {
      const key = String(offer.product_id || "");
      if (!key || offerByProductId.has(key)) continue;
      offerByProductId.set(key, offer);
    }
  }

  const allVariants = items.flatMap((item) => item.variants ?? []);
  const variantIds = Array.from(new Set(allVariants.map((v) => String(v.id || "")).filter(Boolean)));
  const mediaRows = await loadVariantMediaRows({ supabase, variantIds });

  const mediaByVariantId = new Map<string, MediaRow[]>();
  for (const media of mediaRows) {
    const variantId = String(media.variant_id || "");
    if (!variantId) continue;
    const list = mediaByVariantId.get(variantId) || [];
    list.push(media);
    mediaByVariantId.set(variantId, list);
  }

  function mediaSortValue(media: MediaRow): { displayOrder: number; createdAtMs: number } {
    const displayOrderRaw = Number(media.display_order);
    const fallbackSortOrderRaw = Number((media as any).sort_order);
    const displayOrder = Number.isFinite(displayOrderRaw)
      ? displayOrderRaw
      : Number.isFinite(fallbackSortOrderRaw)
        ? fallbackSortOrderRaw
        : Number.MAX_SAFE_INTEGER;
    const createdAtMs = Date.parse(String(media.created_at || "")) || Number.MAX_SAFE_INTEGER;
    return { displayOrder, createdAtMs };
  }

  function mediaUrl(media: MediaRow): string | null {
    const direct = String(media.file_url || media.file_path || "").trim();
    if (direct) return direct;
    const objectPath = String(media.object_path || "").trim();
    if (!objectPath) return null;
    const bucket = String(media.bucket || "catalog-public");
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return pub?.publicUrl || null;
  }

  function thumbnailForItem(item: CatalogItemRow): string {
    const directThumbnail = String(item.thumbnail_url || "").trim();
    if (directThumbnail) return directThumbnail;

    const relatedVariants = item.variants ?? [];
    const relatedMedia = relatedVariants.flatMap((variant) => mediaByVariantId.get(String(variant.id || "")) || []);
    const imageMedia = relatedMedia
      .filter((m) => {
        const mediaType = String(m.media_type || "").toLowerCase();
        return mediaType === "thumbnail" || mediaType === "image";
      })
      .sort((a, b) => {
        const aSort = mediaSortValue(a);
        const bSort = mediaSortValue(b);
        if (aSort.displayOrder !== bSort.displayOrder) return aSort.displayOrder - bSort.displayOrder;
        return aSort.createdAtMs - bSort.createdAtMs;
      });

    const chosen = imageMedia[0];
    if (!chosen) return "/brand/PRIMARY.png";
    return mediaUrl(chosen) || "/brand/PRIMARY.png";
  }

  return NextResponse.json({
    products: items.map((item) => {
      const linkedProduct = item.products;
      const productId = String(item.product_id || "");
      const offer = productId ? offerByProductId.get(productId) || null : null;
      return {
        id: item.id,
        product_id: productId || null,
        name: item.name || linkedProduct?.name || null,
        category: normalizeCategory(item.category || linkedProduct?.category || null),
        active: item.active,
        is_active: item.active,
        status: item.active ? "active" : "inactive",
        created_at: item.created_at,
        updated_at: item.updated_at,
        type: linkedProduct?.type ?? null,
        tier: linkedProduct?.tier ?? null,
        description: linkedProduct?.description ?? null,
        inventory_qty: linkedProduct?.inventory_qty ?? null,
        inventory_unit: linkedProduct?.inventory_unit ?? null,
        variants: (item.variants ?? []).map((variant) => ({
          ...variant,
          media: (mediaByVariantId.get(String(variant.id || "")) || []).map((media) => ({
            id: media.id,
            media_type: media.media_type,
            file_url: media.file_url || media.file_path || mediaUrl(media),
            display_order:
              Number.isFinite(Number(media.display_order))
                ? Number(media.display_order)
                : Number.isFinite(Number((media as any).sort_order))
                  ? Number((media as any).sort_order)
                  : null,
            is_public: typeof media.is_public === "boolean" ? media.is_public : null,
          })),
        })),
        bulk_cost_per_lb: offer?.bulk_cost_per_lb ?? null,
        bulk_sell_per_lb: offer?.bulk_sell_per_lb ?? null,
        material_cost_per_g: offer?.material_cost_per_g ?? null,
        offer,
        thumbnail_url: thumbnailForItem(item),
      };
    }),
  });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const id = body?.id ? String(body.id) : null;
  const name = String(body?.name || "").trim();
  const category = body?.category ? String(body.category).toLowerCase() : null;
  const type = body?.type ? String(body.type).toLowerCase() : null;
  const tier = body?.tier ? String(body.tier).toLowerCase() : null;
  const description = body?.description ? String(body.description) : null;
  const inventory_qty = Number(body?.inventory_qty || 0);
  const inventory_unit = body?.inventory_unit ? String(body.inventory_unit).toLowerCase() : "lb";

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  if (!category || !["flower", "concentrate", "vape"].includes(category)) {
    return NextResponse.json({ error: "category must be flower, concentrate, or vape" }, { status: 400 });
  }
  if (!Number.isFinite(inventory_qty) || inventory_qty < 0) {
    return NextResponse.json({ error: "inventory_qty must be >= 0" }, { status: 400 });
  }
  if (!["lb", "g"].includes(inventory_unit)) {
    return NextResponse.json({ error: "inventory_unit must be lb or g" }, { status: 400 });
  }

  const payload = { name, category, type, tier, description, inventory_qty, inventory_unit };

  if (id) {
    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select("id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data });
  }

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id, name, category, type, tier, description, inventory_qty, inventory_unit, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}
