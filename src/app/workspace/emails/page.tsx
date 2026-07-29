import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EmailsWorkspace from "@/components/workspace/EmailsWorkspace";
import { loadEmailWorkspaceData } from "@/lib/emailCampaignWorkspace";
import { requireStaff } from "@/lib/requireStaff";

export const dynamic = "force-dynamic";

function asQueryValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? String(value[0] || "") : String(value || "");
  const trimmed = raw.trim();
  return trimmed || null;
}

export default async function WorkspaceEmailsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const selectedCampaignId = asQueryValue(params?.campaign);
  const data = await loadEmailWorkspaceData({
    staffUserId: staff.userId,
    staffRole: staff.role,
    selectedCampaignId,
  });

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6">
      <AdminPageHeader
        title="Communications"
        description="Manage authorized CRM email, account follow-up, and automation-ready outreach."
      />
      <EmailsWorkspace campaigns={data.campaigns} selectedCampaign={data.selectedCampaign} recipientOptions={data.recipientOptions} />
    </div>
  );
}
