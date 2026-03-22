import { redirect } from "next/navigation";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import { loadEstimateCustomerOptions } from "@/lib/estimate/customer";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EstimateCustomerOption } from "@/components/estimate/types";
import EstimateClient from "./estimate-client";

export default async function EstimatePage() {
  const returnTo = safeInternalReturnTo("/estimate");
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (authError) {
    console.error("[estimate/page] auth lookup failed", {
      return_to: returnTo,
      message: authError.message,
    });
  }

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const staff = await getStaffContext();
  let customerOptions: EstimateCustomerOption[] = [];

  if (staff) {
    try {
      customerOptions = await loadEstimateCustomerOptions(createAdminClient());
    } catch (error) {
      console.error("[estimate/page] customer options load failed", {
        user_id: user.id,
        staff_role: staff.role,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <EstimateClient staffRole={staff?.role || null} customerOptions={customerOptions} />
    </div>
  );
}
