import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import PatternAccent from "@/components/marketing/PatternAccent";
import WholesaleMenuToolkit from "@/components/marketing/WholesaleMenuToolkit";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Wholesale Distribution",
  description:
    "Copy-friendly wholesale category breakdowns from JC RAD Inc. for flower, pre-rolls, concentrates, and vapes, plus quick menu request capture.",
};

type CatalogItemRow = {
  id: string;
  product_id: string | null;
  name: string | null;
  category: string | null;
  active: boolean | null;
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

type OfferRow = {
  id: string;
  product_id: string | null;
  status: string | null;
  created_at: string | null;
  bulk_sell_per_lb: number | null;
};

type WholesaleMenuItem = {
  category: string;
  subcategory: string;
  name: string;
  qty: string;
  price: string;
};

function normalizeCategory(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pre-roll" || raw === "preroll") return "pre_roll";
  if (raw === "flower" || raw === "concentrate" || raw === "vape" || raw === "pre_roll") return raw;
  return "";
}

function titleCategory(value: string): string {
  if (value === "pre_roll") return "Pre-roll";
  if (value === "flower") return "Flower";
  if (value === "concentrate") return "Concentrate";
  if (value === "vape") return "Vape";
  return "General";
}

function normalizeWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatQty(value: number | null, unit: string | null): string {
  const qty = Number(value ?? NaN);
  if (!Number.isFinite(qty) || qty <= 0) return "N/A";
  const normalizedUnit = normalizeWhitespace(unit || "unit").toLowerCase();
  const unitLabel = normalizedUnit === "lb" ? "lbs" : normalizedUnit;
  const qtyFormatted = Math.abs(qty - Math.round(qty)) < 1e-9
    ? Math.round(qty).toLocaleString()
    : qty.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${qtyFormatted}${unitLabel}`;
}

function formatPrice(value: number | null, inventoryUnit: string | null): string {
  const price = Number(value ?? NaN);
  if (!Number.isFinite(price) || price <= 0) return "N/A";
  const unit = normalizeWhitespace(inventoryUnit || "lb").toLowerCase();
  const amount = price >= 100
    ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : price >= 10
      ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${amount}/${unit}`;
}

function inferSubcategory(args: {
  category: string;
  type: string;
  tier: string;
  name: string;
}): string {
  const { category, type, tier, name } = args;
  const typeUpper = type.toUpperCase();
  const tierUpper = tier.toUpperCase();
  const nameUpper = name.toUpperCase();

  if (category === "flower") {
    const cultivation = ["INDOOR", "LIGHT ASSIST", "FULL TERM"].find((token) => nameUpper.includes(token));
    const grade = ["PREMIUM", "MEDIUMS", "SMALLS", "SHAKE", "TRIM"].find((token) => nameUpper.includes(token));
    if (cultivation && grade) return `${cultivation} ${grade}`;
    if (cultivation) return cultivation;
    if (grade) return grade;
    if (typeUpper && tierUpper) return `${typeUpper} ${tierUpper}`;
    if (typeUpper) return typeUpper;
    if (tierUpper) return tierUpper;
    return "FLOWER";
  }

  if (category === "concentrate") {
    const token = [
      "ROSIN",
      "DIAMOND",
      "SUGAR",
      "BADDER",
      "SHATTER",
      "THCA",
      "KIEF",
      "BUBBLE HASH",
    ].find((entry) => nameUpper.includes(entry) || typeUpper.includes(entry));
    if (token) return token;
    if (typeUpper) return typeUpper;
    if (tierUpper) return tierUpper;
    return "CONCENTRATE";
  }

  if (category === "vape") {
    if (nameUpper.includes("LIVE ROSIN") || typeUpper.includes("LIVE ROSIN")) return "LIVE ROSIN";
    if (nameUpper.includes("LIVE RESIN") || typeUpper.includes("LIVE RESIN")) return "LIVE RESIN";
    if (nameUpper.includes("DISTILLATE") || typeUpper.includes("DISTILLATE")) return "DISTILLATE";
    if (typeUpper) return typeUpper;
    if (tierUpper) return tierUpper;
    return "VAPE";
  }

  if (category === "pre_roll") {
    if (typeUpper) return typeUpper;
    if (tierUpper) return tierUpper;
    return "PRE-ROLL";
  }

  return "GENERAL";
}

export default async function WholesalePage() {
  const supabase = createAdminClient();
  const { data: catalogRowsData } = await supabase
    .from("catalog_items")
    .select(
      "id, product_id, name, category, active, products:product_id(id, name, category, type, tier, inventory_qty, inventory_unit)"
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const catalogRows = (catalogRowsData || []) as CatalogItemRow[];
  const productIds = Array.from(new Set(catalogRows.map((row) => String(row.product_id || "")).filter(Boolean)));

  let latestOfferByProductId = new Map<string, OfferRow>();
  if (productIds.length > 0) {
    const { data: offersData } = await supabase
      .from("offers")
      .select("id, product_id, status, created_at, bulk_sell_per_lb")
      .in("product_id", productIds)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    for (const offer of (offersData || []) as OfferRow[]) {
      const key = String(offer.product_id || "");
      if (!key || latestOfferByProductId.has(key)) continue;
      latestOfferByProductId.set(key, offer);
    }
  }

  const wholesaleItems: WholesaleMenuItem[] = catalogRows
    .map((row) => {
      const productId = String(row.product_id || "").trim();
      if (!productId) return null;
      const offer = latestOfferByProductId.get(productId);
      if (!offer) return null;

      const categoryRaw = normalizeCategory(row.category || row.products?.category);
      if (!categoryRaw) return null;

      const name = normalizeWhitespace(row.name || row.products?.name || "");
      if (!name) return null;

      const type = normalizeWhitespace(row.products?.type || "");
      const tier = normalizeWhitespace(row.products?.tier || "");
      const qty = formatQty(row.products?.inventory_qty ?? null, row.products?.inventory_unit ?? null);
      const price = formatPrice(offer.bulk_sell_per_lb ?? null, row.products?.inventory_unit ?? null);
      const subcategory = inferSubcategory({ category: categoryRaw, type, tier, name });

      return {
        category: titleCategory(categoryRaw),
        subcategory,
        name,
        qty,
        price,
      };
    })
    .filter(Boolean) as WholesaleMenuItem[];

  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Wholesale Menu"
        title="Wholesale categories built for quick buying decisions."
        description="Review a clean category breakdown, copy shareable menu text, or request the menu by text."
        backgroundImage="/site-pics/wholsale.jpg"
      />

      <PatternAccent />

      <WholesaleMenuToolkit items={wholesaleItems} />

      <section className="rounded-3xl border border-[#cde5e8] bg-[linear-gradient(180deg,#effaf9_0%,#e8f7fb_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#123646]">Ready to share the wholesale menu?</h2>
            <p className="mt-2 text-sm text-[#446172]">
              Use live menu access for current availability, then create an account when you're ready to build estimates.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/menu"
              className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              View Live Menu
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              Create Account
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
