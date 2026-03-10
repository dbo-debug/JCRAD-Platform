import { NextResponse } from "next/server";
import { finalizeEstimateLine, getEstimateLineFinalizationView } from "@/lib/estimate/finalizeEstimateLine";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const estimateLineId = String(searchParams.get("estimate_line_id") || "");

  if (!estimateLineId) {
    return NextResponse.json({ error: "estimate_line_id is required" }, { status: 400 });
  }

  try {
    const line = await getEstimateLineFinalizationView({ supabase, estimateLineId });
    return NextResponse.json({ line });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load estimate line";
    const status = String(message).toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const estimateLineId = body?.estimate_line_id ? String(body.estimate_line_id) : "";
  const finishedUnits = Number(body?.finished_units);
  if (!estimateLineId) {
    return NextResponse.json({ error: "estimate_line_id is required" }, { status: 400 });
  }
  if (!Number.isFinite(finishedUnits) || finishedUnits < 0) {
    return NextResponse.json({ error: "finished_units must be a number >= 0" }, { status: 400 });
  }

  try {
    const result = await finalizeEstimateLine({
      supabase,
      estimateLineId,
      finishedUnits,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to finalize estimate line";
    const lower = String(message).toLowerCase();
    const status = lower.includes("not found") ? 404 : lower.includes("missing required estimate_lines columns") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
