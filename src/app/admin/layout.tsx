import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import InternalSidebar from "@/components/layout/InternalSidebar";
import SurfaceShell from "@/components/layout/SurfaceShell";
import { requireAdmin } from "@/lib/requireAdmin";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdmin();

  return (
    <SurfaceShell>
      <Header isAuthenticated dashboardHref="/admin" />
      <div className="flex min-h-[calc(100vh-5rem)]">
        <InternalSidebar role="admin" />
        <section className="flex-1 bg-[var(--surface-card)] p-8 text-[var(--text)]">{children}</section>
      </div>
    </SurfaceShell>
  );
}
