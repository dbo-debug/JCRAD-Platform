import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.log("[estimate/get] request", {
      has_id: Boolean(id),
    });
  }
  const respond = (payload: unknown, init?: ResponseInit) => {
    if (isDev) {
      console.log("[estimate/get] response", { status: init?.status || 200, has_id: Boolean(id) });
    }
    return NextResponse.json(payload, init);
  };

  if (!id) return respond({ error: "id required" }, { status: 400 });

  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, subtotal, adjustments, total, customer_name, customer_email, customer_phone, notes, packaging_review_pending, created_at, updated_at")
    .eq("id", id)
    .single();

  if (estErr) return respond({ error: estErr.message }, { status: 404 });

  const { data: lines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("*, offers:offer_id(id, product_id, products:product_id(id, name, category, type))")
    .eq("estimate_id", id)
    .order("created_at", { ascending: true });

  if (linesErr) return respond({ error: linesErr.message }, { status: 500 });
  const lineRows = (lines ?? []) as Array<Record<string, any>>;
  const infusionProductIds = new Set<string>();
  for (const line of lineRows) {
    const infusionInputs =
      line?.infusion_inputs && typeof line.infusion_inputs === "object"
        ? (line.infusion_inputs as Record<string, unknown>)
        : null;
    const internal = infusionInputs?.internal && typeof infusionInputs.internal === "object"
      ? (infusionInputs.internal as Record<string, unknown>)
      : null;
    const external = infusionInputs?.external && typeof infusionInputs.external === "object"
      ? (infusionInputs.external as Record<string, unknown>)
      : null;
    const internalId = String(internal?.product_id || "").trim();
    const liquidId = String(external?.liquid_product_id || "").trim();
    const dryId = String(external?.dry_product_id || "").trim();
    if (internalId) infusionProductIds.add(internalId);
    if (liquidId) infusionProductIds.add(liquidId);
    if (dryId) infusionProductIds.add(dryId);
  }

  const infusionNameById = new Map<string, string>();
  if (infusionProductIds.size > 0) {
    const { data: infusionProducts } = await supabase
      .from("products")
      .select("id, name")
      .in("id", Array.from(infusionProductIds));
    for (const row of infusionProducts || []) {
      const rid = String((row as any)?.id || "").trim();
      if (!rid) continue;
      infusionNameById.set(rid, String((row as any)?.name || "").trim());
    }
  }

  const enrichedLines = lineRows.map((line) => {
    const infusionInputs =
      line?.infusion_inputs && typeof line.infusion_inputs === "object"
        ? ({ ...(line.infusion_inputs as Record<string, unknown>) } as Record<string, unknown>)
        : null;
    const internal = infusionInputs?.internal && typeof infusionInputs.internal === "object"
      ? ({ ...(infusionInputs.internal as Record<string, unknown>) } as Record<string, unknown>)
      : null;
    const external = infusionInputs?.external && typeof infusionInputs.external === "object"
      ? ({ ...(infusionInputs.external as Record<string, unknown>) } as Record<string, unknown>)
      : null;
    const materialBreakdown =
      infusionInputs?.material_breakdown && typeof infusionInputs.material_breakdown === "object"
        ? (infusionInputs.material_breakdown as Record<string, unknown>)
        : null;

    const internalId = String(internal?.product_id || "").trim();
    const liquidId = String(external?.liquid_product_id || "").trim();
    const dryId = String(external?.dry_product_id || "").trim();
    const internalName = String(internal?.product_name || "").trim() || infusionNameById.get(internalId) || null;
    const liquidName = String(external?.liquid_product_name || "").trim() || infusionNameById.get(liquidId) || null;
    const dryName = String(external?.dry_product_name || "").trim() || infusionNameById.get(dryId) || null;

    const flowerCostTotal = Number(
      line?.material_flower_cost_total
      ?? materialBreakdown?.flower_cost_total
      ?? line?.material_cost_total
      ?? 0
    );
    const infusionCostTotal = Number(
      line?.material_infusion_cost_total
      ?? materialBreakdown?.infusion_cost_total
      ?? 0
    );
    const flowerUnitCost = Number(
      line?.material_flower_unit_cost
      ?? materialBreakdown?.flower_unit_cost
      ?? 0
    );
    const infusionUnitCost = Number(
      line?.material_infusion_unit_cost
      ?? materialBreakdown?.infusion_unit_cost
      ?? 0
    );

    return {
      ...line,
      infusion_inputs: infusionInputs
        ? {
          ...infusionInputs,
          internal: internal ? { ...internal, product_name: internalName } : null,
          external: external
            ? { ...external, liquid_product_name: liquidName, dry_product_name: dryName }
            : null,
        }
        : null,
      infusion_internal_product_name: internalName,
      infusion_external_liquid_product_name: liquidName,
      infusion_external_dry_product_name: dryName,
      material_flower_cost_total: Number.isFinite(flowerCostTotal) ? flowerCostTotal : 0,
      material_infusion_cost_total: Number.isFinite(infusionCostTotal) ? infusionCostTotal : 0,
      material_flower_unit_cost: Number.isFinite(flowerUnitCost) ? flowerUnitCost : 0,
      material_infusion_unit_cost: Number.isFinite(infusionUnitCost) ? infusionUnitCost : 0,
    };
  });

  return respond({ estimate, lines: enrichedLines });
}
