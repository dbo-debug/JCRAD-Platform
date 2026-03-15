import AdminPageHeader from "@/components/admin/AdminPageHeader";
import CustomerImportManager from "@/components/workspace/CustomerImportManager";
import { getFieldLabels } from "@/lib/customerImport";
import { requireStaff } from "@/lib/requireStaff";

export default async function CustomerImportPage() {
  const staff = await requireStaff();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customer Import"
        description="Preview and apply Google Sheets customer imports conservatively. Exact company and email matching only; ambiguous rows are skipped."
      />
      <CustomerImportManager fields={getFieldLabels()} canApply={staff.role === "admin"} />
    </div>
  );
}
