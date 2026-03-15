import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const note = String(body.note || "").trim();
  if (!note) return NextResponse.json({ error: "note required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_notes").insert({
    customer_id: id,
    note,
    author_user_id: staff.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
