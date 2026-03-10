"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CatalogItem = {
  id: string;
  category: "flower" | "concentrate" | "vape" | "preroll";
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string | null;
};

type CatalogVariant = {
  id: string;
  catalog_item_id: string;
  code: string;
  display_name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string | null;
};

const CATEGORIES: CatalogItem["category"][] = ["flower", "concentrate", "vape", "preroll"];

export default function CatalogAdminClient({
  initialItems,
  initialVariants,
}: {
  initialItems: CatalogItem[];
  initialVariants: CatalogVariant[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [variants, setVariants] = useState<CatalogVariant[]>(initialVariants);

  const [tab, setTab] = useState<"items" | "variants">("items");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Items form
  const [newItem, setNewItem] = useState({
    category: "flower" as CatalogItem["category"],
    name: "",
    sort_order: 10,
    active: true,
  });

  // Variants form
  const [newVariant, setNewVariant] = useState({
    catalog_item_id: initialItems?.[0]?.id ?? "",
    code: "",
    display_name: "",
    sort_order: 10,
    active: true,
  });

  const variantsByItem = useMemo(() => {
    const map = new Map<string, CatalogVariant[]>();
    for (const v of variants) {
      const arr = map.get(v.catalog_item_id) ?? [];
      arr.push(v);
      map.set(v.catalog_item_id, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      map.set(k, arr);
    }
    return map;
  }, [variants]);

  async function refresh() {
    setError(null);

    const { data: itemsData, error: itemsErr } = await supabase
      .from("catalog_items")
      .select("*")
      .order("sort_order", { ascending: true });

    if (itemsErr) return setError(itemsErr.message);

    const { data: variantsData, error: variantsErr } = await supabase
      .from("catalog_variants")
      .select("*")
      .order("sort_order", { ascending: true });

    if (variantsErr) return setError(variantsErr.message);

    setItems((itemsData ?? []) as CatalogItem[]);
    setVariants((variantsData ?? []) as CatalogVariant[]);
  }

  async function createItem() {
    setBusy("createItem");
    setError(null);
    try {
      if (!newItem.name.trim()) throw new Error("Item name is required.");

      const { error: insErr } = await supabase.from("catalog_items").insert({
        category: newItem.category,
        name: newItem.name.trim(),
        sort_order: Number(newItem.sort_order) || 0,
        active: !!newItem.active,
      });

      if (insErr) throw new Error(insErr.message);

      setNewItem({ category: "flower", name: "", sort_order: 10, active: true });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create item.");
    } finally {
      setBusy(null);
    }
  }

  async function updateItem(id: string, patch: Partial<CatalogItem>) {
    setBusy(`updateItem:${id}`);
    setError(null);
    try {
      const { error: updErr } = await supabase.from("catalog_items").update(patch).eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update item.");
    } finally {
      setBusy(null);
    }
  }

  async function createVariant() {
    setBusy("createVariant");
    setError(null);
    try {
      if (!newVariant.catalog_item_id) throw new Error("Pick a catalog item first.");
      if (!newVariant.code.trim()) throw new Error("Variant code is required.");
      if (!newVariant.display_name.trim()) throw new Error("Display name is required.");

      const { error: insErr } = await supabase.from("catalog_variants").insert({
        catalog_item_id: newVariant.catalog_item_id,
        code: newVariant.code.trim(),
        display_name: newVariant.display_name.trim(),
        sort_order: Number(newVariant.sort_order) || 0,
        active: !!newVariant.active,
      });

      if (insErr) throw new Error(insErr.message);

      setNewVariant((v) => ({ ...v, code: "", display_name: "", sort_order: 10, active: true }));
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create variant.");
    } finally {
      setBusy(null);
    }
  }

  async function updateVariant(id: string, patch: Partial<CatalogVariant>) {
    setBusy(`updateVariant:${id}`);
    setError(null);
    try {
      const { error: updErr } = await supabase.from("catalog_variants").update(patch).eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update variant.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`rounded px-3 py-1 text-sm ${
            tab === "items" ? "bg-foreground text-background" : "border"
          }`}
          onClick={() => setTab("items")}
        >
          Items
        </button>
        <button
          className={`rounded px-3 py-1 text-sm ${
            tab === "variants" ? "bg-foreground text-background" : "border"
          }`}
          onClick={() => setTab("variants")}
        >
          Variants
        </button>

        <button className="ml-auto rounded border px-3 py-1 text-sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* ITEMS */}
      {tab === "items" && (
        <div className="space-y-4">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">Create Item</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs opacity-70">Category</label>
                <select
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newItem.category}
                  onChange={(e) => setNewItem((x) => ({ ...x, category: e.target.value as any }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs opacity-70">Name</label>
                <input
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newItem.name}
                  onChange={(e) => setNewItem((x) => ({ ...x, name: e.target.value }))}
                  placeholder="Flower"
                />
              </div>

              <div>
                <label className="text-xs opacity-70">Sort Order</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newItem.sort_order}
                  onChange={(e) => setNewItem((x) => ({ ...x, sort_order: Number(e.target.value) }))}
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-4">
                <input
                  id="newItemActive"
                  type="checkbox"
                  checked={newItem.active}
                  onChange={(e) => setNewItem((x) => ({ ...x, active: e.target.checked }))}
                />
                <label htmlFor="newItemActive" className="text-sm">
                  Active
                </label>

                <button
                  className="ml-auto rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
                  onClick={createItem}
                  disabled={busy !== null}
                >
                  {busy === "createItem" ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded border">
            <div className="border-b p-3 text-sm font-semibold">Catalog Items</div>
            <div className="divide-y">
              {items.map((it) => (
                <div key={it.id} className="grid gap-2 p-3 md:grid-cols-6 md:items-center">
                  <div className="text-sm opacity-80">{it.category}</div>

                  <input
                    className="rounded border bg-transparent p-2 text-sm md:col-span-2"
                    value={it.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, name } : x)));
                    }}
                    onBlur={() => updateItem(it.id, { name: it.name })}
                  />

                  <input
                    type="number"
                    className="rounded border bg-transparent p-2 text-sm"
                    value={it.sort_order}
                    onChange={(e) => {
                      const sort_order = Number(e.target.value);
                      setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, sort_order } : x)));
                    }}
                    onBlur={() => updateItem(it.id, { sort_order: it.sort_order })}
                  />

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={it.active}
                      onChange={(e) => updateItem(it.id, { active: e.target.checked })}
                    />
                    Active
                  </label>

                  <div className="text-right text-xs opacity-60">
                    {busy === `updateItem:${it.id}` ? "Saving..." : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VARIANTS */}
      {tab === "variants" && (
        <div className="space-y-4">
          <div className="rounded border p-4">
            <h2 className="text-lg font-semibold">Create Variant</h2>

            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="text-xs opacity-70">Catalog Item</label>
                <select
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newVariant.catalog_item_id}
                  onChange={(e) => setNewVariant((x) => ({ ...x, catalog_item_id: e.target.value }))}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.category} — {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs opacity-70">Code</label>
                <input
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newVariant.code}
                  onChange={(e) => setNewVariant((x) => ({ ...x, code: e.target.value }))}
                  placeholder="flower_indoor"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs opacity-70">Display Name</label>
                <input
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newVariant.display_name}
                  onChange={(e) => setNewVariant((x) => ({ ...x, display_name: e.target.value }))}
                  placeholder="Indoor Flower"
                />
              </div>

              <div>
                <label className="text-xs opacity-70">Sort</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                  value={newVariant.sort_order}
                  onChange={(e) =>
                    setNewVariant((x) => ({ ...x, sort_order: Number(e.target.value) }))
                  }
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-6">
                <input
                  id="newVariantActive"
                  type="checkbox"
                  checked={newVariant.active}
                  onChange={(e) => setNewVariant((x) => ({ ...x, active: e.target.checked }))}
                />
                <label htmlFor="newVariantActive" className="text-sm">
                  Active
                </label>

                <button
                  className="ml-auto rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
                  onClick={createVariant}
                  disabled={busy !== null}
                >
                  {busy === "createVariant" ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded border">
            <div className="border-b p-3 text-sm font-semibold">Variants</div>

            <div className="divide-y">
              {items.map((it) => {
                const list = variantsByItem.get(it.id) ?? [];
                if (list.length === 0) return null;

                return (
                  <div key={it.id} className="p-3">
                    <div className="mb-2 text-sm font-semibold">
                      {it.category} — {it.name}
                    </div>

                    <div className="space-y-2">
                      {list.map((v) => (
                        <div
                          key={v.id}
                          className="grid gap-2 rounded border p-2 md:grid-cols-7 md:items-center"
                        >
                          <div className="text-xs opacity-70 md:col-span-2">{v.code}</div>

                          <input
                            className="rounded border bg-transparent p-2 text-sm md:col-span-3"
                            value={v.display_name}
                            onChange={(e) => {
                              const display_name = e.target.value;
                              setVariants((arr) =>
                                arr.map((x) => (x.id === v.id ? { ...x, display_name } : x))
                              );
                            }}
                            onBlur={() => updateVariant(v.id, { display_name: v.display_name })}
                          />

                          <input
                            type="number"
                            className="rounded border bg-transparent p-2 text-sm"
                            value={v.sort_order}
                            onChange={(e) => {
                              const sort_order = Number(e.target.value);
                              setVariants((arr) =>
                                arr.map((x) => (x.id === v.id ? { ...x, sort_order } : x))
                              );
                            }}
                            onBlur={() => updateVariant(v.id, { sort_order: v.sort_order })}
                          />

                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={v.active}
                              onChange={(e) => updateVariant(v.id, { active: e.target.checked })}
                            />
                            Active
                          </label>

                          <div className="text-right text-xs opacity-60">
                            {busy === `updateVariant:${v.id}` ? "Saving..." : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}