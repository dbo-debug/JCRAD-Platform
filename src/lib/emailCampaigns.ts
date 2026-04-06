import { CATALOG_PUBLIC_BUCKET } from "@/lib/storageBuckets";

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export const EMAIL_CAMPAIGN_IMAGE_BUCKET = CATALOG_PUBLIC_BUCKET;
export const EMAIL_CAMPAIGN_IMAGE_PREFIX = "email-campaign-creatives";
export const MAX_EMAIL_CAMPAIGN_IMAGE_BYTES = 5 * 1024 * 1024;
export const EMAIL_CAMPAIGN_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export function normalizeCampaignText(value: unknown) {
  return asText(value);
}

export function normalizeCampaignCtaPair(label: unknown, url: unknown) {
  const normalizedLabel = normalizeCampaignText(label);
  const normalizedUrl = normalizeCampaignText(url);

  if (!normalizedLabel || !normalizedUrl) {
    return {
      label: null,
      url: null,
    };
  }

  return {
    label: normalizedLabel,
    url: normalizedUrl,
  };
}

export function normalizeCampaignStatus(value: unknown) {
  const normalized = asText(value)?.toLowerCase();
  return normalized === "draft" || normalized === "sent" || normalized === "archived" ? normalized : null;
}

export function sanitizeFileName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "creative";
}

export function extensionFromCampaignImage(file: File): string | null {
  const fromName = String(file.name || "").split(".").pop()?.trim().toLowerCase() || "";
  if (fromName === "jpg" || fromName === "jpeg" || fromName === "png") {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return EMAIL_CAMPAIGN_IMAGE_MIME_EXTENSIONS[String(file.type || "").toLowerCase()] || null;
}

export function buildCampaignImageObjectPath(args: { userId: string; campaignId: string; fileName: string; extension: string }) {
  const baseName = sanitizeFileName(args.fileName).replace(/\.[a-z0-9]+$/i, "");
  return `${EMAIL_CAMPAIGN_IMAGE_PREFIX}/${args.userId}/${args.campaignId}/${Date.now()}-${baseName}.${args.extension}`;
}

export async function loadManagedCampaign(args: {
  admin: AdminClient;
  campaignId: string;
  staffUserId: string;
  staffRole: "admin" | "sales";
}) {
  const { data, error } = await args.admin
    .from("email_campaigns")
    .select("*")
    .eq("id", args.campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Campaign not found.");
  }
  if (args.staffRole !== "admin" && String(data.created_by_user_id || "") !== args.staffUserId) {
    throw new Error("Forbidden");
  }
  return data as Record<string, unknown>;
}
