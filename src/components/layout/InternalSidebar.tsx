"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type InternalSidebarProps = {
  role: "admin" | "sales";
};

type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Command",
    items: [
      { label: "Command Center", href: "/admin", adminOnly: true },
      { label: "Customers", href: "/workspace/customers" },
      { label: "Segment Builder", href: "/workspace/segments" },
      { label: "Tasks", href: "/workspace/tasks" },
    ],
  },
  {
    label: "Field Ops",
    items: [
      { label: "Routes", href: "/workspace/routes" },
      { label: "Route Runner", href: "/workspace/routes/run" },
      { label: "Customer Import", href: "/workspace/customers/import" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Orders", href: "/admin/orders", adminOnly: true },
      { label: "Menu", href: "/menu" },
      { label: "Packaging", href: "/admin/packaging", adminOnly: true },
      { label: "Packaging Reviews", href: "/admin/packaging/submissions", adminOnly: true },
      { label: "Catalog", href: "/admin/catalog", adminOnly: true },
      { label: "Settings", href: "/admin/settings", adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/workspace/routes/run") return pathname.startsWith("/workspace/routes/run");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function InternalSidebar({ role }: InternalSidebarProps) {
  const pathname = usePathname();
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || role === "admin"),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="w-72 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link
        href={role === "admin" ? "/admin" : "/workspace/customers"}
        className="mb-6 inline-flex items-center gap-2 rounded-xl border border-[#d7e6ed] bg-[#f7fbfd] px-2 py-1.5 shadow-sm"
      >
        <Image src="/brand/BLACK.png" alt="JC RAD Inc." width={108} height={32} className="h-8 w-auto" priority />
      </Link>

      <div className="space-y-5">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">{section.label}</p>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
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
          </div>
        ))}
      </div>
    </aside>
  );
}
