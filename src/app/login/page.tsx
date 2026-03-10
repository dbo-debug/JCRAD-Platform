import AppShell from "@/components/layout/AppShell";
import LoginForm from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = typeof params?.returnTo === "string" && params.returnTo.trim() ? params.returnTo : "/dashboard";

  return (
    <AppShell>
      <LoginForm returnTo={returnTo} />
    </AppShell>
  );
}
