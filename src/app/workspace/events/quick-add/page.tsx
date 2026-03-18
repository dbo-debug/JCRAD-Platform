import AdminPageHeader from "@/components/admin/AdminPageHeader";
import QuickAddLeadClient from "@/components/workspace/QuickAddLeadClient";
import { DEFAULT_START_LINK } from "@/lib/sms";
import { requireStaff } from "@/lib/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProfileOption = {
  userId: string;
  label: string;
};

export default async function WorkspaceQuickAddLeadPage() {
  const staff = await requireStaff();
  let ownerOptions: ProfileOption[] = [];

  if (staff.role === "admin") {
    const supabase = createAdminClient();
    const [profilesRes, usersRes] = await Promise.all([
      supabase.from("profiles").select("id, role, company_name").in("role", ["admin", "sales"]),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesRes.error) {
      throw new Error(profilesRes.error.message);
    }

    const emailById = new Map(
      (usersRes.data?.users || []).map((user: { id?: string; email?: string | null }) => [
        String(user.id || ""),
        String(user.email || "").trim(),
      ] as const)
    );

    ownerOptions = (profilesRes.data || []).map((profile: Record<string, unknown>) => {
      const userId = String(profile.id || "");
      const companyName = String(profile.company_name || "").trim();
      const email = emailById.get(userId);
      const label = companyName || email || userId;
      return {
        userId,
        label: email && companyName ? `${companyName} (${email})` : label,
      };
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <AdminPageHeader
        title="Quick Add Lead"
        description="Fast mobile-first event capture for Hall of Flowers. Save the account into CRM and send the menu / estimate handoff by text."
      />
      <QuickAddLeadClient
        ownerOptions={ownerOptions}
        canAssignOwner={staff.role === "admin"}
        currentUserId={staff.userId}
        startLink={DEFAULT_START_LINK}
      />
    </div>
  );
}
