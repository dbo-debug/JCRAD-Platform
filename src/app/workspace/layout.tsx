import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import SurfaceShell from "@/components/layout/SurfaceShell";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import { requireStaff } from "@/lib/requireStaff";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  await requireStaff();

  return (
    <SurfaceShell>
      <Header isAuthenticated dashboardHref="/workspace/customers" />
      <div className="flex min-h-[calc(100vh-5rem)]">
        <WorkspaceSidebar />
        <section className="flex-1 bg-[var(--surface-card)] p-8 text-[var(--text)]">{children}</section>
      </div>
    </SurfaceShell>
  );
}
