import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import EstimateClient from "./estimate-client";

export default async function EstimatePage() {
  const { user } = await getUserAndProfile();
  const returnTo = safeInternalReturnTo("/estimate");

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <EstimateClient />
    </div>
  );
}
