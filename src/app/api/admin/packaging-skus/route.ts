import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

type AppliesTo = "flower" | "concentrate" | "vape" | "pre_roll";
type PackagingType =
  | "flower_in_bag"
  | "flower_in_jar"
  | "pre_roll_tube"
  | "pre_roll_jar"
  | "vape_510_cart"
  | "vape_all_in_one"
  | "concentrate_jar";

const ALLOWED_PACKAGING_TYPES: PackagingType[] = [
  "flower_in_bag",
  "flower_in_jar",
  "pre_roll_tube",
  "pre_roll_jar",
  "vape_510_cart",
  "vape_all_in_one",
  "concentrate_jar",
];

const FLOWER_PACKAGING_TYPES: PackagingType[] = ["flower_in_bag", "flower_in_jar"];
const VAPE_PACKAGING_TYPES: PackagingType[] = ["vape_510_cart", "vape_all_in_one"];

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRequiredNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAppliesTo(value: unknown): AppliesTo | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pre-roll" || raw === "preroll") return "pre_roll";
  if (raw === "flower" || raw === "concentrate" || raw === "vape" || raw === "pre_roll") return raw;
  return null;
}

function normalizePackagingType(value: unknown): PackagingType | null {
  const raw = String(value || "").trim().toLowerCase() as PackagingType;
  return ALLOWED_PACKAGING_TYPES.includes(raw) ? raw : null;
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return code === "42703" || code === "PGRST204" || (message.includes("column") && message.includes("does not exist"));
}

function normalizeReturnedSku(row: any): any {
  return {
    ...row,
    applies_to: row?.applies_to ?? row?.category ?? null,
  };
}

async function selectSkusWithFallback(supabase: ReturnType<typeof createAdminClient>) {
  const withApplies = await supabase
    .from("packaging_skus")
    .select(
      "id, name, category, applies_to, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, inventory_qty, active, thumbnail_url"
    )
    .order("name", { ascending: true });

  if (!withApplies.error) {
    return { data: (withApplies.data || []).map(normalizeReturnedSku), error: null };
  }

  if (!isMissingColumnError(withApplies.error)) {
    return { data: null, error: withApplies.error };
  }

  const fallback = await supabase
    .from("packaging_skus")
    .select(
      "id, name, category, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, inventory_qty, active, thumbnail_url"
    )
    .order("name", { ascending: true });

  if (fallback.error) return { data: null, error: fallback.error };
  return { data: (fallback.data || []).map(normalizeReturnedSku), error: null };
}

async function saveSkuWithAppliesFallback(
  supabase: ReturnType<typeof createAdminClient>,
  id: string | null,
  payloadWithApplies: Record<string, unknown>
) {
  const payloadWithoutApplies = { ...payloadWithApplies };
  delete (payloadWithoutApplies as any).applies_to;
  delete (payloadWithoutApplies as any).thumbnail_bucket;
  delete (payloadWithoutApplies as any).thumbnail_object_path;

  let savedId = id;

  if (id) {
    const firstUpdate = await supabase.from("packaging_skus").update(payloadWithApplies).eq("id", id).select("id").single();
    if (firstUpdate.error) {
      if (!isMissingColumnError(firstUpdate.error)) return { data: null, error: firstUpdate.error };
      const retryUpdate = await supabase.from("packaging_skus").update(payloadWithoutApplies).eq("id", id).select("id").single();
      if (retryUpdate.error) return { data: null, error: retryUpdate.error };
      savedId = String((retryUpdate.data as any)?.id || id);
    } else {
      savedId = String((firstUpdate.data as any)?.id || id);
    }
  } else {
    const firstInsert = await supabase.from("packaging_skus").insert(payloadWithApplies).select("id").single();
    if (firstInsert.error) {
      if (!isMissingColumnError(firstInsert.error)) return { data: null, error: firstInsert.error };
      const retryInsert = await supabase.from("packaging_skus").insert(payloadWithoutApplies).select("id").single();
      if (retryInsert.error) return { data: null, error: retryInsert.error };
      savedId = String((retryInsert.data as any)?.id || "");
    } else {
      savedId = String((firstInsert.data as any)?.id || "");
    }
  }

  if (!savedId) return { data: null, error: { message: "Failed to determine saved packaging SKU id" } };

  const selectWithApplies = await supabase
    .from("packaging_skus")
    .select(
      "id, name, category, applies_to, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, inventory_qty, active, thumbnail_url"
    )
    .eq("id", savedId)
    .single();

  if (!selectWithApplies.error) return { data: normalizeReturnedSku(selectWithApplies.data), error: null };
  if (!isMissingColumnError(selectWithApplies.error)) return { data: null, error: selectWithApplies.error };

  const selectFallback = await supabase
    .from("packaging_skus")
    .select(
      "id, name, category, packaging_type, size_grams, pack_qty, vape_device, vape_fill_grams, unit_cost, inventory_qty, active, thumbnail_url"
    )
    .eq("id", savedId)
    .single();

  if (selectFallback.error) return { data: null, error: selectFallback.error };
  return { data: normalizeReturnedSku(selectFallback.data), error: null };
}

