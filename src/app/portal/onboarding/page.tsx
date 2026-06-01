import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import OnboardingUploadForm from "@/components/portal/OnboardingUploadForm";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";

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
          <p className="text-sm text-[#5d7685]">A team member will review your documents within 24 hours.</p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/estimate" className="inline-flex">
            <Button className="rounded-full border border-[#cfdce4] bg-white text-[#24404d] hover:border-[#8f52dc] hover:text-[#6f32b5]">
              Back to Estimate
            </Button>
          </Link>
          <Link href="/dashboard" className="inline-flex">
            <Button className="rounded-full border border-[#cfdce4] bg-white text-[#24404d] hover:border-[#8f52dc] hover:text-[#6f32b5]">
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <OnboardingUploadForm />
      </div>
    </AppShell>
  );
}
