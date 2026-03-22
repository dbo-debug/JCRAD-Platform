import { normalizeCustomerApprovalStatus } from "@/lib/customerApproval";

type GenericProfile = Record<string, unknown> | null;

export type EstimatorAccess = {
  canAccess: boolean;
  profileStatus: string;
  reason: string;
};

function normalizeStatus(profile: GenericProfile): string {
  return normalizeCustomerApprovalStatus(profile?.approval_status);
}

export function getEstimatorAccess(profile: GenericProfile): EstimatorAccess {
  if (!profile) {
    return { canAccess: false, profileStatus: "missing_profile", reason: "Profile is missing." };
  }

  const verificationStatus = normalizeStatus(profile);
  if (verificationStatus === "approved") {
    return { canAccess: true, profileStatus: verificationStatus, reason: "Profile verification status is allowed." };
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
