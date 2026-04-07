import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveGmailConnectionForUser, gmailApiRequest } from "@/lib/email/gmail";

type GenericRow = Record<string, unknown>;

type MailboxSyncResult = {
  scannedThreads: number;
  scannedBounceMessages: number;
  bouncedCount: number;
  repliedCount: number;
};

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asTimestamp(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeEmail(value: string | null) {
  return value ? value.trim().toLowerCase() : null;
}

function parseEmailAddress(value: string | null) {
  if (!value) return null;
  const match = value.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return normalizeEmail(match ? match[1] : value);
}

function getHeaderValue(message: GenericRow | null, headerName: string) {
  const headers = Array.isArray(message?.payload && (message.payload as GenericRow).headers)
    ? ((message!.payload as GenericRow).headers as Array<Record<string, unknown>>)
    : [];
  const header = headers.find((item) => String(item.name || "").toLowerCase() === headerName.toLowerCase());
  return asText(header?.value);
}

function extractBounceRecipient(message: GenericRow) {
  return (
    parseEmailAddress(getHeaderValue(message, "X-Failed-Recipients")) ||
    parseEmailAddress(getHeaderValue(message, "Final-Recipient")) ||
    parseEmailAddress(asText(message.snippet))
  );
}

function extractBounceReason(message: GenericRow) {
  return (
    asText(getHeaderValue(message, "Subject")) ||
    asText(getHeaderValue(message, "Diagnostic-Code")) ||
    asText(message.snippet) ||
    "Delivery failure detected"
  );
}

function requiresMailboxReconnect(scopes: string[]) {
  return !scopes.includes(GMAIL_READONLY_SCOPE);
}

async function logCustomerActivity(args: {
  customerId: string;
  actorUserId: string | null;
  activityType: string;
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

async function markOutboundEmailBounced(args: {
  outboundEmail: GenericRow;
  bounceMessageId: string | null;
  bouncedAt: string;
  bounceReason: string;
}) {
  const admin = createAdminClient();
  const outboundEmailId = String(args.outboundEmail.id || "");
  const customerId = asText(args.outboundEmail.customer_id);
  const actorUserId = asText(args.outboundEmail.actor_user_id);

  await admin
    .from("outbound_emails")
    .update({
      status: "bounced",
      bounced_at: args.bouncedAt,
      bounce_message_id: args.bounceMessageId,
      bounce_reason: args.bounceReason,
      error_message: args.bounceReason,
      last_event_at: args.bouncedAt,
    })
    .eq("id", outboundEmailId);

  await admin
    .from("email_campaign_recipients")
    .update({
      status: "bounced",
      bounced_at: args.bouncedAt,
      bounce_reason: args.bounceReason,
      error_message: args.bounceReason,
      last_event_at: args.bouncedAt,
    })
    .eq("outbound_email_id", outboundEmailId);

  if (customerId) {
    await logCustomerActivity({
      customerId,
      actorUserId,
      activityType: "email_bounced",
      summary: "Sales campaign email bounced",
      details: {
        to: asText(args.outboundEmail.to_email),
        subject: asText(args.outboundEmail.subject),
        provider: "gmail",
        status: "bounced",
        provider_message_id: asText(args.outboundEmail.provider_message_id),
        provider_thread_id: asText(args.outboundEmail.provider_thread_id),
        gmail_email: asText(args.outboundEmail.gmail_email),
        outbound_email_id: outboundEmailId,
        contact_id: asText(args.outboundEmail.contact_id),
        bounce_message_id: args.bounceMessageId,
        error: args.bounceReason,
      },
    });
  }
}

async function markOutboundEmailReplied(args: {
  outboundEmail: GenericRow;
  replyMessageId: string | null;
  repliedAt: string;
  replyFromEmail: string | null;
}) {
  const admin = createAdminClient();
  const outboundEmailId = String(args.outboundEmail.id || "");
  const customerId = asText(args.outboundEmail.customer_id);
  const actorUserId = asText(args.outboundEmail.actor_user_id);

  await admin
    .from("outbound_emails")
    .update({
      replied_at: args.repliedAt,
      reply_message_id: args.replyMessageId,
      reply_from_email: args.replyFromEmail,
      last_event_at: args.repliedAt,
    })
    .eq("id", outboundEmailId);

  await admin
    .from("email_campaign_recipients")
    .update({
      replied_at: args.repliedAt,
      reply_message_id: args.replyMessageId,
      reply_from_email: args.replyFromEmail,
      last_event_at: args.repliedAt,
    })
    .eq("outbound_email_id", outboundEmailId);

  if (customerId) {
    await logCustomerActivity({
      customerId,
      actorUserId,
      activityType: "email_received",
      summary: "Received email reply",
      details: {
        from: args.replyFromEmail,
        to: asText(args.outboundEmail.to_email),
        subject: asText(args.outboundEmail.subject),
        provider: "gmail",
        status: "replied",
        provider_message_id: asText(args.outboundEmail.provider_message_id),
        provider_thread_id: asText(args.outboundEmail.provider_thread_id),
        gmail_email: asText(args.outboundEmail.gmail_email),
        outbound_email_id: outboundEmailId,
        contact_id: asText(args.outboundEmail.contact_id),
        reply_message_id: args.replyMessageId,
      },
    });
  }
}

export async function syncGmailMailboxOutcomesForUser(userId: string): Promise<MailboxSyncResult> {
  const admin = createAdminClient();
  const connectionResult = await getActiveGmailConnectionForUser({ userId });
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error);
  }

  if (requiresMailboxReconnect(connectionResult.connection.scopes)) {
    throw new Error("Reconnect the Google mailbox to grant Gmail read access before syncing bounces and replies.");
  }

  const gmailConnectionId = connectionResult.connection.id;
  const gmailEmail = normalizeEmail(connectionResult.connection.gmail_email);
  const syncStartedAt = new Date().toISOString();

  const { data: outboundRows, error: outboundError } = await admin
    .from("outbound_emails")
    .select("id, customer_id, contact_id, actor_user_id, gmail_connection_id, gmail_email, to_email, subject, provider_message_id, provider_thread_id, status, sent_at, replied_at, bounced_at")
    .eq("gmail_connection_id", gmailConnectionId)
    .in("status", ["sent", "bounced"])
    .not("provider_thread_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(200);

  if (outboundError) {
    throw new Error(outboundError.message);
  }

  const outboundEmails = (outboundRows || []) as GenericRow[];
  const outboundByRecipient = new Map<string, GenericRow[]>();

  outboundEmails.forEach((row) => {
    const toEmail = normalizeEmail(asText(row.to_email));
    if (toEmail) outboundByRecipient.set(toEmail, [...(outboundByRecipient.get(toEmail) || []), row]);
  });

  let bouncedCount = 0;
  let repliedCount = 0;
  let scannedThreads = 0;
  let scannedBounceMessages = 0;

  for (const outboundEmail of outboundEmails) {
    if (asText(outboundEmail.replied_at)) continue;
    const threadId = asText(outboundEmail.provider_thread_id);
    const sentAt = asTimestamp(outboundEmail.sent_at);
    if (!threadId || sentAt === null) continue;

    const threadResponse = await gmailApiRequest({
      userId,
      gmailConnectionId,
      path: `threads/${encodeURIComponent(threadId)}`,
      searchParams: { format: "metadata", metadataHeaders: ["From"] },
    });

    if (!threadResponse.ok) continue;
    scannedThreads += 1;

    const messages = Array.isArray(threadResponse.data.messages) ? (threadResponse.data.messages as GenericRow[]) : [];
    const replyMessage = messages.find((message) => {
      const messageId = asText(message.id);
      const internalDate = asTimestamp(message.internalDate);
      const fromEmail = parseEmailAddress(getHeaderValue(message, "From"));
      if (!messageId || !fromEmail || internalDate === null) return false;
      if (messageId === asText(outboundEmail.provider_message_id)) return false;
      if (fromEmail === gmailEmail) return false;
      return internalDate >= sentAt;
    });

    if (!replyMessage) continue;

    const repliedAt = new Date(asTimestamp(replyMessage.internalDate) || Date.now()).toISOString();
    await markOutboundEmailReplied({
      outboundEmail,
      replyMessageId: asText(replyMessage.id),
      repliedAt,
      replyFromEmail: parseEmailAddress(getHeaderValue(replyMessage, "From")),
    });
    repliedCount += 1;
  }

  const bounceResponse = await gmailApiRequest({
    userId,
    gmailConnectionId,
    path: "messages",
    searchParams: {
      maxResults: 50,
      q: 'newer_than:30d (from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Mail delivery failed" OR subject:"Undeliverable")',
    },
  });

  if (bounceResponse.ok) {
    const bounceMessages = Array.isArray(bounceResponse.data.messages) ? (bounceResponse.data.messages as GenericRow[]) : [];

    for (const bounceMessage of bounceMessages) {
      const bounceMessageId = asText(bounceMessage.id);
      if (!bounceMessageId) continue;

      const detailResponse = await gmailApiRequest({
        userId,
        gmailConnectionId,
        path: `messages/${encodeURIComponent(bounceMessageId)}`,
        searchParams: {
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date", "X-Failed-Recipients", "Final-Recipient"],
        },
      });

      if (!detailResponse.ok) continue;
      scannedBounceMessages += 1;

      const message = detailResponse.data as GenericRow;
      const recipientEmail = extractBounceRecipient(message);
      if (!recipientEmail) continue;

      const matches = (outboundByRecipient.get(recipientEmail) || []).filter((row) => !asText(row.bounced_at));
      if (matches.length === 0) continue;

      const latestMatch = [...matches]
        .sort((left, right) => (asTimestamp(right.sent_at) || 0) - (asTimestamp(left.sent_at) || 0))[0];
      if (!latestMatch) continue;

      const bouncedAt = new Date(asTimestamp(message.internalDate) || Date.now()).toISOString();
      await markOutboundEmailBounced({
        outboundEmail: latestMatch,
        bounceMessageId,
        bouncedAt,
        bounceReason: extractBounceReason(message),
      });
      bouncedCount += 1;
    }
  }

  await admin
    .from("gmail_connections")
    .update({
      last_mail_sync_at: syncStartedAt,
      last_mail_sync_error: null,
    })
    .eq("id", gmailConnectionId);

  return {
    scannedThreads,
    scannedBounceMessages,
    bouncedCount,
    repliedCount,
  };
}
