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

function isActive(pathname: string | null, href: string): boolean {
  const currentPath = String(pathname || "").trim();
  if (!currentPath) return href === "/admin";
  if (href === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(href);
}

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link
        href="/admin"
        className="mb-6 inline-flex h-14 w-32 items-center justify-center overflow-hidden rounded-2xl border border-[#eadff1] bg-white p-1 shadow-sm"
      >
        <img src="/brand/PRIMARY.png" alt="JC RAD Inc." className="h-full w-full object-contain" />
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
