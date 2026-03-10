import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();

  const { data: skus, error } = await supabase
    .from("packaging_skus")
    .select(
      "id, name, category, applies_to, packaging_type, size_grams, pack_qty, vape_fill_grams, compliance_status, active, workflow_contexts, packaging_role"
    )
    .eq("compliance_status", "approved")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skus: skus ?? [] });
}
