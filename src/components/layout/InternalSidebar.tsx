"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type InternalSidebarProps = {
  role: "admin" | "sales";
};

type NavItem = {
  label: string;
  salesLabel?: string;
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
      { label: "Command Center", salesLabel: "My Day", href: "/admin" },
      { label: "Customers", href: "/workspace/customers" },
      { label: "Sources", href: "/workspace/sources" },
      { label: "Quick Add Lead", href: "/workspace/events/quick-add" },
      { label: "Quick Add Source", href: "/workspace/sources/quick-add" },
      { label: "Segment Builder", href: "/workspace/segments" },
      { label: "Emails", href: "/workspace/emails" },
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
      { label: "Packaging", href: "/admin/catalog/packaging", adminOnly: true },
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
        href="/admin"
        className="mb-6 inline-flex h-14 w-32 items-center justify-center overflow-hidden rounded-2xl border border-[#eadff1] bg-white p-1 shadow-sm"
      >
        <img src="/brand/motley-on-white.png" alt="Motley Terpz" className="h-full w-full object-contain" />
      </Link>

      <div className="space-y-5">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">{section.label}</p>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const label = role === "sales" && item.salesLabel ? item.salesLabel : item.label;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-[#fcf3ff] text-[#6f32b5]" : "text-[#4a6575] hover:bg-[#fcf5fb] hover:text-[#173543]",
                    ].join(" ")}
                  >
                    {label}
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
