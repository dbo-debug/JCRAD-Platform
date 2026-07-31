"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  match: "dashboard" | "accounts" | "sales" | "emails" | "tasks" | "routes" | "runner";
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/workspace/sales", match: "dashboard" },
  { label: "Retail Accounts", href: "/workspace/customers", match: "accounts" },
  {
    label: "Sales",
    href: "/workspace/customers?savedView=pipeline&organizeBy=stage&sort=activity_desc",
    match: "sales",
  },
  { label: "Communications", href: "/workspace/emails", match: "emails" },
  { label: "Tasks", href: "/workspace/tasks", match: "tasks" },
  { label: "Routes", href: "/workspace/routes", match: "routes" },
  { label: "Route Runner", href: "/workspace/routes/run", match: "runner" },
];

function itemIsActive(pathname: string, savedView: string | null, item: NavItem) {
  if (item.match === "dashboard") return pathname === "/workspace/sales";
  if (item.match === "accounts") {
    return pathname.startsWith("/workspace/customers") && savedView !== "pipeline";
  }
  if (item.match === "sales") {
    return pathname === "/workspace/customers" && savedView === "pipeline";
  }
  if (item.match === "emails") return pathname.startsWith("/workspace/emails");
  if (item.match === "tasks") return pathname.startsWith("/workspace/tasks");
  if (item.match === "runner") return pathname.startsWith("/workspace/routes/run");
  return pathname === "/workspace/routes";
}

function WorkspaceNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = String(usePathname() || "");
  const searchParams = useSearchParams();
  const savedView = searchParams.get("savedView");

  return (
    <nav aria-label="Workspace navigation" className={mobile ? "grid gap-1 sm:grid-cols-2" : "space-y-1"}>
      {PRIMARY_NAV.map((item) => {
        const active = itemIsActive(pathname, savedView, item);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition",
              active
                ? mobile
                  ? "bg-[var(--workspace-primary)] text-white"
                  : "bg-white text-black shadow-sm"
                : mobile
                  ? "text-[var(--workspace-text-secondary)] hover:bg-[var(--workspace-surface-muted)] hover:text-black"
                  : "text-[var(--workspace-sidebar-muted)] hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function InternalSidebar() {
  return (
    <>
      <div className="sticky top-16 z-40 border-b border-[var(--workspace-border)] bg-white px-4 py-3 lg:hidden">
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-3 text-sm font-semibold">
            Workspace navigation
            <span aria-hidden="true" className="text-lg leading-none">+</span>
          </summary>
          <div className="pt-2">
            <WorkspaceNav mobile />
          </div>
        </details>
      </div>

      <aside className="hidden w-64 flex-none border-r border-black bg-[var(--workspace-sidebar)] px-4 py-6 lg:flex lg:flex-col">
        <Link
          href="/workspace/sales"
          className="mb-7 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
        >
          <Image
            src="/brand/nameless/nameless-monogram-white-on-black.png"
            alt=""
            width={48}
            height={48}
            className="h-11 w-11 rounded-lg object-cover"
          />
          <span>
            <span className="block text-sm font-semibold text-white">Nameless Genetics</span>
            <span className="mt-0.5 block text-xs text-[var(--workspace-sidebar-muted)]">Retail Sales CRM</span>
          </span>
        </Link>

        <WorkspaceNav />

        <div className="mt-auto border-t border-white/10 pt-4">
          <Link
            href="/workspace/customers/import"
            className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--workspace-sidebar-muted)] transition hover:bg-white/10 hover:text-white"
          >
            Account import
          </Link>
        </div>
      </aside>
    </>
  );
}
