import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asDate(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function asPriority(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const title = asText(body.title);
  const dueDate = asDate(body.due_date);
  const assignedUserId = asText(body.assigned_user_id);
  const priority = asPriority(body.priority);

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if ("due_date" in body && body.due_date && !dueDate) {
    return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
  }
  if ("priority" in body && body.priority !== null && body.priority !== "" && priority === null) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: taskRow, error } = await supabase
    .from("source_tasks")
    .insert({
      source_id: id,
      title,
      due_date: dueDate,
      assigned_user_id: assignedUserId,
      priority,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const timelineDetails: Record<string, unknown> = {};
  if (dueDate) timelineDetails.due_date = dueDate;
  if (assignedUserId) timelineDetails.assigned_user_id = assignedUserId;
  if (priority !== null) timelineDetails.priority = priority;
  timelineDetails.task_id = taskRow?.id || null;

  await supabase.from("source_activity").insert({
    source_id: id,
    activity_type: "task_created",
    summary: `Created task: ${title}`,
    details: timelineDetails,
    actor_user_id: staff.userId,
  });

  await supabase.from("sources").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true, id: taskRow?.id || null });
}
