"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "CRM",
    items: [
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
];

function isActive(pathname: string | null, href: string) {
  const currentPath = String(pathname || "").trim();
  if (!currentPath) return href === "/workspace/customers";
  if (href === "/workspace/routes/run") return currentPath.startsWith("/workspace/routes/run");
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function InternalSidebar() {
  const pathname = usePathname();
  const visibleSections = NAV_SECTIONS;

  return (
    <aside className="w-72 border-r border-[var(--surface-border)] bg-white px-4 py-6">
      <Link
        href="/workspace/customers"
        className="mb-6 inline-flex h-14 w-32 items-center justify-center overflow-hidden rounded-2xl border border-[#eadff1] bg-white p-1 shadow-sm"
      >
        <img src="/brand/PRIMARY.png" alt="JC RAD Inc." className="h-full w-full object-contain" />
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
                      active ? "bg-[#eef9fb] text-[#0d6f7a]" : "text-[#4a6575] hover:bg-[#f4fbfd] hover:text-[#173543]",
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
