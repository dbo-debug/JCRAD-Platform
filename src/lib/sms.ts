export type SmsSendResult =
  | {
      ok: true;
      status: "sent";
      provider: "twilio";
      providerMessageId: string | null;
      to: string;
      error: null;
    }
  | {
      ok: false;
      status: "not_configured" | "invalid_number" | "failed";
      provider: "none" | "twilio";
      providerMessageId: null;
      to: string | null;
      error: string;
    };

type SendSmsArgs = {
  to: string;
  body: string;
};

export const DEFAULT_START_LINK = process.env.JCRAD_START_URL?.trim() || "https://jcradinc.com/start";

export function buildHallOfFlowersSmsBody(startLink = DEFAULT_START_LINK) {
  return `Great meeting you at Hall of Flowers - this is Doug from JC RAD. Here's our live menu and estimate builder: ${startLink}. Reply here with what you're looking for and I'll get you pricing fast.`;
}

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export async function sendSms(args: SendSmsArgs): Promise<SmsSendResult> {
  const body = String(args.body || "").trim();
  const to = normalizePhoneNumber(args.to);

  if (!to) {
    return {
      ok: false,
      status: "invalid_number",
      provider: "none",
      providerMessageId: null,
      to: null,
      error: "Phone number is not in a valid SMS format.",
    };
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER);

  if (!accountSid || !authToken || !from) {
    return {
      ok: false,
      status: "not_configured",
      provider: "none",
      providerMessageId: null,
      to,
      error: "SMS provider is not configured.",
    };
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: body,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        provider: "twilio",
        providerMessageId: null,
        to,
        error: String(payload?.message || `Twilio request failed with status ${response.status}`),
      };
    }

    return {
      ok: true,
      status: "sent",
      provider: "twilio",
      providerMessageId: typeof payload?.sid === "string" ? payload.sid : null,
      to,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      provider: "twilio",
      providerMessageId: null,
      to,
      error: error instanceof Error ? error.message : "Unknown SMS error",
    };
  }
}
