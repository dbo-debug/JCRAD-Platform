import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function asText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function loadLocalEnv() {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "web", ".env.local"),
  ];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getRawEncryptionKey() {
  const raw = asText(process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
  if (!raw || !raw.startsWith("base64:")) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must use the format base64:<base64-32-byte-key>");
  }

  const key = Buffer.from(raw.slice("base64:".length).trim(), "base64");
  if (key.length !== 32) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function encryptToken(value) {
  const key = getRawEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

function createAdminSupabase() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  getRawEncryptionKey();
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("gmail_connections")
    .select("id, user_id, gmail_email, access_token, refresh_token, encrypted_access_token, encrypted_refresh_token");

  if (error) throw new Error(error.message);

  const rows = (data || []).filter((row) => {
    const hasPlaintext = Boolean(asText(row.access_token) || asText(row.refresh_token));
    const missingEncryptedAccess = !asText(row.encrypted_access_token) && Boolean(asText(row.access_token));
    const missingEncryptedRefresh = !asText(row.encrypted_refresh_token) && Boolean(asText(row.refresh_token));
    return hasPlaintext || missingEncryptedAccess || missingEncryptedRefresh;
  });

  if (rows.length === 0) {
    console.log("No gmail_connections rows require token backfill.");
    return;
  }

  console.log(`Found ${rows.length} gmail_connections row(s) to inspect.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = asText(row.id);
    if (!id) {
      skipped += 1;
      continue;
    }

    const accessToken = asText(row.access_token);
    const refreshToken = asText(row.refresh_token);
    const encryptedAccessToken = asText(row.encrypted_access_token);
    const encryptedRefreshToken = asText(row.encrypted_refresh_token);

    const payload = {
      token_encryption_version: 1,
      token_encrypted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let changed = false;

    if (!encryptedAccessToken && accessToken) {
      payload.encrypted_access_token = encryptToken(accessToken);
      payload.access_token = null;
      changed = true;
    }

    if (!encryptedRefreshToken && refreshToken) {
      payload.encrypted_refresh_token = encryptToken(refreshToken);
      payload.refresh_token = null;
      changed = true;
    }

    if (!changed) {
      skipped += 1;
      continue;
    }

    console.log(`${apply ? "Updating" : "Would update"} gmail_connections ${id} (${asText(row.gmail_email) || asText(row.user_id) || "unknown"})`);

    if (apply) {
      const { error: updateError } = await supabase.from("gmail_connections").update(payload).eq("id", id);
      if (updateError) {
        throw new Error(`Failed updating ${id}: ${updateError.message}`);
      }
    }

    updated += 1;
  }

  console.log(JSON.stringify({ apply, updated, skipped, totalInspected: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
