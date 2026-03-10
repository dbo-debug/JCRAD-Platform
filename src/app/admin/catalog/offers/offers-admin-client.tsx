"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  tier: string | null;
  inventory_qty?: number | null;
  inventory_unit?: string | null;
};

type Offer = {
  id: string;
  product_id: string;
  status: string;
  min_order: number;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number;
  allow_bulk: boolean;
  allow_copack: boolean;
  products?: Product;
};

const blank = {
  id: "",
  product_id: "",
  status: "draft",
  min_order: 0,
  bulk_cost_per_lb: "",
  bulk_sell_per_lb: 0,
  allow_bulk: true,
  allow_copack: true,
};

export default function OffersAdminClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [tier, setTier] = useState("");

  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  async function loadProducts() {
    const res = await fetch("/api/admin/products");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Products load failed (${res.status})`);
    setProducts(json.products || []);
  }

  async function loadOffers() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (type) params.set("type", type);
    if (tier) params.set("tier", tier);

    const res = await fetch(`/api/admin/offers?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Offers load failed (${res.status})`);
    setOffers(json.offers || []);
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([loadProducts(), loadOffers()]);
    } catch (e: any) {
      setError(e?.message || "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveOffer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Save failed (${res.status})`);

      setForm(blank);
      await loadOffers();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div style={{ padding: 24, display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Admin Offers</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product name" />
        <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="status" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="category" />
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="type" />
        <input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="tier" />
        <button onClick={refresh} disabled={busy}>{busy ? "Loading..." : "Filter"}</button>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>{form.id ? "Edit Offer" : "Create Offer"}</strong>
        <select value={form.product_id} onChange={(e) => setForm((f: any) => ({ ...f, product_id: e.target.value }))}>
          <option value="">Select product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={form.status} onChange={(e) => setForm((f: any) => ({ ...f, status: e.target.value }))}>
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
        <input type="number" step="0.01" value={form.min_order} onChange={(e) => setForm((f: any) => ({ ...f, min_order: Number(e.target.value) }))} placeholder="min order (lbs)" />
        <input type="number" step="0.01" value={form.bulk_cost_per_lb} onChange={(e) => setForm((f: any) => ({ ...f, bulk_cost_per_lb: e.target.value }))} placeholder="bulk cost per lb (optional)" />
        <input type="number" step="0.01" value={form.bulk_sell_per_lb} onChange={(e) => setForm((f: any) => ({ ...f, bulk_sell_per_lb: Number(e.target.value) }))} placeholder="bulk sell per lb" />

        <label style={{ display: "flex", gap: 6 }}>
          <input type="checkbox" checked={form.allow_bulk} onChange={(e) => setForm((f: any) => ({ ...f, allow_bulk: e.target.checked }))} /> allow_bulk
        </label>
        <label style={{ display: "flex", gap: 6 }}>
          <input type="checkbox" checked={form.allow_copack} onChange={(e) => setForm((f: any) => ({ ...f, allow_copack: e.target.checked }))} /> allow_copack
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveOffer} disabled={busy}>{busy ? "Saving..." : "Save Offer"}</button>
          <button onClick={() => setForm(blank)} disabled={busy}>Clear</button>
        </div>
      </div>

      {error && <div style={{ color: "#a00" }}>{error}</div>}

      <div style={{ border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #ddd", fontWeight: 700 }}>Offers ({offers.length})</div>
        <div style={{ display: "grid", gap: 8, padding: 10 }}>
          {offers.map((o) => (
            <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{o.products?.name || productById[o.product_id]?.name || o.product_id}</strong>
                <span>{o.status}</span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {o.products?.category || "-"} / {o.products?.type || "-"} / {o.products?.tier || "-"}
              </div>
              <div style={{ fontSize: 13 }}>
                Sell ${Number(o.bulk_sell_per_lb || 0).toFixed(2)}/lb | Min {Number(o.min_order || 0)} lbs | bulk={String(o.allow_bulk)} copack={String(o.allow_copack)}
              </div>
              <div style={{ fontSize: 13 }}>
                Product inventory: {Number(o.products?.inventory_qty || 0)} {o.products?.inventory_unit || "lb"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setForm({
                  id: o.id,
                  product_id: o.product_id,
                  status: o.status || "draft",
                  min_order: Number(o.min_order || 0),
                  bulk_cost_per_lb: o.bulk_cost_per_lb ?? "",
                  bulk_sell_per_lb: Number(o.bulk_sell_per_lb || 0),
                  allow_bulk: !!o.allow_bulk,
                  allow_copack: !!o.allow_copack,
                })}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
