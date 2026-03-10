"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProductMediaManager from "./product-media-manager";

type Offer = {
  id: string;
  product_id: string;
  status: "draft" | "published";
  min_order: number;
  bulk_cost_per_lb: number | null;
  bulk_sell_per_lb: number;
  material_cost_basis: "per_lb" | "per_g" | "per_1000g" | null;
  material_cost_input: number | null;
  material_cost_per_g: number | null;
  allow_bulk: boolean;
  allow_copack: boolean;
};

type Product = {
  id: string;
  name: string;
  category: "flower" | "concentrate" | "vape" | null;
  type: string | null;
  tier: string | null;
  description: string | null;
  inventory_qty: number;
  inventory_unit: "lb" | "g";
  offer?: Offer | null;
};

type ProductForm = {
  id: string;
  name: string;
  category: "flower" | "concentrate" | "vape";
  type: string;
  tier: string;
  description: string;
  inventory_qty: number;
  inventory_unit: "lb" | "g";
  offer_status: "draft" | "published";
  min_order: number;
  bulk_sell_per_lb: number;
  bulk_cost_per_lb: string;
  material_cost_basis: "per_lb" | "per_g" | "per_1000g";
  material_cost_input: string;
  allow_bulk: boolean;
  allow_copack: boolean;
};

const FLOWER_TIERS = ["indoor", "light_assist", "full_term"];
const FLOWER_TYPES = ["shake", "smalls", "mediums", "bigs"];
const CONCENTRATE_TYPES = [
  "thca",
  "kief",
  "bubble_hash",
  "freeze_dried_rosin",
  "shatter",
  "diamonds",
  "badder",
  "rosin",
];
const VAPE_TYPES = ["distillate", "liquid_diamonds", "rosin", "live_resin"];

const blankForm: ProductForm = {
  id: "",
  name: "",
  category: "flower",
  type: FLOWER_TYPES[0],
  tier: "",
  description: "",
  inventory_qty: 0,
  inventory_unit: "lb",
  offer_status: "draft",
  min_order: 0,
  bulk_sell_per_lb: 0,
  bulk_cost_per_lb: "",
  material_cost_basis: "per_lb",
  material_cost_input: "",
  allow_bulk: true,
  allow_copack: true,
};
const LB_TO_G = 453.592;

function defaultBasisForCategory(category: ProductForm["category"]): ProductForm["material_cost_basis"] {
  return category === "flower" ? "per_lb" : "per_g";
}

