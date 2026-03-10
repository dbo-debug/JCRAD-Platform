import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";

const REQUIRED_DOCS = [
  { key: "cannabis_license", label: "Cannabis License" },
  { key: "sellers_permit", label: "Seller's Permit" },
  { key: "w9", label: "W9" },
  { key: "irs_form_8300", label: "IRS Form 8300" },
] as const;

export default async function PortalOnboardingPage() {
  const { user, verificationStatus } = await getUserAndProfile();

  if (!user) {
    redirect("/login?returnTo=/portal/onboarding");
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold text-[#13303f]">Verification Onboarding</h1>
          <p className="text-[#4a6575]">Current status: <span className="text-[#173543]">{verificationStatus}</span></p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {REQUIRED_DOCS.map((doc) => (
            <Card key={doc.key} className="border border-[var(--surface-border)] bg-white p-5 text-[var(--text)] shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-[#173543]">{doc.label}</h2>
                <span className="rounded-full border border-[#d4e2e9] bg-[#f6fafc] px-2.5 py-1 text-xs text-[#5d7685]">
                  Pending
                </span>
              </div>

              <Input
                type="file"
                className="mt-4 border-[#d0dee6] bg-white text-[#173543] focus-visible:ring-[#14b8a6] focus-visible:ring-offset-white file:mr-3 file:rounded-md file:border-0 file:bg-[#14b8a6]/12 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#0f766e]"
              />

              <p className="mt-3 text-xs text-[#5d7685]">
                TODO: Attach upload + metadata persistence for <code>{doc.key}</code> when verification docs table is finalized.
              </p>
            </Card>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
