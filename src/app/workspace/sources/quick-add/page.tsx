import AdminPageHeader from "@/components/admin/AdminPageHeader";
import QuickAddSourceClient from "@/components/workspace/QuickAddSourceClient";
import { requireStaff } from "@/lib/requireStaff";

export const dynamic = "force-dynamic";

export default async function WorkspaceQuickAddSourcePage() {
  await requireStaff();

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <AdminPageHeader
        title="Quick Add Source"
        description="Fast supplier capture for the Sources workspace. Save the record first, then continue follow-up from the source detail page."
      />
      <QuickAddSourceClient />
    </div>
  );
}
