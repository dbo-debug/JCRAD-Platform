import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import {
  buildCampaignImageObjectPath,
  EMAIL_CAMPAIGN_IMAGE_BUCKET,
  extensionFromCampaignImage,
  loadManagedCampaign,
  MAX_EMAIL_CAMPAIGN_IMAGE_BYTES,
} from "@/lib/emailCampaigns";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const admin = createAdminClient();

  try {
    await loadManagedCampaign({
      admin,
      campaignId: id,
      staffUserId: staff.userId,
      staffRole: staff.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_EMAIL_CAMPAIGN_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
  }

  const ext = extensionFromCampaignImage(file);
  if (!ext) {
    return NextResponse.json({ error: "Image must be jpg, jpeg, or png." }, { status: 400 });
  }

  const objectPath = buildCampaignImageObjectPath({
    userId: staff.userId,
    campaignId: id,
    fileName: file.name || "creative",
    extension: ext,
  });

  const upload = await admin.storage.from(EMAIL_CAMPAIGN_IMAGE_BUCKET).upload(objectPath, file, {
    upsert: true,
    contentType: String(file.type || "").trim() || "application/octet-stream",
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: publicData } = admin.storage.from(EMAIL_CAMPAIGN_IMAGE_BUCKET).getPublicUrl(objectPath);
  const imageUrl = String(publicData?.publicUrl || "").trim();
  const imagePath = `${EMAIL_CAMPAIGN_IMAGE_BUCKET}:${objectPath}`;

  const { error } = await admin
    .from("email_campaigns")
    .update({
      image_path: imagePath,
      image_url: imageUrl || null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    image_path: imagePath,
    image_url: imageUrl || null,
  });
}
