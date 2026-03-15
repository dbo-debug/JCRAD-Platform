"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: ReadonlyArray<{ label: string; href: string; subItem?: boolean }> = [
  { label: "Dashboard", href: "/admin" },
  { label: "Packaging Reviews", href: "/admin/packaging/submissions" },
  { label: "Customers", href: "/workspace/customers" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Catalog", href: "/admin/catalog" },
  { label: "Bulk Products", href: "/admin/catalog/bulk", subItem: true },
  { label: "Packaging SKUs", href: "/admin/catalog/packaging", subItem: true },
  { label: "Settings", href: "/admin/settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link href="/admin" className="mb-6 inline-flex items-center gap-2 rounded-xl border border-[#d7e6ed] bg-[#f7fbfd] px-2 py-1.5 shadow-sm">
        <img src="/brand/BLACK.png" alt="JC RAD Inc." className="h-8 w-auto" />
      </Link>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">Admin Navigation</p>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.subItem ? "ml-4 text-xs" : "",
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
