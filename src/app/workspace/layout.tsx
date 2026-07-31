import { Suspense, type ReactNode } from "react";
import InternalSidebar from "@/components/layout/InternalSidebar";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { requireStaff } from "@/lib/requireStaff";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  await requireStaff();

  return (
    <div className="workspace-theme min-h-screen bg-[var(--workspace-bg)] text-[var(--workspace-text)]">
      <WorkspaceHeader />
      <div className="flex min-h-[calc(100vh-4rem)] flex-col [--workspace-header-offset:4rem] lg:flex-row">
        <Suspense fallback={<div className="hidden w-64 flex-none bg-[var(--workspace-sidebar)] lg:block" />}>
          <InternalSidebar />
        </Suspense>
        <main className="min-w-0 flex-1 bg-[var(--workspace-bg)] p-4 sm:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
