import type { Metadata } from "next";
import type { ReactNode } from "react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jcradinc.com"),
  title: {
    default: "JC RAD | Wholesale & Copack",
    template: "%s | JC RAD",
  },
  description:
    "California-focused wholesale flower, pre-rolls, concentrates, and vape manufacturing with compliance-first copack workflows.",
};

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await getUserAndProfile();
  const role = String((profile as Record<string, unknown> | null)?.role || "customer").toLowerCase();
  const dashboardHref = role === "admin" ? "/admin" : role === "sales" ? "/workspace/customers" : "/dashboard";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f3fbff_0%,#f7fbfd_35%,#ffffff_80%)] text-[#173543]">
      <MarketingHeader isAuthenticated={Boolean(user)} dashboardHref={dashboardHref} />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12">{children}</main>
      <MarketingFooter />
    </div>
  );
}
