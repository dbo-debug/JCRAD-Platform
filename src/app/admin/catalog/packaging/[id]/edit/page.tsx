import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PackagingSkuForm, { type PackagingSkuFormValues } from "@/components/admin/PackagingSkuForm";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCatalogPackagingEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: sku, error } = await supabase
    .from("packaging_skus")
    .select(
      "id, name, applies_to, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, inventory_qty, active, thumbnail_url"
    )
    .eq("id", id)
    .single();

  if (error || !sku) notFound();

  const appliesToRaw = String((sku as any).applies_to || "").toLowerCase();
  const applies_to =
    appliesToRaw === "pre-roll" || appliesToRaw === "preroll"
      ? "pre_roll"
      : ["flower", "concentrate", "vape", "pre_roll"].includes(appliesToRaw)
        ? (appliesToRaw as "flower" | "concentrate" | "vape" | "pre_roll")
        : "flower";

  const initialValues: PackagingSkuFormValues = {
    id: String((sku as any).id),
    name: String((sku as any).name || ""),
    applies_to,
    packaging_type: String((sku as any).packaging_type || ""),
    size_grams: (sku as any).size_grams == null ? null : Number((sku as any).size_grams),
    pack_qty: Math.max(1, Number((sku as any).pack_qty || 1)),
    vape_device: (sku as any).vape_device ? String((sku as any).vape_device) : null,
    vape_fill_grams: (sku as any).vape_fill_grams == null ? null : Number((sku as any).vape_fill_grams),
    unit_cost: Number((sku as any).unit_cost || 0),
    inventory_qty: Number((sku as any).inventory_qty || 0),
    active: (sku as any).active == null ? true : !!(sku as any).active,
    thumbnail_url: (sku as any).thumbnail_url ? String((sku as any).thumbnail_url) : null,
    thumbnail_bucket: (sku as any).thumbnail_bucket ? String((sku as any).thumbnail_bucket) : null,
    thumbnail_object_path: (sku as any).thumbnail_object_path ? String((sku as any).thumbnail_object_path) : null,
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
