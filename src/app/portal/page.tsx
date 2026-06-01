import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";

export default async function PortalPage() {
  const { user, verificationStatus } = await getUserAndProfile();

  if (!user) {
    redirect("/login?returnTo=/portal");
  }

  const isApproved = verificationStatus === "approved";
  const badgeClass = isApproved
    ? "border-[#8f52dc]/35 bg-[#8f52dc]/10 text-[#6f32b5]"
    : "border-amber-300/45 bg-amber-100 text-amber-700";

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold text-[#13303f]">Customer Portal</h1>
          <p className="text-[#4a6575]">Manage onboarding approval status before saving and submitting orders.</p>
        </section>

        <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#5d7685]">Signed in as</p>
              <p className="text-base font-medium text-[#173543]">{user.email}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>
              {verificationStatus}
            </span>
          </div>
        </Card>

        {!isApproved ? (
          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
            <p className="text-[#173543]">
              Upload license &amp; seller&apos;s permit to enable saving orders
            </p>
            <div className="mt-4">
              <Link href="/portal/onboarding" className="inline-flex">
                <Button className="rounded-full bg-[#8f52dc] text-white hover:bg-[#8f52dc]">Start onboarding</Button>
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
