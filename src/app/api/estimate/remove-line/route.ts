import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEstimatePackagingReviewState } from "@/lib/packaging/reviewStatus";
import { money } from "@/lib/pricing";

async function recalcEstimate(supabase: ReturnType<typeof createAdminClient>, estimateId: string) {
  const { data: lines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("line_sell_total, line_total")
    .eq("estimate_id", estimateId);

  if (linesErr) throw new Error(linesErr.message);

  const subtotal = money(
    (lines ?? []).reduce((sum: number, l: any) => sum + Number((l.line_sell_total ?? l.line_total) || 0), 0)
  );
  const packagingState = await getEstimatePackagingReviewState(supabase, estimateId);
  const hasPackagingPending = packagingState.hasUnapprovedCustomerPackaging;

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("adjustments")
    .eq("id", estimateId)
    .single();

  if (estErr) throw new Error(estErr.message);

  const adjustments = Number(estimate?.adjustments || 0);
  const total = money(subtotal + adjustments);

  const { error: updErr } = await supabase
    .from("estimates")
    .update({ subtotal, total, packaging_review_pending: hasPackagingPending })
    .eq("id", estimateId);

  if (updErr) throw new Error(updErr.message);

  return { subtotal, adjustments, total, packaging_review_pending: hasPackagingPending };
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const estimate_id = body?.estimate_id ? String(body.estimate_id) : null;
  const line_id = body?.line_id ? String(body.line_id) : null;

  if (!estimate_id || !line_id) {
    return NextResponse.json({ error: "estimate_id and line_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("estimate_lines")
    .delete()
    .eq("id", line_id)
    .eq("estimate_id", estimate_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await recalcEstimate(supabase, estimate_id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to recalc estimate" }, { status: 500 });
  }
}
