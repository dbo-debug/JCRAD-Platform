import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/getStaffContext";

export async function requireStaff() {
  const supabase = await createClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    redirect("/login?returnTo=/workspace/customers");
  }

  const context = await getStaffContext();
  if (!context) {
    redirect("/dashboard");
  }

  return context;
}
