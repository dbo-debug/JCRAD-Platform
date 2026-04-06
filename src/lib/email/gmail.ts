import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptGmailToken,
  encryptGmailToken,
  getGmailTokenEncryptionVersion,
  hasGmailTokenEncryptionKey,
} from "@/lib/email/gmailTokenCrypto";

type GenericRow = Record<string, unknown>;
type GmailConnectionRow = {
  id: string;
  user_id: string;
  gmail_email: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry_at: string | null;
  scopes: string[];
};

type GmailOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiryAt: string | null;
  scopes: string[];
  idToken: string | null;
};

export type GmailConnectionStatus =
  | { ok: true; connection: { id: string; gmailEmail: string; scopes: string[]; tokenExpiryAt: string | null } }
  | { ok: false; error: string; code: "missing_oauth_config" | "missing_connection" | "refresh_failed" | "missing_encryption_key" };

export type GmailSendArgs = {
  userId: string;
  gmailConnectionId?: string | null;
  toEmail: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  ccEmails?: string[];
  bccEmails?: string[];
};

export type GmailSendResult =
  | {
      ok: true;
      gmailConnectionId: string;
      gmailEmail: string;
      providerMessageId: string | null;
      providerThreadId: string | null;
    }
  | {
      ok: false;
      gmailConnectionId: string | null;
      gmailEmail: string | null;
      error: string;
      code: "missing_oauth_config" | "missing_connection" | "refresh_failed" | "provider_error" | "missing_encryption_key";
    };

type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decryptConnectionToken(row: GenericRow, encryptedField: "encrypted_access_token" | "encrypted_refresh_token", plaintextField: "access_token" | "refresh_token") {
  const encrypted = asText(row[encryptedField]);
  if (encrypted) {
    return decryptGmailToken(encrypted);
  }
  return asText(row[plaintextField]);
}

function normalizeGmailConnectionRow(row: GenericRow | null): GmailConnectionRow | null {
  if (!row) return null;
  const id = asText(row.id);
  const userId = asText(row.user_id);
  const gmailEmail = asText(row.gmail_email);
  const accessToken = decryptConnectionToken(row, "encrypted_access_token", "access_token");
  if (!id || !userId || !gmailEmail || !accessToken) return null;

  return {
    id,
    user_id: userId,
    gmail_email: gmailEmail,
    access_token: accessToken,
    refresh_token: decryptConnectionToken(row, "encrypted_refresh_token", "refresh_token"),
    token_expiry_at: asText(row.token_expiry_at),
    scopes: toStringArray(row.scopes),
  };
}

function getGmailConnectionSelectColumns() {
  return [
    "id",
    "user_id",
    "gmail_email",
    "access_token",
    "refresh_token",
    "encrypted_access_token",
    "encrypted_refresh_token",
    "token_expiry_at",
    "scopes",
  ].join(", ");
}

