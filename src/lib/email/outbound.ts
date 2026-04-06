import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailMessage } from "@/lib/email/gmail";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export type LoggedOutboundSendArgs = {
  gmailUserId: string;
  actorUserId: string;
  customerId: string;
  contactId?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  toEmail: string;
  ccEmails?: string[];
  bccEmails?: string[];
  batchLabel?: string | null;
  area?: string | null;
  routeDay?: string | null;
  activitySummarySent?: string;
  activitySummaryFailed?: string;
  activityDetailsExtra?: Record<string, unknown>;
};

export type LoggedOutboundSendResult = {
  status: "sent" | "failed";
  outboundEmailId: string | null;
  gmailConnectionId: string | null;
  gmailEmail: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  error: string | null;
};

export async function sendLoggedOutboundEmail(args: LoggedOutboundSendArgs): Promise<LoggedOutboundSendResult> {
  const admin = createAdminClient();
  const { data: outboundRow, error: outboundInsertError } = await admin
    .from("outbound_emails")
    .insert({
      customer_id: args.customerId,
      contact_id: args.contactId || null,
      actor_user_id: args.actorUserId,
      gmail_email: "pending",
      to_email: args.toEmail,
      cc_emails: args.ccEmails && args.ccEmails.length > 0 ? args.ccEmails : null,
      bcc_emails: args.bccEmails && args.bccEmails.length > 0 ? args.bccEmails : null,
      subject: args.subject,
      body_text: args.bodyText || null,
      body_html: args.bodyHtml || null,
      provider: "gmail",
      status: "queued",
    })
    .select("id")
    .single();

  if (outboundInsertError || !outboundRow?.id) {
    throw new Error(outboundInsertError?.message || "Unable to queue outbound email log.");
  }

  const sendResult = await sendGmailMessage({
    userId: args.gmailUserId,
    toEmail: args.toEmail,
    subject: args.subject,
    bodyText: args.bodyText,
    bodyHtml: args.bodyHtml,
    ccEmails: args.ccEmails,
    bccEmails: args.bccEmails,
  });

  if (sendResult.ok) {
    await admin
      .from("outbound_emails")
      .update({
        gmail_connection_id: sendResult.gmailConnectionId,
        gmail_email: sendResult.gmailEmail,
        provider_message_id: sendResult.providerMessageId,
        provider_thread_id: sendResult.providerThreadId,
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", outboundRow.id);

    await admin.from("customer_activity").insert({
      customer_id: args.customerId,
      activity_type: "email_sent",
      summary: args.activitySummarySent || "Sent sales route email",
      details: {
        to: args.toEmail,
        subject: args.subject,
        provider: "gmail",
        status: "sent",
        provider_message_id: sendResult.providerMessageId,
        provider_thread_id: sendResult.providerThreadId,
        gmail_email: sendResult.gmailEmail,
        batch_label: args.batchLabel || null,
        area: args.area || null,
        route_day: args.routeDay || null,
        outbound_email_id: outboundRow.id,
        contact_id: args.contactId || null,
        ...(args.activityDetailsExtra || {}),
      },
      actor_user_id: args.actorUserId,
    });

    return {
      status: "sent",
      outboundEmailId: outboundRow.id,
      gmailConnectionId: sendResult.gmailConnectionId,
      gmailEmail: sendResult.gmailEmail,
      providerMessageId: sendResult.providerMessageId,
      providerThreadId: sendResult.providerThreadId,
      error: null,
    };
  }

  await admin
    .from("outbound_emails")
    .update({
      gmail_connection_id: sendResult.gmailConnectionId,
      gmail_email: sendResult.gmailEmail || "pending",
      status: "failed",
      error_message: sendResult.error,
    })
    .eq("id", outboundRow.id);

  await admin.from("customer_activity").insert({
    customer_id: args.customerId,
    activity_type: "email_failed",
    summary: args.activitySummaryFailed || "Sales route email failed",
    details: {
      to: args.toEmail,
      subject: args.subject,
      provider: "gmail",
      status: "failed",
      provider_message_id: null,
      provider_thread_id: null,
      gmail_email: sendResult.gmailEmail,
      batch_label: args.batchLabel || null,
      area: args.area || null,
      route_day: args.routeDay || null,
      error: asText(sendResult.error),
      outbound_email_id: outboundRow.id,
      contact_id: args.contactId || null,
      ...(args.activityDetailsExtra || {}),
    },
    actor_user_id: args.actorUserId,
  });

  return {
    status: "failed",
    outboundEmailId: outboundRow.id,
    gmailConnectionId: sendResult.gmailConnectionId,
    gmailEmail: sendResult.gmailEmail,
    providerMessageId: null,
    providerThreadId: null,
    error: asText(sendResult.error),
  };
}
