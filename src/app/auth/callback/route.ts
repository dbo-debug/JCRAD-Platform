import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { EmailOtpType } from "@supabase/supabase-js"

function safeInternalPath(value: string | null, fallback: string): string {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const nextFallback = type === "recovery" ? "/reset-password" : "/dashboard"
  const next = safeInternalPath(searchParams.get("next"), nextFallback);
  let redirectPath = next

  if (code || (tokenHash && type)) {
    const supabase = await createClient()
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        redirectPath = "/login?message=Unable%20to%20complete%20sign%20in."
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      })
      if (error) {
        redirectPath = "/forgot-password?message=Reset%20link%20is%20invalid%20or%20expired."
      } else if (type === "recovery" && next === "/dashboard") {
        redirectPath = "/reset-password"
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirectPath}`)
}
