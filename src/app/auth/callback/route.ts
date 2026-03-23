import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function safeInternalPath(value: string | null, fallback: string): string {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

function buildRecoveryRedirect(searchParams: URLSearchParams): string {
  const redirectSearchParams = new URLSearchParams();
  const keys = ["code", "token_hash", "token", "type", "error", "error_code", "error_description"];

  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      redirectSearchParams.set(key, value);
    }
  }

  const query = redirectSearchParams.toString();
  return query ? `/reset-password?${query}` : "/reset-password";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const type = searchParams.get("type")
  const tokenHash = searchParams.get("token_hash")
  const nextFallback = type === "recovery" ? "/reset-password" : "/dashboard"
  const next = safeInternalPath(searchParams.get("next"), nextFallback);
  let redirectPath = next

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}${buildRecoveryRedirect(searchParams)}`)
  }

  if (code || (tokenHash && type)) {
    const supabase = await createClient()
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        redirectPath = "/login?message=Unable%20to%20complete%20sign%20in."
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirectPath}`)
}
