import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Card from "@/components/ui/Card";

const SETTINGS_SECTIONS = ["Markup %", "Labor Cost", "COA Cost", "Yield %"] as const;

export default function AdminSettingsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Settings"
        description="Configure operational pricing inputs."
        action={
          <button className="rounded bg-[#0FB9B1] px-4 py-2 text-sm font-semibold text-black">
            Save Changes
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {SETTINGS_SECTIONS.map((section) => (
          <Card key={section} className="p-5">
            <h2 className="text-base font-semibold text-white">{section}</h2>
            <p className="mt-2 text-sm text-white/60">Placeholder controls for {section}.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
