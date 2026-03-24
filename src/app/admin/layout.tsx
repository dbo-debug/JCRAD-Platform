import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import InternalSidebar from "@/components/layout/InternalSidebar";
import SurfaceShell from "@/components/layout/SurfaceShell";
import { requireStaff } from "@/lib/requireStaff";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const staff = await requireStaff();

  return (
    <SurfaceShell>
      <Header isAuthenticated dashboardHref="/admin" />
      <div className="flex min-h-[calc(100vh-5rem)]">
        <InternalSidebar role={staff.role} />
        <section className="flex-1 bg-[var(--surface-card)] p-8 text-[var(--text)]">{children}</section>
      </div>
    </SurfaceShell>
  );
}
