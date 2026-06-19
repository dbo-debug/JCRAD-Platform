"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/copack", label: "Copack" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/compliance", label: "Compliance" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

type MarketingHeaderProps = {
  isAuthenticated: boolean;
  dashboardHref?: string;
};

function isActive(pathname: string | null, href: string): boolean {
  const currentPath = String(pathname || "").trim();
  if (!currentPath) return href === "/";
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function MarketingHeader({ isAuthenticated, dashboardHref = "/dashboard" }: MarketingHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#d8e6ed] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="inline-flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#d8e6ed] bg-white p-1 shadow-sm md:h-[72px] md:w-[72px]">
            <Image src="/brand/PRIMARY.png" alt="JC RAD Inc." width={72} height={72} className="h-full w-full object-contain" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-[0.04em] text-[#173543]">JC RAD Inc.</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0d6f7a]">Wholesale Platform</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "text-sm font-medium transition-colors",
                isActive(pathname, item.href) ? "text-[#0d6f7a]" : "text-[#3d5a6a] hover:text-[#173543]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/menu"
            className="hidden rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#0d6f7a] hover:text-[#0d6f7a] md:inline-flex"
          >
            View Menu
          </Link>
          {!isAuthenticated ? (
            <>
              <Link
                href="/signup"
                className="hidden rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#0d6f7a] hover:text-[#0d6f7a] md:inline-flex"
              >
                Create Account
              </Link>
              <Link
                href="/login"
                className="hidden rounded-full bg-[#0d6f7a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a5d66] md:inline-flex"
              >
                Login
              </Link>
            </>
          ) : (
            <>
              <Link
                href={dashboardHref}
                className="hidden rounded-full bg-[#0d6f7a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a5d66] md:inline-flex"
              >
                Dashboard
              </Link>
              <form action="/auth/logout" method="post" className="hidden md:block">
                <button
                  type="submit"
                  className="rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#0d6f7a] hover:text-[#0d6f7a]"
                >
                  Logout
                </button>
              </form>
            </>
          )}
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex rounded-lg border border-[#d4e3ea] bg-white p-2 text-[#234353] md:hidden"
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#dfeaf0] bg-white px-4 py-3 md:hidden">
          <nav className="grid gap-1">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  isActive(pathname, item.href) ? "bg-[#eef9fb] text-[#0d6f7a]" : "text-[#3d5a6a] hover:bg-[#f4fbfd]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/menu"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex justify-center rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756]"
            >
              View Menu
            </Link>
            {!isAuthenticated ? (
              <>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 inline-flex justify-center rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756]"
                >
                  Create Account
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 inline-flex justify-center rounded-full bg-[#0d6f7a] px-4 py-2 text-sm font-semibold text-white"
                >
                  Login
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={dashboardHref}
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 inline-flex justify-center rounded-full bg-[#0d6f7a] px-4 py-2 text-sm font-semibold text-white"
                >
                  Dashboard
                </Link>
                <form action="/auth/logout" method="post" className="mt-2">
                  <button
                    type="submit"
                    className="w-full rounded-full border border-[#d4e3ea] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756]"
                  >
                    Logout
                  </button>
                </form>
              </>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
