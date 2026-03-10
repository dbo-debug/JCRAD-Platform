import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: skus, error: skuErr } = await supabase
    .from("packaging_skus")
    .select("id, name, category, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, description, compliance_status, front_image_url, back_image_url, created_at, updated_at")
    .order("name", { ascending: true });

  if (skuErr) return NextResponse.json({ error: skuErr.message }, { status: 500 });

  const skuIds = (skus ?? []).map((s: any) => s.id);
  let tiers: any[] = [];

  if (skuIds.length > 0) {
    const { data: tierData, error: tierErr } = await supabase
      .from("packaging_price_tiers")
      .select("id, packaging_sku_id, moq, unit_price")
      .in("packaging_sku_id", skuIds)
      .order("moq", { ascending: true });

    if (tierErr) return NextResponse.json({ error: tierErr.message }, { status: 500 });
    tiers = tierData ?? [];
  }

  return NextResponse.json({ skus: skus ?? [], tiers });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "upsert_sku") {
    const id = body?.id ? String(body.id) : null;
    const category = String(body?.category || "").toLowerCase();
    if (!["flower", "concentrate", "vape", "pre_roll"].includes(category)) {
      return NextResponse.json({ error: "category must be flower, concentrate, vape, or pre_roll" }, { status: 400 });
    }
    const flower_container = String(body?.flower_container || "bag").toLowerCase();
    const size_grams = body?.size_grams == null || body?.size_grams === "" ? null : Number(body.size_grams);
    const rawPackQty = body?.pack_qty == null || body?.pack_qty === "" ? null : Number(body.pack_qty);
    const pack_qty = category === "pre_roll" ? rawPackQty : rawPackQty ?? 1;
    const vape_fill_grams =
      body?.vape_fill_grams == null || body?.vape_fill_grams === "" ? null : Number(body.vape_fill_grams);
    const unit_cost = body?.unit_cost == null || body?.unit_cost === "" ? null : Number(body.unit_cost);

    const vape_device = body?.vape_device ? String(body.vape_device) : null;

    let packaging_type: string | null = null;
    if (category === "flower") {
      packaging_type = flower_container === "jar" ? "flower_in_jar" : "flower_in_bag";
    } else if (category === "concentrate") {
      packaging_type = "concentrate_jar";
    } else if (category === "vape") {
      if (!["510_cart", "all_in_one"].includes(String(vape_device || ""))) {
        return NextResponse.json({ error: "Vape device must be 510_cart or all_in_one" }, { status: 400 });
      }
      packaging_type = vape_device === "510_cart" ? "vape_510_cart" : "vape_all_in_one";
    } else if (category === "pre_roll") {
      if (pack_qty == null || Number.isNaN(pack_qty)) {
        return NextResponse.json(
          { error: "pack_qty required for pre_roll" },
          { status: 400 }
        );
      }
      if (![1, 5].includes(pack_qty)) {
        return NextResponse.json(
          { error: "Pre-roll qty must be 1 or 5" },
          { status: 400 }
        );
      }
      packaging_type = pack_qty === 1 ? "pre_roll_tube" : "pre_roll_pack";
    }
    if (!packaging_type) {
      return NextResponse.json({ error: "Unable to derive packaging_type" }, { status: 400 });
    }

    const payload = {
      name: String(body?.name || "").trim(),
      category,
      packaging_type,
      size_grams,
      pack_qty,
      vape_device,
      vape_fill_grams,
      unit_cost,
      description: body?.description ? String(body.description) : null,
      compliance_status: body?.compliance_status ? String(body.compliance_status) : null,
      front_image_url: body?.front_image_url ? String(body.front_image_url) : null,
      back_image_url: body?.back_image_url ? String(body.back_image_url) : null,
    };

    if (!payload.name) return NextResponse.json({ error: "name required" }, { status: 400 });

    if (category === "flower" && ![3.5, 5, 7, 14, 28].includes(Number(size_grams || 0))) {
      return NextResponse.json({ error: "Flower packaging size must be 3.5, 5, 7, 14, or 28 grams" }, { status: 400 });
    }
    if (category === "concentrate" && Number(size_grams || 0) !== 1) {
      return NextResponse.json({ error: "Concentrate packaging size must be 1g" }, { status: 400 });
    }
    if (category === "vape") {
      if (![0.5, 1].includes(Number(vape_fill_grams || 0))) {
        return NextResponse.json({ error: "Vape fill must be 0.5g or 1g" }, { status: 400 });
      }
    }
    if (category === "pre_roll") {
      if (![0.5, 0.75, 1].includes(Number(size_grams || 0))) {
        return NextResponse.json({ error: "Pre-roll size must be 0.5g, 0.75g, or 1g" }, { status: 400 });
      }
    }
    if (category === "pre_roll") {
      if (pack_qty === 5 && size_grams === 1) {
        return NextResponse.json(
          { error: "5-pack pre-roll is not allowed for 1g" },
          { status: 400 }
        );
      }
    }
    if (unit_cost != null && (!Number.isFinite(unit_cost) || unit_cost < 0)) {
      return NextResponse.json({ error: "unit_cost must be null or >= 0" }, { status: 400 });
    }

    if (id) {
      const { data, error } = await supabase.from("packaging_skus").update(payload).eq("id", id).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ sku: data });
    }

    const { data, error } = await supabase.from("packaging_skus").insert(payload).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sku: data });
  }

  if (action === "set_tiers") {
    const packaging_sku_id = body?.packaging_sku_id ? String(body.packaging_sku_id) : null;
    const tiers = Array.isArray(body?.tiers) ? body.tiers : [];

    if (!packaging_sku_id) return NextResponse.json({ error: "packaging_sku_id required" }, { status: 400 });

    const clean = tiers
      .map((t: any) => ({
        packaging_sku_id,
        moq: Number(t?.moq || 0),
        unit_price: Number(t?.unit_price || 0),
      }))
      .filter((t: any) => t.moq > 0 && t.unit_price >= 0);

    const { error: delErr } = await supabase.from("packaging_price_tiers").delete().eq("packaging_sku_id", packaging_sku_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (clean.length === 0) {
      return NextResponse.json({ ok: true, tiers: [] });
    }

    const { data, error } = await supabase
      .from("packaging_price_tiers")
      .insert(clean)
      .select("id, packaging_sku_id, moq, unit_price");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tiers: data ?? [] });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
