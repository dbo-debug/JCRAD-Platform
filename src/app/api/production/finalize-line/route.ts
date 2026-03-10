import { NextResponse } from "next/server";
import { finalizeEstimateLine } from "@/lib/estimate/finalizeEstimateLine";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const secret = process.env.PRODUCTION_PUSH_SECRET;
  const provided = req.headers.get("x-production-secret");

  if (!secret) {
    return NextResponse.json({ error: "PRODUCTION_PUSH_SECRET is not configured" }, { status: 500 });
  }
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      supabase: createAdminClient(),
      estimateLineId,
      finishedUnits,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to finalize line";
    const lower = String(message).toLowerCase();
    const status = lower.includes("not found") ? 404 : lower.includes("missing required estimate_lines columns") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
