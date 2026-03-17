import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asTimestamp(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T12:00:00.000Z`).toISOString();
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

const ALLOWED_VISIT_STATUSES = new Set(["visited", "scheduled", "due", "overdue", "needs_follow_up", "skipped"]);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const markVisited = body.mark_visited === true;
  const activityType = asText(body.activity_type) || (markVisited ? "visit_completed" : "visit_logged");
  const summary = asText(body.summary) || (markVisited ? "Customer visit completed" : "Customer visit activity logged");
  const visitStatus = asText(body.visit_status);
  const notes = asText(body.notes);
  const nextVisitDueAt = asTimestamp(body.next_visit_due_at);
  const lastVisitAt = markVisited ? new Date().toISOString() : asTimestamp(body.last_visit_at);

  if (visitStatus && !ALLOWED_VISIT_STATUSES.has(visitStatus)) {
    return NextResponse.json({ error: "Invalid visit_status" }, { status: 400 });
  }
  if ("next_visit_due_at" in body && body.next_visit_due_at && !nextVisitDueAt) {
    return NextResponse.json({ error: "Invalid next_visit_due_at" }, { status: 400 });
  }
  if ("last_visit_at" in body && body.last_visit_at && !lastVisitAt) {
    return NextResponse.json({ error: "Invalid last_visit_at" }, { status: 400 });
  }

  const customerUpdate: Record<string, string | null> = {};
  if (visitStatus || "visit_status" in body || markVisited) customerUpdate.visit_status = visitStatus || (markVisited ? "visited" : null);
  if (nextVisitDueAt || "next_visit_due_at" in body) customerUpdate.next_visit_due_at = nextVisitDueAt;
  if (lastVisitAt || "last_visit_at" in body || markVisited) customerUpdate.last_visit_at = lastVisitAt;

  const activityDetails: Record<string, unknown> = {
    visit_status: customerUpdate.visit_status ?? null,
    next_visit_due_at: customerUpdate.next_visit_due_at ?? null,
    last_visit_at: customerUpdate.last_visit_at ?? null,
    mark_visited: markVisited,
  };
  if (notes) activityDetails.notes = notes;

  const supabase = createAdminClient();
  if (Object.keys(customerUpdate).length > 0) {
    const { error: updateError } = await supabase.from("customers").update(customerUpdate).eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { error: activityError } = await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: activityType,
    summary,
    details: activityDetails,
    actor_user_id: staff.userId,
  });

  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    visit_status: customerUpdate.visit_status ?? null,
    last_visit_at: customerUpdate.last_visit_at ?? null,
    next_visit_due_at: customerUpdate.next_visit_due_at ?? null,
  });
}
