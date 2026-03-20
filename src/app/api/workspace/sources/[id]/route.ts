import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function isAllowedStatus(value: string | null): boolean {
  if (!value) return true;
  return new Set(["active", "prospect", "lead", "on_hold", "inactive"]).has(value);
}

function isAllowedStage(value: string | null): boolean {
  if (!value) return true;
  return new Set(["new", "qualified", "active", "paused", "closed"]).has(value);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const name = asText(body.name);
  const sourceType = asText(body.source_type);
  const companyName = asText(body.company_name);
  const contactName = asText(body.contact_name);
  const contactEmail = asText(body.contact_email);
  const contactPhone = asText(body.contact_phone);
  const status = asText(body.status);
  const stage = asText(body.stage);
  const notes = asText(body.notes);

  if ("name" in body && !name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!isAllowedStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!isAllowedStage(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const payload: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if ("name" in body) payload.name = name;
  if ("source_type" in body) payload.source_type = sourceType;
  if ("company_name" in body) payload.company_name = companyName;
  if ("contact_name" in body) payload.contact_name = contactName;
  if ("contact_email" in body) payload.contact_email = contactEmail;
  if ("contact_phone" in body) payload.contact_phone = contactPhone;
  if ("status" in body) payload.status = status;
  if ("stage" in body) payload.stage = stage;
  if ("notes" in body) payload.notes = notes;

  const supabase = createAdminClient();
  const { data: currentSource, error: loadError } = await supabase.from("sources").select("id").eq("id", id).maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!currentSource) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const { error } = await supabase.from("sources").update(payload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
