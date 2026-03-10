type GenericProfile = Record<string, unknown> | null;

export type EstimatorAccess = {
  canAccess: boolean;
  profileStatus: string;
  reason: string;
};

function normalizeStatus(profile: GenericProfile): string {
  const raw = profile?.verification_status;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }
  return "unverified";
}

export function getEstimatorAccess(profile: GenericProfile): EstimatorAccess {
  if (!profile) {
    return { canAccess: false, profileStatus: "missing_profile", reason: "Profile is missing." };
  }

  const verificationStatus = normalizeStatus(profile);
  if (verificationStatus === "verified" || verificationStatus === "approved") {
    return { canAccess: true, profileStatus: verificationStatus, reason: "Profile verification status is allowed." };
  }

  if (profile.verified === true || profile.is_verified === true) {
    return { canAccess: true, profileStatus: "verified", reason: "Legacy verified flag is true." };
  }

  return { canAccess: false, profileStatus: verificationStatus, reason: "Verification status is not eligible." };
}

export function canAccessEstimator(profile: GenericProfile): boolean {
  return getEstimatorAccess(profile).canAccess;
}

export function safeInternalReturnTo(value: string): string {
  const candidate = String(value || "").trim();
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  const segments = candidate.split("/").filter(Boolean).map((segment) => segment.trim().toLowerCase());
  if (segments.includes("undefined") || candidate.toLowerCase().includes("/undefined")) return "/";
  return candidate;
}
