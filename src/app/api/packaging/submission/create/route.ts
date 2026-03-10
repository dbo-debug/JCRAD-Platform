import { NextResponse } from "next/server";
import { getEstimatePackagingReviewState } from "@/lib/packaging/reviewStatus";
import { normalizePackagingCategory } from "@/lib/packaging/category";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";

async function uploadMaybe(supabase: ReturnType<typeof createAdminClient>, file: File | null, path: string) {
  if (!file) return null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from("catalog-public").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("catalog-public").getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(req: Request) {
  const userClient = await createClient();
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user ?? null;
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const form = await req.formData();

  const estimate_id = form.get("estimate_id")?.toString() || null;
  const category = normalizePackagingCategory(form.get("category")?.toString() || "");
  const customer_name = form.get("customer_name")?.toString() || user.user_metadata?.full_name || "";
  const customer_email = String(user.email || "").trim().toLowerCase();
  const customer_phone = form.get("customer_phone")?.toString() || "";
  const notes = form.get("notes")?.toString() || "";

  const frontFile = (form.get("front_file") as File | null) || null;
  const backFile = (form.get("back_file") as File | null) || null;

  if (!category) {
    return NextResponse.json({ error: "Valid category is required" }, { status: 400 });
  }
  if (!customer_email) {
    return NextResponse.json({ error: "Authenticated user email is required" }, { status: 400 });
  }

  try {
    const token = crypto.randomUUID();
    const basePath = `packaging-submissions/${token}`;

    const front_image_url = await uploadMaybe(
      supabase,
      frontFile,
      `${basePath}/front.${frontFile?.name.split(".").pop() || "bin"}`
    );
    const back_image_url = await uploadMaybe(
      supabase,
      backFile,
      `${basePath}/back.${backFile?.name.split(".").pop() || "bin"}`
    );

    const { data, error } = await supabase
      .from("packaging_submissions")
      .insert({
        estimate_id,
        category,
        customer_name,
        customer_email,
        customer_phone,
        notes,
        status: "pending",
        front_image_url,
        back_image_url,
      })
      .select("id, status, front_image_url, back_image_url")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (estimate_id) {
      const packagingState = await getEstimatePackagingReviewState(supabase, estimate_id);
      const { error: estimateErr } = await supabase
        .from("estimates")
        .update({ packaging_review_pending: packagingState.hasUnapprovedCustomerPackaging })
        .eq("id", estimate_id);
      if (estimateErr) return NextResponse.json({ error: estimateErr.message }, { status: 500 });
    }

    return NextResponse.json({ submission: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
