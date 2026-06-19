"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Customers", href: "/workspace/customers" },
  { label: "Routes", href: "/workspace/routes" },
  { label: "Route Runner", href: "/workspace/routes/run" },
  { label: "Customer Import", href: "/workspace/customers/import" },
] as const;

export default function WorkspaceSidebar() {
  const pathname = usePathname();
  const currentPath = String(pathname || "").trim();

  return (
    <aside className="w-64 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link
        href="/workspace/customers"
        className="mb-6 inline-flex h-14 w-32 items-center justify-center overflow-hidden rounded-2xl border border-[#eadff1] bg-white p-1 shadow-sm"
      >
        <img src="/brand/PRIMARY.png" alt="JC RAD Inc." className="h-full w-full object-contain" />
      </Link>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">Internal Workspace</p>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = currentPath ? currentPath === item.href || currentPath.startsWith(`${item.href}/`) : item.href === "/workspace/customers";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[#eef9fb] text-[#0d6f7a]" : "text-[#4a6575] hover:bg-[#f4fbfd] hover:text-[#173543]",
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
