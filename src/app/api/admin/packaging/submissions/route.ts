import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEstimatePackagingReviewState } from "@/lib/packaging/reviewStatus";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("packaging_submissions")
    .select("id, estimate_id, category, customer_name, customer_email, customer_phone, notes, status, review_notes, front_image_url, back_image_url, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const id = body?.id ? String(body.id) : null;
  const status = body?.status ? String(body.status) : null;
  const review_notes = body?.review_notes ? String(body.review_notes) : null;

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("packaging_submissions")
    .update({ status, review_notes })
    .eq("id", id)
    .select("id, estimate_id, customer_email, status, review_notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const estimateId = String((data as any)?.estimate_id || "").trim();
  const customerEmail = String((data as any)?.customer_email || "").trim().toLowerCase();
  if (estimateId) {
    const packagingState = await getEstimatePackagingReviewState(supabase, estimateId);
    const { error: estimateErr } = await supabase
      .from("estimates")
      .update({ packaging_review_pending: packagingState.hasUnapprovedCustomerPackaging })
      .eq("id", estimateId);
    if (estimateErr) return NextResponse.json({ error: estimateErr.message }, { status: 500 });
  }
  if (customerEmail) {
    const { data: estimateRows, error: estimateLoadErr } = await supabase
      .from("estimates")
      .select("id")
      .eq("customer_email", customerEmail);
    if (estimateLoadErr) return NextResponse.json({ error: estimateLoadErr.message }, { status: 500 });

    for (const row of estimateRows || []) {
      const id = String((row as any)?.id || "").trim();
      if (!id || id === estimateId) continue;
      const packagingState = await getEstimatePackagingReviewState(supabase, id);
      const { error: estimateErr } = await supabase
        .from("estimates")
        .update({ packaging_review_pending: packagingState.hasUnapprovedCustomerPackaging })
        .eq("id", id);
      if (estimateErr) return NextResponse.json({ error: estimateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ submission: data });
}
