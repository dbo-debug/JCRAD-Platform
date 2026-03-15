"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [{ label: "Customers", href: "/workspace/customers" }] as const;

export default function WorkspaceSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link href="/workspace/customers" className="mb-6 inline-flex items-center gap-2 rounded-xl border border-[#d7e6ed] bg-[#f7fbfd] px-2 py-1.5 shadow-sm">
        <Image src="/brand/BLACK.png" alt="JC RAD Inc." width={108} height={32} className="h-8 w-auto" priority />
      </Link>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">Internal Workspace</p>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[#e9fbf9] text-[#0f766e]" : "text-[#4a6575] hover:bg-[#f4f9fc] hover:text-[#173543]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
