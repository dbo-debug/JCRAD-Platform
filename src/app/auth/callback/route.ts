import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function safeInternalPath(value: string | null, fallback: string): string {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = safeInternalPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
