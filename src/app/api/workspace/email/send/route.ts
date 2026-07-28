import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoggedOutboundEmail } from "@/lib/email/outbound";
import { getCrmCommunicationsEmailStatus } from "@/lib/email/crmEmailIdentities";

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

export async function POST(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const senderStatus = await getCrmCommunicationsEmailStatus(staff.userId);
  if (!senderStatus.ok) {
    return NextResponse.json({ error: senderStatus.error }, { status: 400 });
  }

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
    const sendResult = await sendLoggedOutboundEmail({
      gmailUserId: staff.userId,
      actorUserId: staff.userId,
      customerId: effectiveCustomerId,
      contactId: recipient.contactId,
      subject,
      bodyText,
      bodyHtml,
      toEmail: recipient.email,
      ccEmails,
      bccEmails,
      batchLabel,
      area,
      routeDay,
    });

    if (sendResult.status === "sent") {
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
