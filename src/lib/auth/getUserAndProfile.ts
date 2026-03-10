import { createClient } from "@/lib/supabase/server";

type GenericProfile = Record<string, unknown> | null;

export type UserProfileResult = {
  user: Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"] | null;
  profile: GenericProfile;
  verificationStatus: string;
};

function deriveVerificationStatus(profile: GenericProfile): string {
  if (!profile) return "unverified";

  const fromStatus = profile.verification_status;
  if (typeof fromStatus === "string" && fromStatus.trim()) {
    return fromStatus.trim().toLowerCase();
  }

  if (profile.verified === true || profile.is_verified === true) {
    return "verified";
  }

  return "unverified";
}

export async function getUserAndProfile(): Promise<UserProfileResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (!user) {
    return { user: null, profile: null, verificationStatus: "unverified" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile: (profile as GenericProfile) ?? null,
    verificationStatus: deriveVerificationStatus((profile as GenericProfile) ?? null),
  };
}