export async function GET() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data, error } = await selectSkusWithFallback(supabase);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skus: data ?? [] });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const id = body?.id ? String(body.id) : null;
  const name = String(body?.name || "").trim();
  const applies_to = normalizeAppliesTo(body?.applies_to);
  const category = applies_to;
  let packaging_type = normalizePackagingType(body?.packaging_type);
  const size_grams = parseOptionalNumber(body?.size_grams);
  const rawPackQty = parseRequiredNumber(body?.pack_qty);
  let vape_device = body?.vape_device == null ? null : String(body.vape_device).trim() || null;
  let vape_fill_grams = parseOptionalNumber(body?.vape_fill_grams);
  const unit_cost = parseRequiredNumber(body?.unit_cost);
  const inventory_qty = parseRequiredNumber(body?.inventory_qty);
  const active = typeof body?.active === "boolean" ? body.active : true;
  const hasThumbnailUrl = Object.prototype.hasOwnProperty.call(body, "thumbnail_url");
  const hasThumbnailBucket = Object.prototype.hasOwnProperty.call(body, "thumbnail_bucket");
  const hasThumbnailObjectPath = Object.prototype.hasOwnProperty.call(body, "thumbnail_object_path");
  const thumbnail_url = body?.thumbnail_url == null ? null : String(body.thumbnail_url).trim() || null;
  const thumbnail_bucket = body?.thumbnail_bucket == null ? null : String(body.thumbnail_bucket).trim() || null;
  const thumbnail_object_path =
    body?.thumbnail_object_path == null ? null : String(body.thumbnail_object_path).trim() || null;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!applies_to || !category) {
    return NextResponse.json({ error: "applies_to must be flower, concentrate, vape, or pre_roll" }, { status: 400 });
  }
  if (unit_cost == null || unit_cost < 0) {
    return NextResponse.json({ error: "unit_cost must be >= 0" }, { status: 400 });
  }
  if (inventory_qty == null || inventory_qty < 0) {
    return NextResponse.json({ error: "inventory_qty must be >= 0" }, { status: 400 });
  }

  let pack_qty = applies_to === "pre_roll" ? rawPackQty : 1;
  if (applies_to === "pre_roll") {
    if (pack_qty == null || pack_qty < 1) {
      return NextResponse.json({ error: "pack_qty must be >= 1 for pre_roll" }, { status: 400 });
    }
  }

  if (applies_to === "concentrate") {
    packaging_type = "concentrate_jar";
  }

  if (applies_to === "flower") {
    if (!packaging_type || !FLOWER_PACKAGING_TYPES.includes(packaging_type)) {
      return NextResponse.json({ error: "flower packaging_type must be flower_in_bag or flower_in_jar" }, { status: 400 });
    }
  }

  if (applies_to === "vape") {
    if (!packaging_type || !VAPE_PACKAGING_TYPES.includes(packaging_type)) {
      return NextResponse.json({ error: "vape packaging_type must be vape_510_cart or vape_all_in_one" }, { status: 400 });
    }
    if (vape_fill_grams !== 0.5 && vape_fill_grams !== 1) {
      return NextResponse.json({ error: "vape_fill_grams must be 0.5 or 1.0 for vape" }, { status: 400 });
    }
  }

  if (applies_to === "pre_roll") {
    const expectedPackagingType: PackagingType = pack_qty === 1 ? "pre_roll_tube" : "pre_roll_jar";
    if (!packaging_type) {
      packaging_type = expectedPackagingType;
    } else if (packaging_type !== expectedPackagingType) {
      return NextResponse.json(
        { error: "pre_roll packaging_type must match pack_qty (1=tube, 2+=jar)" },
        { status: 400 }
      );
    }
  }

  if (!packaging_type) {
    return NextResponse.json(
      {
        error:
          "packaging_type must be one of flower_in_bag, flower_in_jar, pre_roll_tube, pre_roll_jar, vape_510_cart, vape_all_in_one, concentrate_jar",
      },
      { status: 400 }
    );
  }

  if (applies_to !== "vape") {
    vape_fill_grams = null;
    vape_device = null;
  }

  if (applies_to !== "pre_roll") {
    pack_qty = 1;
  }

  const payload: Record<string, unknown> = {
    name,
    category,
    applies_to,
    packaging_type,
    size_grams,
    pack_qty,
    vape_device,
    vape_fill_grams,
    unit_cost,
    inventory_qty,
    active,
  };
  if (hasThumbnailUrl) payload.thumbnail_url = thumbnail_url;
  if (hasThumbnailBucket) payload.thumbnail_bucket = thumbnail_bucket;
  if (hasThumbnailObjectPath) payload.thumbnail_object_path = thumbnail_object_path;

  const saved = await saveSkuWithAppliesFallback(supabase, id, payload);
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({ sku: saved.data });
}
