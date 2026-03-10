import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import SurfaceShell from "@/components/layout/SurfaceShell";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";

type AppShellProps = {
  children: ReactNode;
};

export default async function AppShell({ children }: AppShellProps) {
  const { user, profile } = await getUserAndProfile();
  const role = String((profile as Record<string, unknown> | null)?.role || "customer").toLowerCase();
  const dashboardHref = role === "admin" ? "/admin" : "/dashboard";

  return (
    <SurfaceShell>
      <Header isAuthenticated={Boolean(user)} dashboardHref={dashboardHref} />
      <main className="mx-auto max-w-6xl px-6 py-10 text-[var(--text)]">{children}</main>
    </SurfaceShell>
  );
}
