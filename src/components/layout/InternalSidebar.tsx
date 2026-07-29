"use client";

import Link from "next/link";
import Image from "next/image";
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
      { label: "Sales Dashboard", href: "/workspace/sales" },
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
    <aside className="w-full border-b border-[var(--surface-border)] bg-white px-4 py-4 lg:w-72 lg:flex-none lg:border-b-0 lg:border-r lg:py-6">
      <div className="flex items-center gap-3 lg:block">
        <Link
          href="/workspace/customers"
          className="inline-flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#eadff1] bg-white p-1 shadow-sm lg:mb-6 lg:w-32"
        >
          <Image src="/brand/PRIMARY.png" alt="JC RAD Inc." width={128} height={56} className="h-full w-full object-contain" />
        </Link>
        <div className="min-w-0 flex-1 rounded-2xl border border-[#bfe8df] bg-[#effcf8] px-3 py-3 lg:mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0d6f7a]">Active Workspace</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#173543]">Nameless Genetics</p>
          <p className="mt-0.5 text-xs text-[#4f6877]">Retail Sales CRM</p>
        </div>
      </div>

      <div className="mt-4 flex gap-6 overflow-x-auto pb-1 lg:mt-0 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0">
        {visibleSections.map((section) => (
          <div key={section.label} className="min-w-max lg:min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a93a2]">{section.label}</p>
            <nav className="flex gap-1 lg:block lg:space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "block min-h-11 whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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
