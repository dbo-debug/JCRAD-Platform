import AppShell from "@/components/layout/AppShell";
import SignupForm from "./signup-form";

type SignupPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const returnTo = typeof params?.returnTo === "string" && params.returnTo.trim() ? params.returnTo : "/dashboard";

  return (
    <AppShell>
      <SignupForm returnTo={returnTo} />
    </AppShell>
  );
}
