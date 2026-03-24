import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import InternalSidebar from "@/components/layout/InternalSidebar";
import SurfaceShell from "@/components/layout/SurfaceShell";
import { requireStaff } from "@/lib/requireStaff";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const staff = await requireStaff();

  return (
    <SurfaceShell>
      <Header isAuthenticated dashboardHref="/workspace" />
      <div className="flex min-h-[calc(100vh-5rem)] [--workspace-header-offset:5rem]">
        <InternalSidebar role={staff.role} />
        <section className="min-w-0 flex-1 bg-[var(--surface-card)] p-6 text-[var(--text)] xl:p-8">{children}</section>
      </div>
    </SurfaceShell>
  );
}
