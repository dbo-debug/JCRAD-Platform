import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import { loadEstimateCustomerOptions } from "@/lib/estimate/customer";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";
import EstimateClient from "./estimate-client";

export default async function EstimatePage() {
  const { user } = await getUserAndProfile();
  const returnTo = safeInternalReturnTo("/estimate");

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const staff = await getStaffContext();
  const customerOptions = staff ? await loadEstimateCustomerOptions(createAdminClient()) : [];

  return (
    <div style={{ padding: 24 }}>
      <EstimateClient staffRole={staff?.role || null} customerOptions={customerOptions} />
    </div>
  );
}
