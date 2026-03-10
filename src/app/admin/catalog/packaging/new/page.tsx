import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PackagingSkuForm, { type PackagingSkuFormValues } from "@/components/admin/PackagingSkuForm";

const DEFAULT_VALUES: PackagingSkuFormValues = {
  id: null,
  name: "",
  applies_to: "flower",
  packaging_type: "",
  size_grams: null,
  pack_qty: 1,
  vape_device: null,
  vape_fill_grams: null,
  unit_cost: 0,
  inventory_qty: 0,
  active: true,
  thumbnail_url: null,
  thumbnail_bucket: null,
  thumbnail_object_path: null,
};

export default function AdminCatalogPackagingNewPage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Create Packaging SKU"
        description="Create a new packaging SKU with inventory."
      />
      <PackagingSkuForm mode="new" initialValues={DEFAULT_VALUES} />
    </div>
  );
}
