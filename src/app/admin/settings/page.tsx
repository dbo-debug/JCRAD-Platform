import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SettingsAdminClient from "./settings-admin-client";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <AdminPageHeader
        title="Settings"
        description="Configure estimator math inputs and segment-builder route defaults."
      />
      <SettingsAdminClient />
    </div>
  );
}
