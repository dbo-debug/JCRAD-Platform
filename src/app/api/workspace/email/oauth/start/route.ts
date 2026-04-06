import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGoogleOAuthUrl, getGoogleOAuthConfig } from "@/lib/email/gmail";
import { getStaffContext } from "@/lib/getStaffContext";

const GMAIL_OAUTH_STATE_COOKIE = "jcrad_gmail_oauth_state";
const GMAIL_OAUTH_RETURN_TO_COOKIE = "jcrad_gmail_oauth_return_to";
const GMAIL_OAUTH_STATUS_COOKIE = "jcrad_gmail_oauth_status";

function safeInternalPath(value: string | null, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export async function GET(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = getGoogleOAuthConfig();
  if (!config) {
    return NextResponse.json({ error: "Google OAuth is not configured for this environment." }, { status: 500 });
  }

  const url = new URL(request.url);
  const returnTo = safeInternalPath(url.searchParams.get("returnTo"), "/workspace/customers");
  const state = crypto.randomUUID();
  const cookieStore = await cookies();

  cookieStore.set({
    name: GMAIL_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  cookieStore.set({
    name: GMAIL_OAUTH_RETURN_TO_COOKIE,
    value: returnTo,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  cookieStore.set({
    name: GMAIL_OAUTH_STATUS_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.redirect(buildGoogleOAuthUrl({ state }));
}
