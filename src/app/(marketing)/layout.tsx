import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jcradinc.com"),
  title: "JC RAD",
  description: "JC RAD is making updates to the site and will be back soon.",
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef8fb_0%,#f6fbfd_38%,#ffffff_82%)] text-[#173543]">
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12">{children}</main>
    </div>
  );
}
