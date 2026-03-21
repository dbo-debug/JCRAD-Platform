import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PackagingSkuForm, { type PackagingSkuFormValues } from "@/components/admin/PackagingSkuForm";
import { normalizePackagingCompatibilityContexts } from "@/lib/packaging/compatibility";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

type PackagingSkuRecord = {
  id?: unknown;
  name?: unknown;
  applies_to?: unknown;
  applies_to_contexts?: unknown;
  packaging_type?: unknown;
  size_grams?: unknown;
  pack_qty?: unknown;
  vape_device?: unknown;
  vape_fill_grams?: unknown;
  unit_cost?: unknown;
  sell_price?: unknown;
  inventory_qty?: unknown;
  active?: unknown;
  thumbnail_url?: unknown;
  thumbnail_bucket?: unknown;
  thumbnail_object_path?: unknown;
};

export default async function AdminCatalogPackagingEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  let sku: PackagingSkuRecord | null = null;
  let error: { message?: string } | null = null;
  ({ data: sku, error } = await supabase
    .from("packaging_skus")
      .select(
        "id, name, applies_to, applies_to_contexts, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, sell_price, inventory_qty, active, thumbnail_url"
      )
    .eq("id", id)
    .single());

  if (error && String(error?.message || "").toLowerCase().includes("applies_to_contexts")) {
    ({ data: sku, error } = await supabase
      .from("packaging_skus")
      .select(
        "id, name, applies_to, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, sell_price, inventory_qty, active, thumbnail_url"
      )
      .eq("id", id)
      .single());
  }

  if (error || !sku) notFound();

  const appliesToRaw = String(sku.applies_to || "").toLowerCase();
  const applies_to =
    appliesToRaw === "pre-roll" || appliesToRaw === "preroll"
      ? "pre_roll"
      : ["flower", "concentrate", "vape", "pre_roll"].includes(appliesToRaw)
        ? (appliesToRaw as "flower" | "concentrate" | "vape" | "pre_roll")
        : "flower";

  const initialValues: PackagingSkuFormValues = {
    id: String(sku.id),
    name: String(sku.name || ""),
    applies_to,
    applies_to_contexts: normalizePackagingCompatibilityContexts(sku.applies_to_contexts).length > 0
      ? normalizePackagingCompatibilityContexts(sku.applies_to_contexts)
      : [applies_to],
    packaging_type: String(sku.packaging_type || ""),
    size_grams: sku.size_grams == null ? null : Number(sku.size_grams),
    pack_qty: Math.max(1, Number(sku.pack_qty || 1)),
    vape_device: sku.vape_device ? String(sku.vape_device) : null,
    vape_fill_grams: sku.vape_fill_grams == null ? null : Number(sku.vape_fill_grams),
    unit_cost: Number(sku.unit_cost || 0),
    sell_price: sku.sell_price == null ? null : Number(sku.sell_price),
    inventory_qty: Number(sku.inventory_qty || 0),
    active: sku.active == null ? true : !!sku.active,
    thumbnail_url: sku.thumbnail_url ? String(sku.thumbnail_url) : null,
    thumbnail_bucket: sku.thumbnail_bucket ? String(sku.thumbnail_bucket) : null,
    thumbnail_object_path: sku.thumbnail_object_path ? String(sku.thumbnail_object_path) : null,
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Edit Packaging: ${initialValues.name || "Untitled"}`}
        description="Update packaging details, inventory, and thumbnail."
      />
      <PackagingSkuForm mode="edit" initialValues={initialValues} />
    </div>
  );
}