function getEncryptedTokenPayload(tokens: { accessToken: string; refreshToken: string | null; expiryAt: string | null; scopes: string[] }) {
  return {
    encrypted_access_token: encryptGmailToken(tokens.accessToken),
    encrypted_refresh_token: tokens.refreshToken ? encryptGmailToken(tokens.refreshToken) : null,
    access_token: null,
    refresh_token: null,
    token_expiry_at: tokens.expiryAt,
    scopes: tokens.scopes,
    token_encryption_version: getGmailTokenEncryptionVersion(),
    token_encrypted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function upsertGmailConnection(args: {
  userId: string;
  gmailEmail: string;
  accessToken: string;
  refreshToken: string | null;
  expiryAt: string | null;
  scopes: string[];
}) {
  if (!hasGmailTokenEncryptionKey()) {
    throw new Error("Missing GMAIL_TOKEN_ENCRYPTION_KEY or invalid format. Expected base64:<base64-32-byte-key>.");
  }

  const admin = createAdminClient();
  const payload = {
    user_id: args.userId,
    provider: "gmail",
    gmail_email: args.gmailEmail,
    ...getEncryptedTokenPayload({
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiryAt: args.expiryAt,
      scopes: args.scopes,
    }),
  };

  const { data, error } = await admin
    .from("gmail_connections")
    .upsert(payload, { onConflict: "user_id,provider" })
    .select(getGmailConnectionSelectColumns())
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeGmailConnectionRow((data || null) as GenericRow | null);
}

export function getGoogleOAuthConfig(): GmailOAuthConfig | null {
  const clientId = asText(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = asText(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = asText(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleOAuthUrl(args: { state: string }) {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URI");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", args.state);
  return url.toString();
}

function parseTokenResponse(json: Record<string, unknown>): GmailOAuthTokens {
  return {
    accessToken: asText(json.access_token) || "",
    refreshToken: asText(json.refresh_token),
    expiryAt:
      typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
        ? new Date(Date.now() + Math.max(0, Number(json.expires_in) - 60) * 1000).toISOString()
        : null,
    scopes: String(json.scope || "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
    idToken: asText(json.id_token),
  };
}

export async function exchangeGoogleCodeForTokens(code: string): Promise<GmailOAuthTokens> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new Error("Missing Google OAuth configuration");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = asText(json.error_description) || asText(json.error) || `Google token exchange failed (${res.status})`;
    throw new Error(message);
  }

  const tokens = parseTokenResponse(json);
  if (!tokens.accessToken) {
    throw new Error("Google token exchange did not return an access token");
  }

  return tokens;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const email = asText(json.email);
  if (!res.ok || !email) {
    throw new Error(asText(json.error_description) || asText(json.error) || "Unable to read Google account email");
  }
  return email;
}

async function refreshAccessToken(refreshToken: string): Promise<GmailOAuthTokens> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new Error("Missing Google OAuth configuration");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = asText(json.error_description) || asText(json.error) || `Google token refresh failed (${res.status})`;
    throw new Error(message);
  }

  const tokens = parseTokenResponse(json);
  if (!tokens.accessToken) {
    throw new Error("Google token refresh did not return an access token");
  }
  return tokens;
}

function isTokenExpired(tokenExpiryAt: string | null) {
  const expiry = Date.parse(String(tokenExpiryAt || ""));
  if (!Number.isFinite(expiry)) return false;
  return expiry <= Date.now() + 30_000;
}

export async function getGmailConnectionStatus(userId: string): Promise<GmailConnectionStatus> {
  if (!getGoogleOAuthConfig()) {
    return { ok: false, error: "Google OAuth is not configured for this environment.", code: "missing_oauth_config" };
  }
  if (!hasGmailTokenEncryptionKey()) {
    return {
      ok: false,
      error: "Gmail token encryption is not configured. Expected GMAIL_TOKEN_ENCRYPTION_KEY=base64:<base64-32-byte-key>.",
      code: "missing_encryption_key",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gmail_connections")
    .select(getGmailConnectionSelectColumns())
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, code: "missing_connection" };
  }

  let row: GmailConnectionRow | null = null;
  try {
    row = normalizeGmailConnectionRow((data || null) as GenericRow | null);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to decrypt Gmail connection tokens",
      code: "refresh_failed",
    };
  }

  if (!row) {
    return { ok: false, error: "Connect a Google account before sending route emails.", code: "missing_connection" };
  }

  const refreshed = await ensureFreshGmailConnection(row);
  if (!refreshed.ok) return refreshed;

  return {
    ok: true,
    connection: {
      id: refreshed.connection.id,
      gmailEmail: refreshed.connection.gmail_email,
      scopes: refreshed.connection.scopes,
      tokenExpiryAt: refreshed.connection.token_expiry_at,
    },
  };
}

async function ensureFreshGmailConnection(
  connection: GmailConnectionRow
): Promise<
  | { ok: true; connection: GmailConnectionRow }
  | { ok: false; error: string; code: "missing_oauth_config" | "refresh_failed" | "missing_connection" | "missing_encryption_key" }
> {
  if (!isTokenExpired(connection.token_expiry_at)) {
    return { ok: true, connection };
  }

  if (!getGoogleOAuthConfig()) {
    return { ok: false, error: "Google OAuth is not configured for this environment.", code: "missing_oauth_config" };
  }
  if (!hasGmailTokenEncryptionKey()) {
    return {
      ok: false,
      error: "Gmail token encryption is not configured. Expected GMAIL_TOKEN_ENCRYPTION_KEY=base64:<base64-32-byte-key>.",
      code: "missing_encryption_key",
    };
  }
  if (!connection.refresh_token) {
    return { ok: false, error: "Reconnect the Google mailbox to refresh access.", code: "refresh_failed" };
  }

  try {
    const refreshed = await refreshAccessToken(connection.refresh_token);
    const admin = createAdminClient();
    const payload = getEncryptedTokenPayload({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || connection.refresh_token,
      expiryAt: refreshed.expiryAt,
      scopes: refreshed.scopes.length > 0 ? refreshed.scopes : connection.scopes,
    });

    const { data, error } = await admin
      .from("gmail_connections")
      .update(payload)
      .eq("id", connection.id)
      .select(getGmailConnectionSelectColumns())
      .single();

    if (error) {
      return { ok: false, error: error.message, code: "refresh_failed" };
    }

    const row = normalizeGmailConnectionRow((data || null) as GenericRow | null);
    if (!row) {
      return { ok: false, error: "Refreshed Gmail connection could not be loaded.", code: "refresh_failed" };
    }

    return { ok: true, connection: row };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to refresh Google access token",
      code: "refresh_failed",
    };
  }
}

