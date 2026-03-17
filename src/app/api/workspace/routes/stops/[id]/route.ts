import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const stopStatus = asText(body.stop_status);
  const notes = asText(body.notes);

  if (stopStatus && !["planned", "ready", "visited", "skipped"].includes(stopStatus)) {
    return NextResponse.json({ error: "Invalid stop_status" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {};
  if ("stop_status" in body) payload.stop_status = stopStatus;
  if ("notes" in body) payload.notes = notes;
  payload.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.from("route_stops").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
