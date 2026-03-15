import { createClient } from "@/lib/supabase/server";

const ALLOWED_STAFF_ROLES = new Set(["admin", "sales"]);

export type StaffContext = {
  userId: string;
  role: "admin" | "sales";
};

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  const role = String(profile?.role || "").trim().toLowerCase();
  if (profileErr || !ALLOWED_STAFF_ROLES.has(role)) return null;

  return {
    userId: authData.user.id,
    role: role as "admin" | "sales",
  };
}
