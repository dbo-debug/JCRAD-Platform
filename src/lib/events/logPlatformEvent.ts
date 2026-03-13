import { createAdminClient } from "@/lib/supabase/admin";

type LogPlatformEventArgs = {
  eventType: string;
  userId?: string | null;
  userEmail?: string | null;
  metadata?: Record<string, unknown> | null;
};

function trimString(value: unknown, max = 300): string {
  const raw = String(value ?? "").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
}

function compactMetadata(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (typeof value === "string") {
      const next = trimString(value, 500);
      if (next) out[key] = next;
      continue;
    }
    out[key] = value;
  }
  return out;
}

// Lightweight operational event logger. This should never break caller flows.
export async function logPlatformEvent(args: LogPlatformEventArgs): Promise<void> {
  const eventType = trimString(args.eventType || "", 120);
  if (!eventType) return;

  try {
    const supabase = createAdminClient();
    const payload = {
      event_type: eventType,
      user_id: args.userId ? trimString(args.userId, 128) : null,
      user_email: args.userEmail ? trimString(args.userEmail.toLowerCase(), 254) : null,
      metadata: compactMetadata(args.metadata),
    };

    const { error } = await supabase.from("platform_events").insert(payload);
    if (error) {
      console.error("[platform-events] insert failed", { eventType, message: error.message });
    }
  } catch (error) {
    console.error("[platform-events] logger failed", { eventType, error });
  }
}

