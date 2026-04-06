import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import { loadManagedCampaign, normalizeCampaignStatus, normalizeCampaignText } from "@/lib/emailCampaigns";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
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

  const payload: Record<string, unknown> = {};
  if ("name" in body) payload.name = normalizeCampaignText(body.name);
  if ("subject" in body) payload.subject = normalizeCampaignText(body.subject);
  if ("preheader" in body) payload.preheader = normalizeCampaignText(body.preheader);
  if ("intro_text" in body) payload.intro_text = normalizeCampaignText(body.intro_text);
  if ("image_path" in body) payload.image_path = normalizeCampaignText(body.image_path);
  if ("image_url" in body) payload.image_url = normalizeCampaignText(body.image_url);
  if ("image_alt_text" in body) payload.image_alt_text = normalizeCampaignText(body.image_alt_text);
  if ("primary_cta_label" in body) payload.primary_cta_label = normalizeCampaignText(body.primary_cta_label);
  if ("primary_cta_url" in body) payload.primary_cta_url = normalizeCampaignText(body.primary_cta_url);
  if ("secondary_cta_label" in body) payload.secondary_cta_label = normalizeCampaignText(body.secondary_cta_label);
  if ("secondary_cta_url" in body) payload.secondary_cta_url = normalizeCampaignText(body.secondary_cta_url);
  if ("batch_label" in body) payload.batch_label = normalizeCampaignText(body.batch_label);
  if ("territory_code" in body) payload.territory_code = normalizeCampaignText(body.territory_code);
  if ("route_day" in body) payload.route_day = normalizeCampaignText(body.route_day);
  if ("status" in body) {
    const status = normalizeCampaignStatus(body.status);
    if (!status) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    payload.status = status;
  }

  const { error } = await admin.from("email_campaigns").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
