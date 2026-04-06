import crypto from "node:crypto";

const ENCRYPTION_SCHEME_VERSION = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function getRawEncryptionKey() {
  const raw = asText(process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
  if (!raw) {
    throw new Error("Missing GMAIL_TOKEN_ENCRYPTION_KEY");
  }

  if (!raw.startsWith("base64:")) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must use the format base64:<base64-32-byte-key>");
  }

  const encoded = raw.slice("base64:".length).trim();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function hasGmailTokenEncryptionKey() {
  try {
    getRawEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptGmailToken(value: string) {
  const key = getRawEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    `v${ENCRYPTION_SCHEME_VERSION}`,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptGmailToken(value: string) {
  const key = getRawEncryptionKey();
  const [version, ivBase64, authTagBase64, cipherTextBase64] = value.split(":");
  if (version !== `v${ENCRYPTION_SCHEME_VERSION}` || !ivBase64 || !authTagBase64 || !cipherTextBase64) {
    throw new Error("Encrypted Gmail token has an invalid format");
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherTextBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function getGmailTokenEncryptionVersion() {
  return ENCRYPTION_SCHEME_VERSION;
}
