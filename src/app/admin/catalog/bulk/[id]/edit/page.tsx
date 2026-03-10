import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BulkProductForm, { type BulkProductFormValues } from "@/components/admin/BulkProductForm";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCatalogBulkEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: item, error: itemErr } = await supabase
    .from("catalog_items")
    .select("id, product_id, name, category, active")
    .eq("id", id)
    .single();

  if (itemErr || !item) notFound();

  const productId = String((item as any).product_id || "");
  const [productResult, offerResult] = await Promise.all([
    productId
      ? supabase
        .from("products")
        .select("id, name, category, inventory_qty, inventory_unit")
        .eq("id", productId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    productId
      ? supabase
        .from("offers")
        .select("id, status, min_order, bulk_cost_per_lb, bulk_sell_per_lb, allow_bulk, allow_copack")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (productResult.error) throw new Error(productResult.error.message);
  if (offerResult.error) throw new Error(offerResult.error.message);

  const product = productResult.data;
  const offer = offerResult.data;

  const categoryRaw = String((item as any).category || (product as any)?.category || "flower").toLowerCase();
  const category = (categoryRaw === "pre-roll" || categoryRaw === "preroll" ? "pre_roll" : categoryRaw) as
    | "flower"
    | "concentrate"
    | "vape"
    | "pre_roll";

  const initialValues: BulkProductFormValues = {
    catalog_item_id: String((item as any).id),
    product_id: product ? String((product as any).id) : null,
    name: String((item as any).name || (product as any)?.name || ""),
    category: ["flower", "concentrate", "vape", "pre_roll"].includes(category) ? category : "flower",
    inventory_qty: Number((product as any)?.inventory_qty || 0),
    inventory_unit: String((product as any)?.inventory_unit || "lb") === "g" ? "g" : "lb",
    active: !!(item as any).active,
    bulk_cost_per_lb: Number((offer as any)?.bulk_cost_per_lb || 0),
    bulk_sell_per_lb:
      (offer as any)?.bulk_sell_per_lb == null ? null : Number((offer as any).bulk_sell_per_lb),
    min_order: Number((offer as any)?.min_order || 0),
    allow_bulk: (offer as any)?.allow_bulk == null ? true : !!(offer as any).allow_bulk,
    allow_copack: (offer as any)?.allow_copack == null ? true : !!(offer as any).allow_copack,
    offer_status: String((offer as any)?.status || "draft").toLowerCase() === "published" ? "published" : "draft",
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Edit Bulk Product: ${initialValues.name || "Untitled"}`}
        description="Update catalog item, product inventory, and offer pricing."
      />
      <BulkProductForm mode="edit" initialValues={initialValues} />
    </div>
  );
}
