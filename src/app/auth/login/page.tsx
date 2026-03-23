import { redirect } from "next/navigation";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";

type LegacyLoginPageProps = {
  searchParams: Promise<{ returnTo?: string; next?: string }>;
};

export default async function LegacyLoginPage({ searchParams }: LegacyLoginPageProps) {
  const params = await searchParams;
  const returnTo = safeInternalReturnTo(
    typeof params?.returnTo === "string" && params.returnTo.trim()
      ? params.returnTo
      : typeof params?.next === "string" && params.next.trim()
        ? params.next
        : "/dashboard"
  );

  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
