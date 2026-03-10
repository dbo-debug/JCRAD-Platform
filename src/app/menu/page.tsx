import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { INFUSION_ELIGIBILITY, LIQUID_INFUSION_MEDIA } from "@/lib/infusion-config";
import Header from "@/components/layout/Header";
import MenuClient from "./menu-client";

type OfferRow = {
  id: string;
  product_id: string | null;
  status: string;
  created_at?: string | null;
  min_order: number;
  bulk_sell_per_lb: number | null;
  allow_bulk: boolean;
  allow_copack: boolean;
};

type CatalogItemRow = {
  id: string;
  product_id: string | null;
  name: string | null;
  category: string | null;
  active: boolean | null;
  thumbnail_url?: string | null;
  video_url?: string | null;
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

type YieldSettings = {
  flowerYieldPct: number;
  concentrateYieldPct: number;
  prerollYieldPct: number;
  vapeFillYieldPct: number;
};

type InfusionSettings = {
  internalGPerLb: number;
  externalDistillatePer1g: number;
  externalKiefPer1g: number;
};

type InfusionProductOption = {
  id: string;
  name: string;
  category: "concentrate" | "vape";
};

function parseYieldPct(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const raw = Number(obj.pct);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

function parseNumberSetting(valueJson: unknown, fallback: number): number {
  const obj = (valueJson && typeof valueJson === "object" ? valueJson : {}) as Record<string, unknown>;
  const candidates = [obj.value, obj.usd, obj.g_per_lb, obj.g_per_unit_1g, obj.grams, obj.number];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isPathUrl(value: string): boolean {
  return value.startsWith("/");
}

function looksLikeBucketPath(value: string): boolean {
  const idx = value.indexOf(":");
  if (idx <= 0) return false;
  const left = value.slice(0, idx).trim();
  const right = value.slice(idx + 1).trim();
  return !!left && !!right && !left.includes("/");
}

function resolveStoragePublicUrl(supabase: ReturnType<typeof createAdminClient>, bucket: string, path: string): string | null {
  const cleanBucket = String(bucket || "").trim();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) return null;
  const { data } = supabase.storage.from(cleanBucket).getPublicUrl(cleanPath);
  return String(data?.publicUrl || "").trim() || null;
}

function resolveMaybeStorageUrl(
  supabase: ReturnType<typeof createAdminClient>,
  raw: string | null | undefined,
  defaultBucket: string
): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (isHttpUrl(value) || isPathUrl(value)) return value;

  if (looksLikeBucketPath(value)) {
    const [bucketRaw, ...rest] = value.split(":");
    const bucket = String(bucketRaw || "").trim();
    const path = rest.join(":").trim();
    return resolveStoragePublicUrl(supabase, bucket, path);
  }

  return resolveStoragePublicUrl(supabase, defaultBucket, value);
}

function includesToken(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export default async function MenuPage() {
  const supabase = createAdminClient();
  let isAdmin = false;
  let isAuthenticated = false;

  try {
    const authClient = await createClient();
    const { data: auth } = await authClient.auth.getUser();
    const userId = String(auth?.user?.id || "");
    if (userId) {
      isAuthenticated = true;
      const { data: profile } = await authClient
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = String((profile as any)?.role || "").toLowerCase() === "admin";
    }
  } catch {
    isAdmin = false;
  }

  const { data: catalogRowsData, error: catalogErr } = await supabase
    .from("catalog_items")
    .select(
      "id, product_id, name, category, active, thumbnail_url, video_url, products:product_id(id, name, category, type, tier, inventory_qty, inventory_unit)"
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (catalogErr) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Menu</h1>
        <p style={{ color: "#a00" }}>Failed to load menu items: {catalogErr.message}</p>
      </div>
    );
  }

  const catalogRows = (catalogRowsData || []) as unknown as CatalogItemRow[];
  const productIds = Array.from(new Set(catalogRows.map((row) => String(row.product_id || "")).filter(Boolean)));
  const catalogRowsMissingProductId = catalogRows.filter((row) => !String(row.product_id || "").trim()).length;
  const activeCatalogItems = catalogRows.length;
  const activeCatalogWithProductId = Math.max(0, activeCatalogItems - catalogRowsMissingProductId);

  let offerByProductId = new Map<string, OfferRow>();
  let activeCatalogNoOfferCount = 0;
  let publishedByProductId = new Map<string, OfferRow>();
  let draftByProductId = new Map<string, OfferRow>();
  let offersByStatus = { published: 0, draft: 0 };
  let categoryBreakdown: Record<string, { activeRows: number; withPublishedOffer: number; withDraftOffer: number; missingOffer: number }> = {};
  let shouldShowDraftHeavyWarning = false;
  const { data: yieldRows } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", [
      "flower_yield_pct",
      "concentrate_yield_pct",
      "preroll_yield_pct",
      "vape_fill_yield_pct",
      "internal_infusion_g_per_lb",
      "external_infusion_distillate_g_per_unit_1g",
      "external_infusion_kief_g_per_unit_1g",
    ]);
  const yieldsByKey = new Map<string, unknown>();
  for (const row of (yieldRows || []) as Array<{ key: string | null; value_json: unknown }>) {
    yieldsByKey.set(String(row.key || ""), row.value_json);
  }
  const initialYields: YieldSettings = {
    flowerYieldPct: parseYieldPct(yieldsByKey.get("flower_yield_pct"), 0.92),
    concentrateYieldPct: parseYieldPct(yieldsByKey.get("concentrate_yield_pct"), 0.95),
    prerollYieldPct: parseYieldPct(yieldsByKey.get("preroll_yield_pct"), 0.92),
    vapeFillYieldPct: parseYieldPct(yieldsByKey.get("vape_fill_yield_pct"), 0.97),
  };
  const initialInfusionSettings: InfusionSettings = {
    internalGPerLb: parseNumberSetting(yieldsByKey.get("internal_infusion_g_per_lb"), 80),
    externalDistillatePer1g: parseNumberSetting(yieldsByKey.get("external_infusion_distillate_g_per_unit_1g"), 0.1),
    externalKiefPer1g: parseNumberSetting(yieldsByKey.get("external_infusion_kief_g_per_unit_1g"), 0.15),
  };
  const { data: infusionProductsRows } = await supabase
    .from("products")
    .select("id, name, category")
    .in("category", ["concentrate", "vape"]);
  const infusionProducts = ((infusionProductsRows || []) as Array<{ id: string; name: string | null; category: string | null }>)
    .map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || "").trim(),
      category: String(row.category || "").toLowerCase() as "concentrate" | "vape",
    }))
    .filter((row) => row.id && row.name && (row.category === "concentrate" || row.category === "vape"));
  const internalEligibleNames = Object.entries(INFUSION_ELIGIBILITY)
    .filter(([, flags]) => flags.internal)
    .map(([name]) => name);
  const externalDryNames = Object.entries(INFUSION_ELIGIBILITY)
    .filter(([, flags]) => flags.external)
    .map(([name]) => name);
  const internalInfusionProducts: InfusionProductOption[] = infusionProducts
    .filter((row) => row.category === "concentrate")
    .filter((row) => internalEligibleNames.some((name) => includesToken(row.name, name)));
  const externalDryProducts: InfusionProductOption[] = infusionProducts
    .filter((row) => row.category === "concentrate")
    .filter((row) => externalDryNames.some((name) => includesToken(row.name, name)));
  const externalLiquidProducts: InfusionProductOption[] = infusionProducts
    .filter((row) => row.category === "vape")
    .filter((row) => LIQUID_INFUSION_MEDIA.some((name) => includesToken(row.name, name)));

  if (productIds.length > 0) {
    const { data: offersData, error: offersErr } = await supabase
      .from("offers")
      .select("id, product_id, status, created_at, min_order, bulk_sell_per_lb, allow_bulk, allow_copack")
      .in("product_id", productIds)
      .in("status", ["published", "draft"])
      .order("created_at", { ascending: false });

    if (offersErr) {
      return (
        <div style={{ padding: 24 }}>
          <h1>Menu</h1>
          <p style={{ color: "#a00" }}>Failed to load offers: {offersErr.message}</p>
        </div>
      );
    }

    for (const offer of (offersData || []) as OfferRow[]) {
      const key = String(offer.product_id || "").trim();
      if (!key) continue;
      const status = String(offer.status || "").toLowerCase();
      if (status === "published") {
        offersByStatus.published += 1;
        if (!publishedByProductId.has(key)) publishedByProductId.set(key, offer);
        continue;
      }
      if (status === "draft") {
        offersByStatus.draft += 1;
        if (!draftByProductId.has(key)) draftByProductId.set(key, offer);
      }
    }

    for (const productId of productIds) {
      const published = publishedByProductId.get(productId);
      if (published) {
        offerByProductId.set(productId, published);
        continue;
      }
      if (isAdmin) {
        const draft = draftByProductId.get(productId);
        if (draft) offerByProductId.set(productId, draft);
      }
    }
  }

  const offers = catalogRows
    .map((item) => {
      const productId = String(item.product_id || "");
      if (!productId) return null;
      const offer = offerByProductId.get(productId);
      if (!offer) return null;
      return {
        ...offer,
        catalog_name: item.name,
        catalog_category: item.category,
        products: item.products,
      };
    })
    .filter(Boolean);

  let mediaByProduct: Record<string, string> = {};
  if (productIds.length > 0) {
    const mediaSelect =
      "variant_id, media_type, bucket, object_path, approved, visibility, is_featured, sort_order, created_at";
    const mediaFallbackSelect = "variant_id, bucket, object_path, approved, visibility, created_at";

    let mediaRows: any[] = [];
    let hasMediaType = true;
    let hasFeaturedSort = true;

    const primaryMediaResponse = await supabase
      .from("variant_media")
      .select(mediaSelect)
      .in("variant_id", productIds)
      .eq("approved", true)
      .eq("visibility", "public");

    if (primaryMediaResponse.error) {
      hasMediaType = false;
      hasFeaturedSort = false;
      const fallbackMediaResponse = await supabase
        .from("variant_media")
        .select(mediaFallbackSelect)
        .in("variant_id", productIds)
        .eq("approved", true)
        .eq("visibility", "public");
      if (fallbackMediaResponse.error) {
        mediaRows = [];
      } else {
        mediaRows = (fallbackMediaResponse.data || []) as any[];
      }
    } else {
      mediaRows = (primaryMediaResponse.data || []) as any[];
    }

    const filteredRows = mediaRows.filter((row) => {
      if (!hasMediaType) return true;
      const mediaType = String((row as any).media_type || "").toLowerCase();
      return !mediaType || mediaType === "image" || mediaType === "thumbnail";
    });

    const sortedRows = [...filteredRows].sort((a, b) => {
      const aFeatured = hasFeaturedSort && Boolean((a as any).is_featured) ? 1 : 0;
      const bFeatured = hasFeaturedSort && Boolean((b as any).is_featured) ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;

      const aSort = Number((a as any).sort_order);
      const bSort = Number((b as any).sort_order);
      const aSortSafe = Number.isFinite(aSort) ? aSort : Number.MAX_SAFE_INTEGER;
      const bSortSafe = Number.isFinite(bSort) ? bSort : Number.MAX_SAFE_INTEGER;
      if (aSortSafe !== bSortSafe) return aSortSafe - bSortSafe;

      const aCreated = Date.parse(String((a as any).created_at || "")) || 0;
      const bCreated = Date.parse(String((b as any).created_at || "")) || 0;
      return bCreated - aCreated;
    });

    const firstByVariant = new Map<string, string>();

    for (const row of sortedRows) {
      const variantId = String((row as any).variant_id || "");
      if (!variantId || firstByVariant.has(variantId)) continue;
      const bucket = String((row as any).bucket || "catalog-public");
      const objectPath = String((row as any).object_path || "");
      if (!objectPath) continue;
      const publicUrl = resolveStoragePublicUrl(supabase, bucket, objectPath);
      if (!publicUrl) continue;
      firstByVariant.set(variantId, publicUrl);
    }

    mediaByProduct = Object.fromEntries(firstByVariant.entries());
  }

  const catalogItemByProductId = new Map<string, CatalogItemRow>();
  for (const row of catalogRows) {
    const productId = String(row.product_id || "");
    if (!productId || catalogItemByProductId.has(productId)) continue;
    catalogItemByProductId.set(productId, row);
  }

  const categoryStats = new Map<
    string,
    { activeRows: number; withPublishedOffer: number; withDraftOffer: number; missingOffer: number }
  >();
  for (const row of catalogRows) {
    const category = String(row.category || row.products?.category || "uncategorized")
      .trim()
      .toLowerCase() || "uncategorized";
    const stat = categoryStats.get(category) || {
      activeRows: 0,
      withPublishedOffer: 0,
      withDraftOffer: 0,
      missingOffer: 0,
    };
    stat.activeRows += 1;
    const productId = String(row.product_id || "").trim();
    if (!productId) {
      stat.missingOffer += 1;
    } else if (publishedByProductId.has(productId)) {
      stat.withPublishedOffer += 1;
    } else if (draftByProductId.has(productId)) {
      stat.withDraftOffer += 1;
    } else {
      stat.missingOffer += 1;
    }
    categoryStats.set(category, stat);
  }
  categoryBreakdown = Object.fromEntries(categoryStats.entries());

  activeCatalogNoOfferCount = catalogRows.reduce((count, row) => {
    const productId = String(row.product_id || "").trim();
    if (!productId) return count + 1;
    if (publishedByProductId.has(productId) || draftByProductId.has(productId)) return count;
    return count + 1;
  }, 0);

  const draftOnlyRows = catalogRows.reduce((count, row) => {
    const productId = String(row.product_id || "").trim();
    if (!productId) return count;
    if (!publishedByProductId.has(productId) && draftByProductId.has(productId)) return count + 1;
    return count;
  }, 0);
  shouldShowDraftHeavyWarning =
    activeCatalogWithProductId > 0 && draftOnlyRows >= Math.max(3, Math.ceil(activeCatalogWithProductId * 0.5));

  if (process.env.NODE_ENV !== "production") {
    console.log("[menu:dev-summary]", {
      activeCatalogItems,
      activeCatalogNoOffer: activeCatalogNoOfferCount,
      offersByStatus,
      categoryBreakdown,
    });
    const missingProductIds = productIds.filter((id) => !publishedByProductId.has(id) && !draftByProductId.has(id));
    const missingLarge = missingProductIds.length > 5 || missingProductIds.length > Math.floor(productIds.length * 0.25);
    if (missingLarge) {
      console.log("[menu:missing-product-ids]", {
        missingCount: missingProductIds.length,
        sample: missingProductIds.slice(0, 15),
      });
    }
  }

  return (
    <>
      <Header isAuthenticated={isAuthenticated} dashboardHref={isAdmin ? "/admin" : "/dashboard"} />
      {process.env.NODE_ENV !== "production" && shouldShowDraftHeavyWarning ? (
        <div
          style={{
            margin: "12px 16px 0",
            border: "1px solid #f5d489",
            background: "#fff8e8",
            color: "#6a4b00",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Most catalog items are draft-only. Publish offers or enable Show Draft Offers as admin.
        </div>
      ) : null}
      <MenuClient
        canShowDraft={isAdmin}
        initialYields={initialYields}
        initialInfusionSettings={initialInfusionSettings}
        internalInfusionProducts={internalInfusionProducts}
        externalLiquidProducts={externalLiquidProducts}
        externalDryProducts={externalDryProducts}
        initialOffers={offers.map((o: any, index: number) => {
          const productId = String(o.product_id || o.products?.id || "");
          const catalogItem = catalogItemByProductId.get(productId);
          const thumbnailRaw = String(catalogItem?.thumbnail_url || "").trim() || null;
          const thumbnailResolved = resolveMaybeStorageUrl(supabase, thumbnailRaw, "catalog-public");
          const mediaFallback = mediaByProduct[productId] || null;
          const imageUrl = thumbnailResolved || mediaFallback || "/brand/BLACK.png";
          const videoRaw = String(catalogItem?.video_url || "").trim() || null;
          const videoResolved = resolveMaybeStorageUrl(supabase, videoRaw, "catalog-public");

          if (process.env.NODE_ENV !== "production" && index < 10) {
            console.log("[menu:image-map]", {
              productId,
              thumbnail_raw: thumbnailRaw,
              thumbnail_resolved: thumbnailResolved,
              media_fallback: mediaFallback,
              final_image_url: imageUrl,
              video_raw: videoRaw,
              video_resolved: videoResolved,
            });
          }
          return {
            ...o,
            image_url: imageUrl,
            video_url: videoResolved,
          };
        })}
      />
    </>
  );
}

/*
Media rows (newest first):
select variant_id, bucket, object_path, media_type, approved, visibility, created_at
from variant_media
order by created_at desc
limit 50;

Offer status audit for active catalog rows:
select ci.product_id, ci.name, ci.category, o.status
from catalog_items ci left join offers o on o.product_id=ci.product_id
where ci.active=true;
*/
