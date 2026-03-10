import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);

async function resolveCatalogItemId(args: {
  productId: string;
  productName: string | null;
  productCategory: string | null;
}): Promise<string> {
  const { productId, productName, productCategory } = args;

  const { data: existingItem, error: existingErr } = await supabaseAdmin
    .from("catalog_items")
    .select("id")
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if ((existingItem as { id?: string } | null)?.id) {
    return String((existingItem as { id: string }).id);
  }

  const { data: createdItem, error: createErr } = await supabaseAdmin
    .from("catalog_items")
    .insert({
      product_id: productId,
      category: productCategory,
      name: productName,
      active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (createErr) throw new Error(createErr.message);
  return String((createdItem as { id: string }).id);
}

async function resolveVariantId(catalogItemId: string): Promise<string> {
  const { data: itemVariant, error: itemErr } = await supabaseAdmin
    .from("catalog_variants")
    .select("id")
    .eq("catalog_item_id", catalogItemId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (itemErr) throw new Error(itemErr.message);
  if ((itemVariant as { id?: string } | null)?.id) {
    return String((itemVariant as { id: string }).id);
  }

  const { data: createdVariant, error: createErr } = await supabaseAdmin
    .from("catalog_variants")
    .insert({
      catalog_item_id: catalogItemId,
      code: `default-${catalogItemId.slice(0, 8)}`,
      display_name: "Default",
      active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (createErr) throw new Error(createErr.message);
  return String((createdVariant as { id: string }).id);
}

export async function POST(req: Request) {
  // Lock this down (since this uploads + writes DB)
  await requireAdmin();

  const form = await req.formData();

  const product_id = form.get("product_id")?.toString();
  const product_name = form.get("product_name")?.toString() || null;
  const product_category = form.get("product_category")?.toString() || null;
  const media_type = (form.get("media_type")?.toString() || "other").toLowerCase();
  const title = form.get("title")?.toString() || null;
  const notes = form.get("notes")?.toString() || null;

  // ✅ pull from form, default to public
  const visibilityRaw = (form.get("visibility")?.toString() || "public").toLowerCase();
  const visibility = visibilityRaw === "internal" ? "internal" : "public";

  // Option A: always public bucket
  const bucket = "catalog-public";

  const file = form.get("file") as File | null;

  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  let resolvedVariantId = "";
  try {
    const catalogItemId = await resolveCatalogItemId({
      productId: product_id,
      productName: product_name,
      productCategory: product_category,
    });
    resolvedVariantId = await resolveVariantId(catalogItemId);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to resolve variant_id from product_id" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "bin";

  // keep folders predictable
  const safeTypeFolder = `${media_type}s`; // images / coas / spec_sheets etc
  const object_path = `variants/${resolvedVariantId}/${safeTypeFolder}/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(object_path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: row, error: dbErr } = await supabaseAdmin
    .from("variant_media")
    .insert({
      variant_id: resolvedVariantId,
      media_type,
      bucket,
      object_path,
      title,
      notes,
      visibility, // ✅ now saved
      approved: false, // you approve after checking it
      is_featured: false,
      sort_order: 0,
    })
    .select("*")
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(object_path);

  return NextResponse.json({ ok: true, variant_id: resolvedVariantId, media: { ...row, url: pub.publicUrl } });
}
