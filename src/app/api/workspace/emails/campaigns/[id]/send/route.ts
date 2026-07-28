import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderCampaignEmail } from "@/lib/email/campaignRenderer";
import { sendGmailMessage } from "@/lib/email/gmail";
import { getCrmCommunicationsEmailStatus } from "@/lib/email/crmEmailIdentities";
import { sendLoggedOutboundEmail } from "@/lib/email/outbound";
import { loadManagedCampaign } from "@/lib/emailCampaigns";
import { getStaffContext } from "@/lib/getStaffContext";

type RecipientInput = {
  customer_id?: unknown;
  contact_id?: unknown;
  email?: unknown;
  company_name?: unknown;
  contact_name?: unknown;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function parseRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: Array<{
    customerId: string;
    contactId: string | null;
    email: string;
    companyName: string | null;
    contactName: string | null;
  }> = [];

  for (const item of value as RecipientInput[]) {
    const customerId = asText(item.customer_id);
    const email = asText(item.email)?.toLowerCase() || null;
    if (!customerId || !isValidEmail(email) || seen.has(email!)) continue;
    seen.add(email!);
    rows.push({
      customerId,
      contactId: asText(item.contact_id),
      email: email!,
      companyName: asText(item.company_name),
      contactName: asText(item.contact_name),
    });
  }

  return rows;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  let campaign: Record<string, unknown>;
  try {
    campaign = await loadManagedCampaign({
      admin,
      campaignId: id,
      staffUserId: staff.userId,
      staffRole: staff.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 404 });
  }

  const gmailStatus = await getCrmCommunicationsEmailStatus(staff.userId);
  if (!gmailStatus.ok) {
    return NextResponse.json({ error: gmailStatus.error }, { status: 400 });
  }

  const imageUrl = asText(campaign.image_url);
  const subject = asText(campaign.subject);
  if (!imageUrl || !subject) {
    return NextResponse.json({ error: "Campaign needs a subject and uploaded image before sending." }, { status: 400 });
  }

  const rendered = renderCampaignEmail({
    subject,
    preheader: asText(campaign.preheader),
    introText: asText(campaign.intro_text),
    imageUrl,
    imageAltText: asText(campaign.image_alt_text),
    primaryCtaLabel: asText(campaign.primary_cta_label),
    primaryCtaUrl: asText(campaign.primary_cta_url),
    secondaryCtaLabel: asText(campaign.secondary_cta_label),
    secondaryCtaUrl: asText(campaign.secondary_cta_url),
    includeVapeComplianceFooter: campaign.include_vape_compliance_footer === true,
  });

  if (body.test === true) {
    const testSend = await sendGmailMessage({
      userId: staff.userId,
      toEmail: gmailStatus.connection.gmailEmail,
      subject: `[Test] ${subject}`,
      bodyText: rendered.text,
      bodyHtml: rendered.html,
    });

    if (!testSend.ok) {
      return NextResponse.json({ error: testSend.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      mode: "test",
      to: gmailStatus.connection.gmailEmail,
      provider_message_id: testSend.providerMessageId,
      provider_thread_id: testSend.providerThreadId,
    });
  }

  const recipients = parseRecipients(body.recipients);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Select at least one valid recipient." }, { status: 400 });
  }
  if (recipients.length > 50) {
    return NextResponse.json({ error: "Campaign sends are limited to 50 recipients per action." }, { status: 400 });
  }

  await admin.from("email_campaign_recipients").upsert(
    recipients.map((recipient) => ({
      campaign_id: id,
      customer_id: recipient.customerId,
      contact_id: recipient.contactId,
      email: recipient.email,
      company_name: recipient.companyName,
      contact_name: recipient.contactName,
      status: "queued",
      error_message: null,
      outbound_email_id: null,
      provider_message_id: null,
      provider_thread_id: null,
      sent_at: null,
    })),
    { onConflict: "campaign_id,email" }
  );

  const results: Array<{
    email: string;
    status: "sent" | "failed";
    outbound_email_id: string | null;
    provider_message_id: string | null;
    provider_thread_id: string | null;
    error: string | null;
  }> = [];

  for (const recipient of recipients) {
    const sendResult = await sendLoggedOutboundEmail({
      gmailUserId: staff.userId,
      actorUserId: staff.userId,
      customerId: recipient.customerId,
      contactId: recipient.contactId,
      subject,
      bodyText: rendered.text,
      bodyHtml: rendered.html,
      toEmail: recipient.email,
      batchLabel: asText(campaign.batch_label),
      area: asText(campaign.territory_code),
      routeDay: asText(campaign.route_day),
      activitySummarySent: "Sent sales campaign email",
      activitySummaryFailed: "Sales campaign email failed",
      activityDetailsExtra: {
        campaign_id: id,
        campaign_name: asText(campaign.name),
      },
    });

    const recipientUpdate =
      sendResult.status === "sent"
        ? {
            status: "sent",
            outbound_email_id: sendResult.outboundEmailId,
            provider_message_id: sendResult.providerMessageId,
            provider_thread_id: sendResult.providerThreadId,
            error_message: null,
            sent_at: new Date().toISOString(),
            last_event_at: new Date().toISOString(),
            bounced_at: null,
            bounce_reason: null,
            replied_at: null,
            reply_message_id: null,
            reply_from_email: null,
          }
        : {
            status: "failed",
            outbound_email_id: sendResult.outboundEmailId,
            provider_message_id: null,
            provider_thread_id: null,
            error_message: sendResult.error,
            last_event_at: null,
          };

    await admin
      .from("email_campaign_recipients")
      .update(recipientUpdate)
      .eq("campaign_id", id)
      .eq("email", recipient.email);

    results.push({
      email: recipient.email,
      status: sendResult.status,
      outbound_email_id: sendResult.outboundEmailId,
      provider_message_id: sendResult.providerMessageId,
      provider_thread_id: sendResult.providerThreadId,
      error: sendResult.error,
    });
  }

  await admin
    .from("email_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    sentCount: results.filter((item) => item.status === "sent").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    results,
  });
}
