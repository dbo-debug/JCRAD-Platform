import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCodeForTokens, fetchGoogleUserEmail, getGoogleOAuthConfig, upsertGmailConnection } from "@/lib/email/gmail";

const GMAIL_OAUTH_STATE_COOKIE = "jcrad_gmail_oauth_state";
const GMAIL_OAUTH_RETURN_TO_COOKIE = "jcrad_gmail_oauth_return_to";
const GMAIL_OAUTH_STATUS_COOKIE = "jcrad_gmail_oauth_status";

function clearOAuthCookies(response: NextResponse) {
  for (const name of [GMAIL_OAUTH_STATE_COOKIE, GMAIL_OAUTH_RETURN_TO_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }
}

function setStatusCookie(response: NextResponse, value: string) {
  response.cookies.set({
    name: GMAIL_OAUTH_STATUS_COOKIE,
    value,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
}

function toRedirectUrl(origin: string, path: string) {
  return `${origin}${path.startsWith("/") ? path : "/workspace/customers"}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");
  const savedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value || "";
  const returnTo = cookieStore.get(GMAIL_OAUTH_RETURN_TO_COOKIE)?.value || "/workspace/customers";

  const response = NextResponse.redirect(toRedirectUrl(requestUrl.origin, returnTo));
  clearOAuthCookies(response);

  if (!getGoogleOAuthConfig()) {
    setStatusCookie(response, "Google OAuth is not configured for this environment.");
    return response;
  }

  if (!state || !savedState || state !== savedState) {
    setStatusCookie(response, "Google mailbox connection could not be verified. Start the connection flow again.");
    return response;
  }

  if (oauthError) {
    const detail = String(oauthErrorDescription || oauthError).trim();
    setStatusCookie(response, detail || "Google mailbox authorization was blocked or cancelled.");
    return response;
  }

  if (!code) {
    setStatusCookie(response, "Google mailbox authorization did not return a code.");
    return response;
  }

  const supabase = await createClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    setStatusCookie(response, "You need to sign in again before connecting a Gmail mailbox.");
    return response;
  }

  try {
    const tokens = await exchangeGoogleCodeForTokens(code);
    const gmailEmail = await fetchGoogleUserEmail(tokens.accessToken);
    await upsertGmailConnection({
      userId: authData.user.id,
      gmailEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiryAt: tokens.expiryAt,
      scopes: tokens.scopes,
    });

    setStatusCookie(response, `connected:${gmailEmail}`);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google mailbox connection failed";
    setStatusCookie(response, message);
    return response;
  }
}
