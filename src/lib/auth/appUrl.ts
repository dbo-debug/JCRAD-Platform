const PROD_APP_URL = "https://www.jcradinc.com";

function normalizeOrigin(value: string): string | null {
  const candidate = String(value || "").trim();
  if (!candidate) return null;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function getCanonicalAppOrigin(browserOrigin?: string): string {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || "");
  if (configuredOrigin) return configuredOrigin;

  const runtimeOrigin = normalizeOrigin(browserOrigin || "");
  if (runtimeOrigin) {
    const hostname = new URL(runtimeOrigin).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return runtimeOrigin;
    }
  }

  return PROD_APP_URL;
}
