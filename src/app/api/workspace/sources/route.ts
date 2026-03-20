import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asEmail(value: unknown): string | null {
  const email = asText(value)?.toLowerCase() || null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isAllowedStatus(value: string | null): boolean {
  if (!value) return true;
  return new Set(["active", "prospect", "lead", "on_hold", "inactive"]).has(value);
}

function isAllowedStage(value: string | null): boolean {
  if (!value) return true;
  return new Set(["new", "qualified", "active", "paused", "closed"]).has(value);
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = asText(body.name);
  const sourceType = asText(body.source_type);
  const companyName = asText(body.company_name);
  const contactName = asText(body.contact_name);
  const contactEmail = body.contact_email === "" ? null : asEmail(body.contact_email);
  const contactPhone = asText(body.contact_phone);
  const status = asText(body.status) || "active";
  const stage = asText(body.stage);
  const notes = asText(body.notes);

  if (!name) {
    return NextResponse.json({ error: "Source name is required." }, { status: 400 });
  }
  if ("contact_email" in body && body.contact_email && !contactEmail) {
    return NextResponse.json({ error: "Contact email is invalid." }, { status: 400 });
  }
  if (!isAllowedStatus(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if (!isAllowedStage(stage)) {
    return NextResponse.json({ error: "Invalid stage." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("sources")
    .insert({
      name,
      source_type: sourceType,
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      status,
      stage,
      notes,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sourceId = String(data?.id || "").trim();
  if (!sourceId) {
    return NextResponse.json({ error: "Source could not be created." }, { status: 500 });
  }

  await supabase.from("source_activity").insert({
    source_id: sourceId,
    activity_type: "quick_add",
    summary: "Source created from quick add",
    details: {
      source_type: sourceType,
      company_name: companyName,
      contact_name: contactName,
    },
    actor_user_id: staff.userId,
  });

  return NextResponse.json({ ok: true, id: sourceId });
}
