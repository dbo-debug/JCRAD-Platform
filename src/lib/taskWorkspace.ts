import type { StaffContext } from "@/lib/getStaffContext";
import { createAdminClient } from "@/lib/supabase/admin";

export type TaskRow = {
  id: string;
  customer_id: string | null;
  title: string | null;
  due_date: string | null;
  assigned_user_id: string | null;
  status: string | null;
  priority: number | null;
  created_at: string | null;
  completed_at: string | null;
};

export type TaskViewKey = "open" | "overdue" | "upcoming" | "completed";

export const CLOSED_TASK_STATUSES = new Set(["completed", "closed", "cancelled"]);

export function normalizeTaskStatus(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function getDefaultTaskView(staffRole: StaffContext["role"]): TaskViewKey {
  return staffRole === "admin" ? "open" : "overdue";
}

export async function loadScopedCustomerTasks(args: {
  staff: StaffContext;
  limit?: number;
}): Promise<TaskRow[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("customer_tasks")
    .select("id, customer_id, title, due_date, assigned_user_id, status, priority, created_at, completed_at")
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (args.staff.role !== "admin") {
    query = query.eq("assigned_user_id", args.staff.userId);
  }
  if (args.limit) {
    query = query.limit(args.limit);
  }

  const res = await query;
  if (res.error) {
    throw new Error(res.error.message);
  }

  return (res.data || []) as TaskRow[];
}

export function filterTasksByView<T extends TaskRow>(args: {
  tasks: T[];
  view: TaskViewKey;
  referenceNow?: number;
}) {
  const referenceNow = args.referenceNow ?? Date.now();
  const openTasks = args.tasks.filter((task) => !CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task.status)));
  const overdueTasks = openTasks.filter((task) => {
    const due = Date.parse(String(task.due_date || ""));
    return Number.isFinite(due) && due < referenceNow;
  });
  const upcomingTasks = openTasks.filter((task) => {
    const due = Date.parse(String(task.due_date || ""));
    return !Number.isFinite(due) || due >= referenceNow;
  });
  const completedTasks = args.tasks.filter((task) => CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task.status)));

  if (args.view === "overdue") return overdueTasks;
  if (args.view === "upcoming") return upcomingTasks;
  if (args.view === "completed") return completedTasks;
  return openTasks;
}

export function resolveTaskView(value: string, staffRole: StaffContext["role"]): TaskViewKey {
  if (value === "open" || value === "overdue" || value === "upcoming" || value === "completed") {
    return value;
  }
  return getDefaultTaskView(staffRole);
}
