import type { ReactNode } from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Header from "@/components/layout/Header";
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
        <AdminSidebar />
        <section className="flex-1 bg-[var(--surface-card)] p-8 text-[var(--text)]">{children}</section>
      </div>
    </SurfaceShell>
  );
}
