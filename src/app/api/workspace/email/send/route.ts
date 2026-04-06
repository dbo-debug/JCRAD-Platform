import { NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/email/gmail";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

type EmailRecipientInput = {
  customer_id?: unknown;
  contact_id?: unknown;
  email?: unknown;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asOptionalArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const items = value.map((item) => asText(item)).filter((item): item is string => Boolean(item));
  return items;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function dedupeEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSimpleHtmlBody(bodyText: string) {
  return `<div>${escapeHtml(bodyText).replace(/\n/g, "<br />")}</div>`;
}

function parseRecipients(input: unknown, fallbackCustomerId: string | null): Array<{ customerId: string; contactId: string | null; email: string }> {
  if (!Array.isArray(input)) return [];

  const recipients: Array<{ customerId: string; contactId: string | null; email: string }> = [];

  for (const item of input as EmailRecipientInput[]) {
    const email = asText(item?.email);
    if (!email) continue;
    const normalizedEmail = email.toLowerCase();
    if (!isValidEmail(normalizedEmail)) continue;
    const customerId = asText(item?.customer_id) || fallbackCustomerId;
    if (!customerId) continue;
    recipients.push({
      customerId,
      contactId: asText(item?.contact_id),
      email: normalizedEmail,
    });
  }

  return recipients;
}

async function lookupCustomerContactMap(contactIds: string[]) {
  if (contactIds.length === 0) return new Map<string, string>();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customer_contacts")
    .select("id, customer_id")
    .in("id", contactIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data || []) as Array<Record<string, unknown>>)
      .map((row) => [String(row.id || "").trim(), String(row.customer_id || "").trim()] as const)
      .filter(([contactId, customerId]) => Boolean(contactId) && Boolean(customerId))
  );
}

async function insertCustomerActivity(args: {
  customerId: string;
  actorUserId: string;
  activityType: "email_sent" | "email_failed";
  summary: string;
  details: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("customer_activity").insert({
    customer_id: args.customerId,
    activity_type: args.activityType,
    summary: args.summary,
    details: args.details,
    actor_user_id: args.actorUserId,
  });
}

export async function POST(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const subject = asText(body.subject);
  const bodyText = asText(body.body);
  const customerId = asText(body.customer_id);
  const batchLabel = asText(body.batch_label);
  const area = asText(body.area);
  const routeDay = asText(body.route_day);
  const ccEmails = dedupeEmails(asOptionalArray(body.cc_emails) || []).filter(isValidEmail);
  const bccEmails = dedupeEmails(asOptionalArray(body.bcc_emails) || []).filter(isValidEmail);
  const recipients = parseRecipients(body.recipients, customerId);

  if (!subject) {
    return NextResponse.json({ error: "subject required" }, { status: 400 });
  }

  if (!bodyText) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one valid recipient email." }, { status: 400 });
  }

  if (recipients.length > 50) {
    return NextResponse.json({ error: "A single send request can include at most 50 recipients." }, { status: 400 });
  }

  const contactToCustomerId = await lookupCustomerContactMap(
    recipients.map((recipient) => recipient.contactId).filter((value): value is string => Boolean(value))
  );

  const admin = createAdminClient();
  const results: Array<{
    customerId: string;
    contactId: string | null;
    toEmail: string;
    status: "sent" | "failed";
    providerMessageId: string | null;
    providerThreadId: string | null;
    gmailEmail: string | null;
    error: string | null;
  }> = [];

  for (const recipient of recipients) {
    const effectiveCustomerId = recipient.contactId ? contactToCustomerId.get(recipient.contactId) || recipient.customerId : recipient.customerId;
    const bodyHtml = buildSimpleHtmlBody(bodyText);
    const { data: outboundRow, error: outboundInsertError } = await admin
      .from("outbound_emails")
      .insert({
        customer_id: effectiveCustomerId,
        contact_id: recipient.contactId,
        actor_user_id: staff.userId,
        gmail_email: "pending",
        to_email: recipient.email,
        cc_emails: ccEmails.length > 0 ? ccEmails : null,
        bcc_emails: bccEmails.length > 0 ? bccEmails : null,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        provider: "gmail",
        status: "queued",
      })
      .select("id")
      .single();

    if (outboundInsertError || !outboundRow?.id) {
      return NextResponse.json({ error: outboundInsertError?.message || "Unable to queue outbound email log." }, { status: 500 });
    }

    const sendResult = await sendGmailMessage({
      userId: staff.userId,
      toEmail: recipient.email,
      subject,
      bodyText,
      bodyHtml,
      ccEmails,
      bccEmails,
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

      await insertCustomerActivity({
        customerId: effectiveCustomerId,
        actorUserId: staff.userId,
        activityType: "email_sent",
        summary: "Sent sales route email",
        details: {
          to: recipient.email,
          subject,
          provider: "gmail",
          status: "sent",
          provider_message_id: sendResult.providerMessageId,
          provider_thread_id: sendResult.providerThreadId,
          gmail_email: sendResult.gmailEmail,
          batch_label: batchLabel,
          area,
          route_day: routeDay,
          outbound_email_id: outboundRow.id,
          contact_id: recipient.contactId,
        },
      });

      results.push({
        customerId: effectiveCustomerId,
        contactId: recipient.contactId,
        toEmail: recipient.email,
        status: "sent",
        providerMessageId: sendResult.providerMessageId,
        providerThreadId: sendResult.providerThreadId,
        gmailEmail: sendResult.gmailEmail,
        error: null,
      });
      continue;
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

    await insertCustomerActivity({
      customerId: effectiveCustomerId,
      actorUserId: staff.userId,
      activityType: "email_failed",
      summary: "Sales route email failed",
      details: {
        to: recipient.email,
        subject,
        provider: "gmail",
        status: "failed",
        provider_message_id: null,
        provider_thread_id: null,
        gmail_email: sendResult.gmailEmail,
        batch_label: batchLabel,
        area,
        route_day: routeDay,
        error: sendResult.error,
        outbound_email_id: outboundRow.id,
        contact_id: recipient.contactId,
      },
    });

    results.push({
      customerId: effectiveCustomerId,
      contactId: recipient.contactId,
      toEmail: recipient.email,
      status: "failed",
      providerMessageId: null,
      providerThreadId: null,
      gmailEmail: sendResult.gmailEmail,
      error: sendResult.error,
    });
  }

  return NextResponse.json({
    ok: true,
    sentCount: results.filter((item) => item.status === "sent").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    results,
  });
}