function categoryLabel(category: ProductForm["category"] | Product["category"]) {
  if (!category) return "Unknown";
  if (category === "vape") return "Vape Oil";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatMoney(value: number | null | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function roundTo2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validationMessageForPublished(form: ProductForm): string | null {
  if (!form.name.trim()) return "Strain name is required to publish.";
  if (!form.type) return "Type is required to publish.";
  if (form.category === "flower" && !form.tier) return "Tier is required for flower products to publish.";
  const materialInput = Number(form.material_cost_input);
  const hasValidMaterialInput = form.material_cost_input.trim() !== "" && Number.isFinite(materialInput) && materialInput >= 0;
  if ((!Number.isFinite(form.bulk_sell_per_lb) || form.bulk_sell_per_lb <= 0) && !hasValidMaterialInput) {
    return "Provide sell price or valid material cost to publish.";
  }
  if (!Number.isFinite(form.min_order) || form.min_order < 0) {
    return "Minimum order must be 0 or greater.";
  }
  return null;
}

function isLiveStatus(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "published";
}

export default function ProductsAdminClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedProductIdForMedia, setSelectedProductIdForMedia] = useState("");
  const [targetMarkupPctDecimal, setTargetMarkupPctDecimal] = useState(0.2);
  const [autoSellEnabled, setAutoSellEnabled] = useState(true);
  const [lastAutoSell, setLastAutoSell] = useState<number | null>(null);

  const typeOptions = useMemo(() => {
    if (form.category === "flower") return FLOWER_TYPES;
    if (form.category === "concentrate") return CONCENTRATE_TYPES;
    return VAPE_TYPES;
  }, [form.category]);

  const refresh = useCallback(async (searchValue: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/products${searchValue ? `?q=${encodeURIComponent(searchValue)}` : ""}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || `Load failed (${res.status})`);
      setBusy(false);
      return;
    }
    setProducts((json.products || []) as Product[]);
    setBusy(false);
  }, []);

  const materialInputRaw = form.material_cost_input.trim();
  const materialInputNum = materialInputRaw === "" ? null : Number(materialInputRaw);
  const materialInputValid = materialInputNum != null && Number.isFinite(materialInputNum) && materialInputNum >= 0;
  const normalizedCostPerG = materialInputValid
    ? form.material_cost_basis === "per_lb"
      ? materialInputNum / LB_TO_G
      : form.material_cost_basis === "per_g"
        ? materialInputNum
        : materialInputNum / 1000
    : null;
  const computedCostPerLb = normalizedCostPerG == null ? null : normalizedCostPerG * LB_TO_G;
  const computedCostPer1000g = normalizedCostPerG == null ? null : normalizedCostPerG * 1000;
  const bulkCostNum = form.bulk_cost_per_lb.trim() === "" ? null : Number(form.bulk_cost_per_lb);
  const bulkCostValid = bulkCostNum != null && Number.isFinite(bulkCostNum) && bulkCostNum >= 0;
  const autoSellCostBasis = bulkCostValid
    ? bulkCostNum
    : form.inventory_unit === "g"
      ? normalizedCostPerG
      : computedCostPerLb;
  const autoSellValue = autoSellCostBasis == null ? null : roundTo2(autoSellCostBasis * (1 + targetMarkupPctDecimal));

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/admin/settings/pricing");
      const json = await res.json().catch(() => ({}));
      if (!active || !res.ok) return;
      const pctPercent = Number((json as any)?.target_markup_pct);
      if (Number.isFinite(pctPercent) && pctPercent >= 0) {
        setTargetMarkupPctDecimal(pctPercent / 100);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!autoSellEnabled || autoSellValue == null) return;
    setForm((prev) => ({ ...prev, bulk_sell_per_lb: autoSellValue }));
    setLastAutoSell(autoSellValue);
  }, [autoSellEnabled, autoSellValue]);

  async function save() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    const publishValidationError =
      form.offer_status === "published" ? validationMessageForPublished(form) : null;
    if (publishValidationError) {
      setForm((prev) => ({ ...prev, offer_status: "draft" }));
      setError(`${publishValidationError} Status changed to Draft.`);
      setBusy(false);
      return;
    }

    const hasBasis = !!form.material_cost_basis;
    const hasInput = materialInputRaw !== "";
    if (hasBasis !== hasInput) {
      setError("material_cost_basis and material_cost_input must both be provided together.");
      setBusy(false);
      return;
    }
    if (hasInput && !materialInputValid) {
      setError("material_cost_input must be a finite number >= 0.");
      setBusy(false);
      return;
    }

    const payload = {
      product: {
        id: form.id || null,
        name: form.name.trim(),
        category: form.category,
        type: form.type || null,
        tier: form.category === "flower" ? form.tier || null : null,
        description: form.description || null,
        inventory_qty: form.inventory_qty,
        inventory_unit: form.inventory_unit,
      },
      offer: {
        status: form.offer_status,
        min_order: form.min_order,
        bulk_sell_per_lb: form.bulk_sell_per_lb,
        bulk_cost_per_lb: form.bulk_cost_per_lb === "" ? null : Number(form.bulk_cost_per_lb),
        material_cost_basis: hasInput ? form.material_cost_basis : null,
        material_cost_input: hasInput ? materialInputNum : null,
        allow_bulk: form.allow_bulk,
        allow_copack: form.allow_copack,
      },
    };

    const res = await fetch("/api/admin/product-bundle", {
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

    const savedProductId = String(json?.product?.id || "");
    const savedStatus = String(json?.offer?.status || form.offer_status);

    setForm(blankForm);
    setAutoSellEnabled(true);
    setLastAutoSell(null);
    await refresh(q);

    if (savedProductId) setSelectedProductIdForMedia(savedProductId);

    setSuccess(
      savedStatus === "published"
        ? "Saved - LIVE on Menu"
        : "Saved - Draft (not visible on Menu)"
    );
    setBusy(false);
  }

  function startEdit(product: Product) {
    setSuccess(null);
    const offer = product.offer;
    setAutoSellEnabled(true);
    setLastAutoSell(null);
    setForm({
      id: product.id,
      name: product.name || "",
      category: (product.category || "flower") as ProductForm["category"],
      type: product.type || "",
      tier: product.tier || "",
      description: product.description || "",
      inventory_qty: Number(product.inventory_qty || 0),
      inventory_unit: (product.inventory_unit || "lb") as "lb" | "g",
      offer_status: (offer?.status || "draft") as "draft" | "published",
      min_order: Number(offer?.min_order || 0),
      bulk_sell_per_lb: Number(offer?.bulk_sell_per_lb || 0),
      bulk_cost_per_lb:
        offer?.bulk_cost_per_lb == null ? "" : String(Number(offer.bulk_cost_per_lb)),
      material_cost_basis:
        offer?.material_cost_basis === "per_lb" || offer?.material_cost_basis === "per_g" || offer?.material_cost_basis === "per_1000g"
          ? offer.material_cost_basis
          : defaultBasisForCategory((product.category || "flower") as ProductForm["category"]),
      material_cost_input:
        offer?.material_cost_input == null ? "" : String(Number(offer.material_cost_input)),
      allow_bulk: typeof offer?.allow_bulk === "boolean" ? offer.allow_bulk : true,
      allow_copack: typeof offer?.allow_copack === "boolean" ? offer.allow_copack : true,
    });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh("");
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const previewLive = isLiveStatus(form.offer_status);
  const selectedProductForMedia = products.find((p) => p.id === selectedProductIdForMedia) || null;

  return (
    <div style={{ padding: 24, display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Admin Products</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" style={{ padding: 8, minWidth: 240 }} />
        <button onClick={() => void refresh(q)} disabled={busy}>{busy ? "Loading..." : "Search"}</button>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>{form.id ? "Edit Product" : "Create Product"}</strong>

        <label>Category</label>
        <select
          value={form.category}
          onChange={(e) => {
            const nextCategory = e.target.value as ProductForm["category"];
            const nextTypeOptions =
              nextCategory === "flower"
                ? FLOWER_TYPES
                : nextCategory === "concentrate"
                  ? CONCENTRATE_TYPES
                  : VAPE_TYPES;
            setSuccess(null);
            setForm((f) => ({
              ...f,
              category: nextCategory,
              type: nextTypeOptions.includes(f.type) ? f.type : nextTypeOptions[0] || "",
              tier: nextCategory === "flower" ? f.tier : "",
              material_cost_basis: defaultBasisForCategory(nextCategory),
            }));
          }}
        >
          <option value="flower">Flower</option>
          <option value="concentrate">Concentrate</option>
          <option value="vape">Vape Oil</option>
        </select>

        <label>Strain name</label>
        <input
          value={form.name}
          onChange={(e) => {
            setSuccess(null);
            setForm((f) => ({ ...f, name: e.target.value }));
          }}
          placeholder="name"
        />

        {form.category === "flower" && (
          <>
            <label>Tier</label>
            <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>
              <option value="">Select tier</option>
              {FLOWER_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </>
        )}

        <label>Type</label>
        <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
          <option value="">Select type</option>
          {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <label>Description</label>
        <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="description" rows={3} />

        <label>Inventory qty</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.inventory_qty}
          onChange={(e) => setForm((f) => ({ ...f, inventory_qty: Number(e.target.value) }))}
        />

        <label>Inventory unit</label>
        <select
          value={form.inventory_unit}
          onChange={(e) => setForm((f) => ({ ...f, inventory_unit: e.target.value as ProductForm["inventory_unit"] }))}
        >
          <option value="lb">lb</option>
          <option value="g">g</option>
        </select>

        <div style={{ borderTop: "1px solid #eee", paddingTop: 10, display: "grid", gap: 8 }}>
          <strong>Commercial Offer</strong>

          <label>Menu Visibility</label>
          <div style={{ display: "inline-flex", border: "1px solid #c8c8c8", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, offer_status: "draft" }))}
              style={{
                border: 0,
                padding: "8px 12px",
                cursor: "pointer",
                background: form.offer_status === "draft" ? "#e5e7eb" : "#fff",
                color: "#111",
                fontWeight: form.offer_status === "draft" ? 700 : 500,
              }}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, offer_status: "published" }))}
              style={{
                border: 0,
                borderLeft: "1px solid #c8c8c8",
                padding: "8px 12px",
                cursor: "pointer",
                background: form.offer_status === "published" ? "#d1fae5" : "#fff",
                color: form.offer_status === "published" ? "#065f46" : "#111",
                fontWeight: form.offer_status === "published" ? 700 : 500,
              }}
            >
              Published
            </button>
          </div>

          <label>Minimum order (lbs)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.min_order}
            onChange={(e) => setForm((f) => ({ ...f, min_order: Number(e.target.value) }))}
          />

          <label>Sell price ($/lb)</label>
          <div style={{ display: "grid", gap: 6 }}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.bulk_sell_per_lb}
              onChange={(e) => {
                const nextSell = Number(e.target.value);
                setForm((f) => ({ ...f, bulk_sell_per_lb: nextSell }));
                if (autoSellEnabled && lastAutoSell != null && Math.abs(nextSell - lastAutoSell) > 1e-9) {
                  setAutoSellEnabled(false);
                }
              }}
            />
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoSellEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoSellEnabled(next);
                  if (next && autoSellValue != null) {
                    setForm((f) => ({ ...f, bulk_sell_per_lb: autoSellValue }));
                    setLastAutoSell(autoSellValue);
                  }
                }}
              />
              Auto from cost ({Math.round(targetMarkupPctDecimal * 100)}% markup)
            </label>
          </div>

          <label>Cost ($/lb) optional</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.bulk_cost_per_lb}
            onChange={(e) => setForm((f) => ({ ...f, bulk_cost_per_lb: e.target.value }))}
            placeholder="optional"
          />

          <label>Material Cost Basis</label>
          <select
            value={form.material_cost_basis}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                material_cost_basis: e.target.value as ProductForm["material_cost_basis"],
              }))
            }
          >
            <option value="per_lb">per_lb</option>
            <option value="per_g">per_g</option>
            <option value="per_1000g">L (1000g)</option>
          </select>

          <label>Material Cost Input</label>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={form.material_cost_input}
            onChange={(e) => setForm((f) => ({ ...f, material_cost_input: e.target.value }))}
            placeholder="enter basis value"
          />

          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Cost per lb: {computedCostPerLb == null ? "-" : formatMoney(computedCostPerLb)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Cost per g: {normalizedCostPerG == null ? "-" : `$${normalizedCostPerG.toFixed(4)}`}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Cost per 1000g: {computedCostPer1000g == null ? "-" : formatMoney(computedCostPer1000g)}
          </div>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.allow_bulk}
              onChange={(e) => setForm((f) => ({ ...f, allow_bulk: e.target.checked }))}
            />
            allow_bulk
          </label>

          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.allow_copack}
              onChange={(e) => setForm((f) => ({ ...f, allow_copack: e.target.checked }))}
            />
            allow_copack
          </label>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 6, background: "#f9fafb" }}>
          <strong>Menu Preview</strong>
          <div style={{ fontSize: 13 }}>
            {categoryLabel(form.category)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {form.name.trim() || "Unnamed Product"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {form.type || "-"} / {form.category === "flower" ? form.tier || "-" : "-"}
          </div>
          <div style={{ fontSize: 13 }}>
            Inventory: {Number(form.inventory_qty || 0)} {form.inventory_unit || "lb"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                padding: "2px 8px",
                background: previewLive ? "#d1fae5" : "#f3f4f6",
                color: previewLive ? "#065f46" : "#374151",
                border: "1px solid #d1d5db",
                fontWeight: 700,
              }}
            >
              {previewLive ? "LIVE" : "Draft"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Price: {formatMoney(form.bulk_sell_per_lb)}/lb</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          <button
            onClick={() => {
              setForm(blankForm);
              setError(null);
              setSuccess(null);
            }}
            disabled={busy}
          >
            Clear
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#a00" }}>{error}</div>}
      {success && <div style={{ color: "#067647" }}>{success}</div>}

      <div style={{ border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #ddd", fontWeight: 700 }}>Products ({products.length})</div>
        <div style={{ display: "grid", gap: 8, padding: 10 }}>
          {products.map((p) => {
            const offer = p.offer || null;
            const live = isLiveStatus(offer?.status);

            return (
              <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 6, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    right: 10,
                    top: 10,
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: live ? "#dcfce7" : "#f3f4f6",
                    color: live ? "#166534" : "#374151",
                  }}
                >
                  {live ? "\u2705 LIVE on Menu" : "\u23f3 Draft"}
                </div>

                <div><strong>{p.name}</strong></div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {categoryLabel(p.category)} / {p.type || "-"} / {p.tier || "-"}
                </div>
                <div style={{ fontSize: 13 }}>
                  Inventory: {Number(p.inventory_qty || 0)} {p.inventory_unit || "lb"}
                </div>
                <div style={{ fontSize: 13 }}>{p.description || ""}</div>
                <div style={{ fontSize: 13 }}>
                  {offer
                    ? `${formatMoney(offer.bulk_sell_per_lb)}/lb | Min ${Number(offer.min_order || 0)} lbs | bulk=${String(!!offer.allow_bulk)} | copack=${String(!!offer.allow_copack)}`
                    : "No offer yet"}
                </div>
                {!offer && (
                  <div style={{ fontSize: 12, color: "#b45309" }}>
                    Offer missing (will be created on next save)
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(p)}>Edit</button>
                  <button onClick={() => setSelectedProductIdForMedia(p.id)}>
                    {selectedProductIdForMedia === p.id ? "Managing Media" : "Manage Media"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>Product Media</strong>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Upload image, video, and COA assets to product-level media records.</div>
        <select value={selectedProductIdForMedia} onChange={(e) => setSelectedProductIdForMedia(e.target.value)}>
          <option value="">Select product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({categoryLabel(p.category)})</option>
          ))}
        </select>
        <ProductMediaManager
          productId={selectedProductIdForMedia}
          productName={selectedProductForMedia?.name || ""}
          productCategory={selectedProductForMedia?.category || ""}
        />
      </div>
    </div>
  );
}
