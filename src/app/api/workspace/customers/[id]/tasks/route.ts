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

function asDateTime(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function asPriority(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function asReminderOffsetMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return [0, 5, 15, 30, 60].includes(parsed) ? parsed : null;
}

function isClosedTaskStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "completed" || normalized === "closed" || normalized === "cancelled";
}

async function resolveAssignedUserId(args: {
  requestedAssignedUserId: string | null;
  staff: NonNullable<Awaited<ReturnType<typeof getStaffContext>>>;
}) {
  if (args.staff.role !== "admin") {
    return args.staff.userId;
  }

  const requestedAssignedUserId = asText(args.requestedAssignedUserId);
  if (!requestedAssignedUserId) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", requestedAssignedUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const role = String(data?.role || "").trim().toLowerCase();
  if (role !== "admin" && role !== "sales") {
    throw new Error("assigned_user_id must reference a valid staff user");
  }

  return String(data?.id || "").trim() || null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const title = asText(body.title);
  const dueDate = asDate(body.due_date);
  const dueAt = asDateTime(body.due_at);
  const requestedAssignedUserId = asText(body.assigned_user_id);
  const priority = asPriority(body.priority);
  const reminderOffsetMinutes = asReminderOffsetMinutes(body.reminder_offset_minutes);

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  if ("due_date" in body && body.due_date && !dueDate) {
    return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
  }

  if ("due_at" in body && body.due_at && !dueAt) {
    return NextResponse.json({ error: "Invalid due_at" }, { status: 400 });
  }

  if ("priority" in body && body.priority !== null && body.priority !== "" && priority === null) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  if (
    "reminder_offset_minutes" in body &&
    body.reminder_offset_minutes !== null &&
    body.reminder_offset_minutes !== "" &&
    reminderOffsetMinutes === null
  ) {
    return NextResponse.json({ error: "Invalid reminder_offset_minutes" }, { status: 400 });
  }

  if (dueAt && !dueDate) {
    return NextResponse.json({ error: "due_date required when due_at is provided" }, { status: 400 });
  }

  if (reminderOffsetMinutes !== null && !dueAt) {
    return NextResponse.json({ error: "Reminder requires a due time." }, { status: 400 });
  }

  const supabase = createAdminClient();
  let assignedUserId: string | null = null;

  try {
    assignedUserId = await resolveAssignedUserId({
      requestedAssignedUserId,
      staff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid assigned_user_id";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: taskRow, error } = await supabase
    .from("customer_tasks")
    .insert({
      customer_id: id,
      title,
      due_date: dueDate,
      due_at: dueAt,
      assigned_user_id: assignedUserId,
      priority,
      reminder_offset_minutes: reminderOffsetMinutes,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const timelineDetails: Record<string, unknown> = {};
  if (dueDate) timelineDetails.due_date = dueDate;
  if (dueAt) timelineDetails.due_at = dueAt;
  if (assignedUserId) timelineDetails.assigned_user_id = assignedUserId;
  if (priority !== null) timelineDetails.priority = priority;
  if (reminderOffsetMinutes !== null) timelineDetails.reminder_offset_minutes = reminderOffsetMinutes;
  timelineDetails.task_id = taskRow?.id || null;

  await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: "task_created",
    summary: `Created task: ${title}`,
    details: timelineDetails,
    actor_user_id: staff.userId,
  });

  return NextResponse.json({
    ok: true,
    id: taskRow?.id || null,
    due_at: dueAt,
    reminder_offset_minutes: reminderOffsetMinutes,
  });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const taskId = asText(body.task_id);
  const status = asText(body.status)?.toLowerCase() || null;
  const completionNote = asText(body.completion_note);

  if (!taskId) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  if (status !== "completed") {
    return NextResponse.json({ error: "Unsupported status update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existingTask, error: taskLoadError } = await supabase
    .from("customer_tasks")
    .select("id, customer_id, title, status, completed_at")
    .eq("id", taskId)
    .eq("customer_id", id)
    .maybeSingle();

  if (taskLoadError) {
    return NextResponse.json({ error: taskLoadError.message }, { status: 500 });
  }

  if (!existingTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (isClosedTaskStatus(existingTask.status) || asText(existingTask.completed_at)) {
    return NextResponse.json({
      ok: true,
      id: existingTask.id,
      status: "completed",
      completed_at: asText(existingTask.completed_at),
    });
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("customer_tasks")
    .update({
      status: "completed",
      completed_at: completedAt,
    })
    .eq("id", taskId)
    .eq("customer_id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("customer_activity").insert({
    customer_id: id,
    activity_type: "task_completed",
    summary: `Completed task: ${asText(existingTask.title) || "Untitled task"}`,
    details: {
      task_id: existingTask.id,
      completed_at: completedAt,
      previous_status: asText(existingTask.status) || "open",
      notes: completionNote,
    },
    actor_user_id: staff.userId,
  });

  return NextResponse.json({
    ok: true,
    id: existingTask.id,
    status: "completed",
    completed_at: completedAt,
  });
}
