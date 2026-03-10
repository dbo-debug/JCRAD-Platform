"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "flower" | "concentrate" | "vape" | "pre_roll";

type Sku = {
  id: string;
  name: string;
  category: Category;
  packaging_type: string | null;
  size_grams: number | null;
  pack_qty: number | null;
  vape_device: string | null;
  vape_fill_grams: number | null;
  unit_cost: number | null;
  description: string | null;
  compliance_status: string | null;
  front_image_url: string | null;
  back_image_url: string | null;
};

type Tier = {
  id?: string;
  packaging_sku_id: string;
  moq: number;
  unit_price: number;
};

const blank = {
  id: "",
  name: "",
  category: "flower" as Category,
  flower_container: "bag" as "bag" | "jar",
  size_grams: 3.5,
  pack_qty: "",
  vape_device: "",
  vape_fill_grams: "",
  unit_cost: "",
  description: "",
  compliance_status: "pending",
  front_image_url: "",
  back_image_url: "",
};

export default function PackagingAdminClient() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [form, setForm] = useState<any>(blank);
  const [editingTiers, setEditingTiers] = useState<Array<{ moq: number; unit_price: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skuTiers = useMemo(
    () => tiers.filter((t) => t.packaging_sku_id === selectedSkuId).sort((a, b) => a.moq - b.moq),
    [tiers, selectedSkuId]
  );

  async function refresh() {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/packaging");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Load failed (${res.status})`);
      setBusy(false);
      return;
    }

    setSkus(json.skus || []);
    setTiers(json.tiers || []);
    setBusy(false);
  }

  async function saveSku() {
    setBusy(true);
    setError(null);

    const parsedPackQty =
      form.pack_qty === "" || form.pack_qty == null || Number.isNaN(Number(form.pack_qty))
        ? 1
        : Number(form.pack_qty);

    const payload: Record<string, unknown> = {
      action: "upsert_sku",
      id: form.id || null,
      name: form.name,
      category: form.category,
      size_grams: form.size_grams === "" ? null : Number(form.size_grams),
      pack_qty: form.category === "pre_roll" ? parsedPackQty : null,
      vape_device: form.vape_device === "" ? null : form.vape_device,
      vape_fill_grams: form.vape_fill_grams === "" ? null : Number(form.vape_fill_grams),
      unit_cost: form.unit_cost === "" ? null : Number(form.unit_cost),
      description: form.description,
      compliance_status: form.compliance_status,
      front_image_url: form.front_image_url,
      back_image_url: form.back_image_url,
    };
    if (form.category === "flower") payload.flower_container = form.flower_container || "bag";

    if (form.category === "flower") {
      payload.vape_device = null;
      payload.vape_fill_grams = null;
    }
    if (form.category === "concentrate") {
      payload.vape_device = null;
      payload.vape_fill_grams = null;
    }
    if (form.category === "vape") {
      payload.size_grams = null;
    }
    if (form.category === "pre_roll") {
      payload.vape_device = null;
      payload.vape_fill_grams = null;
    }

    const res = await fetch("/api/admin/packaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Save failed (${res.status})`);
      setBusy(false);
      return;
    }

    const newId = json?.sku?.id || form.id;
    setForm(blank);
    await refresh();
    if (newId) setSelectedSkuId(newId);
    setBusy(false);
  }

  async function saveTiers() {
    if (!selectedSkuId) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/packaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_tiers",
        packaging_sku_id: selectedSkuId,
        tiers: editingTiers,
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Tier save failed (${res.status})`);
      setBusy(false);
      return;
    }

    await refresh();
    setBusy(false);
  }

  async function uploadImage(side: "front" | "back", file: File | null) {
    if (!file) return;

    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("side", side);

    const res = await fetch("/api/admin/packaging/upload-image", {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error || `Upload failed (${res.status})`);
      setBusy(false);
      return;
    }

    if (side === "front") setForm((f: any) => ({ ...f, front_image_url: json.url || "" }));
    if (side === "back") setForm((f: any) => ({ ...f, back_image_url: json.url || "" }));

    setBusy(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setEditingTiers(skuTiers.map((t) => ({ moq: Number(t.moq), unit_price: Number(t.unit_price) })));
  }, [selectedSkuId, skuTiers]);

  useEffect(() => {
    if (form.category === "flower" && ![3.5, 5, 7, 14, 28].includes(Number(form.size_grams || 0))) {
      setForm((f: any) => ({ ...f, size_grams: 3.5 }));
    }
    if (form.category === "concentrate") {
      setForm((f: any) => ({ ...f, size_grams: 1 }));
    }
    if (form.category === "pre_roll") {
      const size = Number(form.size_grams || 0);
      const qty = Number(form.pack_qty || 1);
      if (qty === 5 && size === 1) {
        setForm((f: any) => ({ ...f, size_grams: 0.75 }));
      }
    }
    if (form.category === "vape") {
      if (!["510_cart", "all_in_one"].includes(String(form.vape_device || ""))) {
        setForm((f: any) => ({ ...f, vape_device: "510_cart" }));
      }
      if (![0.5, 1].includes(Number(form.vape_fill_grams || 0))) {
        setForm((f: any) => ({ ...f, vape_fill_grams: 1 }));
      }
    }
  }, [form.category, form.size_grams, form.pack_qty, form.vape_device, form.vape_fill_grams]);

  const invalidPreRollFivePack = form.category === "pre_roll" && Number(form.pack_qty || 0) === 5 && Number(form.size_grams || 0) === 1;
  const setPackQty = (pack_qty: number) => setForm((f: any) => ({ ...f, pack_qty }));

  return (
    <div style={{ padding: 24, display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Admin Packaging</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>{form.id ? "Edit Packaging SKU" : "Create Packaging SKU"}</strong>
        <input value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="name" />

        <label>Category</label>
        <select value={form.category} onChange={(e) => setForm((f: any) => ({ ...f, category: e.target.value as Category }))}>
          <option value="flower">flower</option>
          <option value="concentrate">concentrate</option>
          <option value="vape">vape</option>
          <option value="pre_roll">pre_roll</option>
        </select>

        {form.category === "flower" && (
          <>
            <label>Container</label>
            <select
              value={String(form.flower_container || "bag")}
              onChange={(e) => setForm((f: any) => ({ ...f, flower_container: e.target.value as "bag" | "jar" }))}
            >
              <option value="bag">bag</option>
              <option value="jar">jar</option>
            </select>
          </>
        )}

        {(form.category === "flower" || form.category === "concentrate") && (
          <>
            <label>Size grams</label>
            <select value={String(form.size_grams)} onChange={(e) => setForm((f: any) => ({ ...f, size_grams: Number(e.target.value) }))}>
              {form.category === "flower" ? (
                <>
                  <option value="3.5">3.5g</option>
                  <option value="5">5g</option>
                  <option value="7">7g</option>
                  <option value="14">14g</option>
                  <option value="28">28g</option>
                </>
              ) : (
                <option value="1">1g</option>
              )}
            </select>
          </>
        )}

        {form.category === "vape" && (
          <>
            <label>Device</label>
            <select value={String(form.vape_device || "")} onChange={(e) => setForm((f: any) => ({ ...f, vape_device: e.target.value }))}>
              <option value="510_cart">510_cart</option>
              <option value="all_in_one">all_in_one</option>
            </select>
            <label>Fill grams</label>
            <select value={String(form.vape_fill_grams || "1")} onChange={(e) => setForm((f: any) => ({ ...f, vape_fill_grams: Number(e.target.value) }))}>
              <option value="0.5">0.5g</option>
              <option value="1">1g</option>
            </select>
          </>
        )}

        {form.category === "pre_roll" && (
          <>
            <label>Pre-roll size</label>
            <select value={String(form.size_grams)} onChange={(e) => setForm((f: any) => ({ ...f, size_grams: Number(e.target.value) }))}>
              <option value="0.5">0.5g</option>
              <option value="0.75">0.75g</option>
              <option value="1">1g</option>
            </select>

            <label>Pre-roll qty</label>
            <select value={String(form.pack_qty ?? 1)} onChange={(e) => setPackQty(e.target.value === "" ? 1 : Number(e.target.value))}>
              <option value="1">1</option>
              <option value="5">5</option>
            </select>

            {invalidPreRollFivePack && (
              <div style={{ color: "#a00", fontSize: 13 }}>
                5-pack pre-roll packaging cannot use 1g size.
              </div>
            )}
          </>
        )}

        <label>Unit cost (JC RAD COGS)</label>
        <input
          type="number"
          step="0.0001"
          value={form.unit_cost}
          onChange={(e) => setForm((f: any) => ({ ...f, unit_cost: e.target.value }))}
          placeholder="unit_cost"
        />

        <label>Description</label>
        <textarea value={form.description} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} placeholder="description" />

        <label>Compliance status</label>
        <select value={form.compliance_status} onChange={(e) => setForm((f: any) => ({ ...f, compliance_status: e.target.value }))}>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>

        <div style={{ display: "grid", gap: 8 }}>
          <label>Front image upload (optional)</label>
          <input type="file" onChange={(e) => uploadImage("front", e.target.files?.[0] || null)} />
          <input value={form.front_image_url} onChange={(e) => setForm((f: any) => ({ ...f, front_image_url: e.target.value }))} placeholder="front_image_url" />
          <label>Back image upload (optional)</label>
          <input type="file" onChange={(e) => uploadImage("back", e.target.files?.[0] || null)} />
          <input value={form.back_image_url} onChange={(e) => setForm((f: any) => ({ ...f, back_image_url: e.target.value }))} placeholder="back_image_url" />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveSku} disabled={busy || invalidPreRollFivePack}>{busy ? "Saving..." : "Save SKU"}</button>
          <button onClick={() => setForm(blank)} disabled={busy}>Clear</button>
        </div>
      </div>

      {error && <div style={{ color: "#a00" }}>{error}</div>}

      <div style={{ border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #ddd", fontWeight: 700 }}>Packaging SKUs ({skus.length})</div>
        <div style={{ display: "grid", gap: 8, padding: 10 }}>
          {skus.map((s) => (
            <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{s.name}</strong>
                <span>{s.compliance_status || "-"}</span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {s.category} | {s.packaging_type || "-"} | size={s.size_grams || "-"} | qty={s.pack_qty || "-"} | device={s.vape_device || "-"} | fill={s.vape_fill_grams || "-"} | unit_cost=${Number(s.unit_cost || 0).toFixed(2)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => {
                  setSelectedSkuId(s.id);
                  setForm({
                    id: s.id,
                    name: s.name || "",
                    category: s.category || "flower",
                    flower_container: s.packaging_type === "flower_in_jar" ? "jar" : "bag",
                    size_grams: s.size_grams ?? "",
                    pack_qty: s.pack_qty ?? "",
                    vape_device: s.vape_device ?? "",
                    vape_fill_grams: s.vape_fill_grams ?? "",
                    unit_cost: (s as any).unit_cost ?? "",
                    description: s.description || "",
                    compliance_status: s.compliance_status || "pending",
                    front_image_url: s.front_image_url || "",
                    back_image_url: s.back_image_url || "",
                  });
                }}>Edit + Tiers</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedSkuId && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
          <strong>Price Tiers for SKU {selectedSkuId}</strong>
          {editingTiers.map((t, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                value={t.moq}
                onChange={(e) => setEditingTiers((arr) => arr.map((x, i) => i === idx ? { ...x, moq: Number(e.target.value) } : x))}
                placeholder="MOQ"
              />
              <input
                type="number"
                step="0.01"
                value={t.unit_price}
                onChange={(e) => setEditingTiers((arr) => arr.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))}
                placeholder="Unit Price"
              />
              <button onClick={() => setEditingTiers((arr) => arr.filter((_, i) => i !== idx))}>Remove</button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditingTiers((arr) => [...arr, { moq: 1, unit_price: 0 }])}>Add Tier</button>
            <button onClick={saveTiers} disabled={busy}>{busy ? "Saving..." : "Save Tiers"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
