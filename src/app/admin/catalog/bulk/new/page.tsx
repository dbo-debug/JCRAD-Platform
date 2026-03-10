import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BulkProductForm, { type BulkProductFormValues } from "@/components/admin/BulkProductForm";

const DEFAULT_VALUES: BulkProductFormValues = {
  catalog_item_id: null,
  product_id: null,
  name: "",
  category: "flower",
  inventory_qty: 0,
  inventory_unit: "lb",
  active: true,
  bulk_cost_per_lb: 0,
  bulk_sell_per_lb: null,
  min_order: 0,
  allow_bulk: true,
  allow_copack: true,
  offer_status: "draft",
};

export default function AdminCatalogBulkNewPage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Create Bulk Product"
        description="Create a catalog item, linked product, and offer."
      />
      <BulkProductForm mode="new" initialValues={DEFAULT_VALUES} />
    </div>
  );
}
