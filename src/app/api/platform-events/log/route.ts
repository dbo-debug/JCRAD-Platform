import { NextResponse } from "next/server";
import { logPlatformEvent } from "@/lib/events/logPlatformEvent";

const ALLOWED_EVENT_TYPES = new Set(["user_login", "user_signup"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const eventType = String(body?.event_type || "").trim().toLowerCase();
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await logPlatformEvent({
    eventType,
    userId: body?.user_id ? String(body.user_id) : null,
    userEmail: body?.user_email ? String(body.user_email) : null,
    metadata: body?.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : {},
  });

  return NextResponse.json({ ok: true });
}