async function loadActiveConnection(args: { userId: string; gmailConnectionId?: string | null }) {
  if (!getGoogleOAuthConfig()) {
    return { ok: false as const, error: "Google OAuth is not configured for this environment.", code: "missing_oauth_config" as const };
  }
  if (!hasGmailTokenEncryptionKey()) {
    return {
      ok: false as const,
      error: "Gmail token encryption is not configured. Expected GMAIL_TOKEN_ENCRYPTION_KEY=base64:<base64-32-byte-key>.",
      code: "missing_encryption_key" as const,
    };
  }

  const admin = createAdminClient();
  let query = admin
    .from("gmail_connections")
    .select(getGmailConnectionSelectColumns())
    .eq("provider", "gmail")
    .eq("user_id", args.userId);

  if (args.gmailConnectionId) {
    query = query.eq("id", args.gmailConnectionId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return { ok: false as const, error: error.message, code: "missing_connection" as const };
  }

  let row: GmailConnectionRow | null = null;
  try {
    row = normalizeGmailConnectionRow((data || null) as GenericRow | null);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to decrypt Gmail connection tokens",
      code: "refresh_failed" as const,
    };
  }

  if (!row) {
    return { ok: false as const, error: "Connect a Google account before sending route emails.", code: "missing_connection" as const };
  }

  return ensureFreshGmailConnection(row);
}

function buildMessageHeaders(args: {
  from: string;
  to: string;
  subject: string;
  ccEmails?: string[];
  bccEmails?: string[];
  boundary?: string | null;
}) {
  const lines = [
    "MIME-Version: 1.0",
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
  ];

  if (args.ccEmails && args.ccEmails.length > 0) {
    lines.push(`Cc: ${args.ccEmails.join(", ")}`);
  }
  if (args.bccEmails && args.bccEmails.length > 0) {
    lines.push(`Bcc: ${args.bccEmails.join(", ")}`);
  }
  if (args.boundary) {
    lines.push(`Content-Type: multipart/alternative; boundary="${args.boundary}"`);
  }

  return lines;
}

function buildGmailRawMessage(args: {
  from: string;
  to: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  ccEmails?: string[];
  bccEmails?: string[];
}) {
  const bodyText = asText(args.bodyText) || "";
  const bodyHtml = asText(args.bodyHtml);

  if (bodyHtml) {
    const boundary = `jcrad-${crypto.randomUUID()}`;
    const headers = buildMessageHeaders({ ...args, boundary });
    const lines = [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      bodyText,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      bodyHtml,
      `--${boundary}--`,
      "",
    ];
    return base64UrlEncode(lines.join("\r\n"));
  }

  const lines = [
    ...buildMessageHeaders({ ...args, boundary: null }),
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyText,
    "",
  ];

  return base64UrlEncode(lines.join("\r\n"));
}

export async function sendGmailMessage(args: GmailSendArgs): Promise<GmailSendResult> {
  const connectionResult = await loadActiveConnection({
    userId: args.userId,
    gmailConnectionId: args.gmailConnectionId,
  });

  if (!connectionResult.ok) {
    return {
      ok: false,
      gmailConnectionId: null,
      gmailEmail: null,
      error: connectionResult.error,
      code: connectionResult.code,
    };
  }

  const connection = connectionResult.connection;
  const raw = buildGmailRawMessage({
    from: connection.gmail_email,
    to: args.toEmail,
    subject: args.subject,
    bodyText: args.bodyText,
    bodyHtml: args.bodyHtml,
    ccEmails: args.ccEmails,
    bccEmails: args.bccEmails,
  });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const providerError =
      asText((json.error as Record<string, unknown> | undefined)?.message) ||
      asText(json.error_description) ||
      `Gmail send failed (${res.status})`;

    return {
      ok: false,
      gmailConnectionId: connection.id,
      gmailEmail: connection.gmail_email,
      error: providerError,
      code: "provider_error",
    };
  }

  return {
    ok: true,
    gmailConnectionId: connection.id,
    gmailEmail: connection.gmail_email,
    providerMessageId: asText(json.id),
    providerThreadId: asText(json.threadId),
  };
}
