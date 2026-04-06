import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";
import { normalizeCampaignCtaPair, normalizeCampaignText } from "@/lib/emailCampaigns";

export async function POST(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = normalizeCampaignText(body.name) || "New email campaign";
  const subject = normalizeCampaignText(body.subject) || "New email";
  const primaryCta = normalizeCampaignCtaPair(body.primary_cta_label, body.primary_cta_url);
  const secondaryCta = normalizeCampaignCtaPair(body.secondary_cta_label, body.secondary_cta_url);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_campaigns")
    .insert({
      created_by_user_id: staff.userId,
      name,
      subject,
      primary_cta_label: primaryCta.label,
      primary_cta_url: primaryCta.url,
      secondary_cta_label: secondaryCta.label,
      secondary_cta_url: secondaryCta.url,
      include_vape_compliance_footer: false,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: String(data?.id || "") });
}
