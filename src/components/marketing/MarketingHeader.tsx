"use client";

import { useState } from "react";
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

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MarketingHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#d9e7ee] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="inline-flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="rounded-xl border border-[#d7e6ed] bg-[#f7fbfd] p-1 shadow-sm">
            <img src="/brand/BLACK.png" alt="JC RAD Inc." className="h-14 w-auto md:h-16" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-[0.04em] text-[#173543]">JC RAD Inc.</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0f766e]">Wholesale + Copack</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 md:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "text-sm font-medium transition-colors",
                isActive(pathname, item.href) ? "text-[#0f766e]" : "text-[#3d5a6a] hover:text-[#173543]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/menu"
            className="hidden rounded-full border border-[#cfe0e7] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e] md:inline-flex"
          >
            View Menu
          </Link>
          <Link
            href="/signup"
            className="hidden rounded-full border border-[#cfe0e7] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e] md:inline-flex"
          >
            Create Account
          </Link>
          <Link
            href="/login"
            className="hidden rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 md:inline-flex"
          >
            Login
          </Link>
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex rounded-lg border border-[#d5e3ea] bg-white p-2 text-[#234353] md:hidden"
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#deebf1] bg-white px-4 py-3 md:hidden">
          <nav className="grid gap-1">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  isActive(pathname, item.href)
                    ? "bg-[#e9fbf9] text-[#0f766e]"
                    : "text-[#3d5a6a] hover:bg-[#f4f9fc]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/menu"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex justify-center rounded-full border border-[#cfe0e7] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756]"
            >
              View Menu
            </Link>
            <Link
              href="/signup"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex justify-center rounded-full border border-[#cfe0e7] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756]"
            >
              Create Account
            </Link>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex justify-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white"
            >
              Login
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
