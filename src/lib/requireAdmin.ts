import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) redirect("/auth/login");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profErr || !profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return { supabase, user: authData.user, profile };
}