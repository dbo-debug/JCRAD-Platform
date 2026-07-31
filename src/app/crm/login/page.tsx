import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/getStaffContext";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import CrmLoginForm from "./CrmLoginForm";

export const metadata: Metadata = {
  title: "CRM Login | JC RAD",
  robots: { index: false, follow: false },
};

export default async function CrmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const staff = await getStaffContext();
  if (staff) redirect("/workspace/customers");

  const params = await searchParams;
  const requestedReturnTo = safeInternalReturnTo(String(params.returnTo || "/workspace/customers"));
  const returnTo = requestedReturnTo.startsWith("/workspace/") ? requestedReturnTo : "/workspace/customers";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4fafc] px-5 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(13,111,122,0.15),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(111,50,181,0.1),_transparent_38%)]" />
      <section className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/90 bg-white/95 p-8 shadow-[0_30px_90px_rgba(23,53,67,0.16)] backdrop-blur sm:p-10">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[#d8e6ed] bg-white p-1 shadow-sm">
            <Image src="/brand/PRIMARY.png" alt="JC RAD Inc." width={64} height={64} className="h-full w-full object-contain" priority />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0d6f7a]">Private Access</p>
            <p className="mt-1 font-semibold text-[#173543]">Nameless Genetics Retail Sales</p>
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-[#173543]">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-[#5c7483]">
          Sign in to manage customers, communication, tasks, routes, and the route runner.
        </p>

        <CrmLoginForm returnTo={returnTo} />

        <Link href="/" className="mt-7 block text-center text-xs font-medium text-[#6d8593] hover:text-[#173543]">
          Return to public site
        </Link>
      </section>
    </main>
  );
}
