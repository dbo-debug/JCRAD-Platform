import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  // 1) Verify requester is logged in (uses session cookie)
  const supabase = await createServerClient()
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2) Verify requester is admin via profiles table
  const { data: requesterProfile, error: requesterError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single()

  if (requesterError || requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 3) Validate input
  const body = await req.json()
  const email = String(body.email || "").trim().toLowerCase()
  const role = String(body.role || "").trim()

  const allowedRoles = new Set(["admin", "sales", "customer"])
  if (!email || !allowedRoles.has(role)) {
    return NextResponse.json({ error: "Invalid email or role" }, { status: 400 })
  }

  // 4) Use service role key (server only) to create user + update profile
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", created.user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, userId: created.user.id })
}