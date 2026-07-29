import AdminPageHeader from "@/components/admin/AdminPageHeader";
import RetailAccountCreateForm from "@/components/workspace/RetailAccountCreateForm";
import { requireStaff } from "@/lib/requireStaff";

export default async function NewRetailAccountPage() {
  const staff = await requireStaff();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <AdminPageHeader
        title="Add Nameless Retail Shop"
        description="Run the existing-account check before claiming ownership. Potential matches are warnings only and are never merged automatically."
      />
      <RetailAccountCreateForm canOverrideCommission={staff.role === "admin"} />
    </div>
  );
}
