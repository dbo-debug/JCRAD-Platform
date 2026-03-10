"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORY_UNIT_SIZES, PRE_ROLL_UNIT_SIZES } from "@/lib/pricing";
import { type PackagingCategory } from "@/lib/packaging/category";

const ESTIMATE_KEY = "jc_estimate_id";

type Mode = "bulk" | "copack" | "pre_roll";

function getEstimateId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ESTIMATE_KEY) || "";
}

function setEstimateId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ESTIMATE_KEY, id);
}

function inferPackagingCategoryFromContext(mode: Mode, category: string): PackagingCategory | "" {
  if (mode === "pre_roll") return "pre_roll";
  if (category === "flower" || category === "concentrate" || category === "vape") return category;
  return "";
}

export default function OfferConfiguratorClient({
  offer,
  packagingSkus,
  packagingTiers,
  mediaUrls,
  isPreRollView,
}: {
  offer: any;
  packagingSkus: any[];
  packagingTiers: any[];
  mediaUrls: string[];
  isPreRollView: boolean;
}) {
  const category = String(offer?.products?.category || "").toLowerCase();
  const initialMode: Mode = isPreRollView && category === "flower" ? "pre_roll" : offer.allow_bulk ? "bulk" : "copack";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [quantityLbs, setQuantityLbs] = useState<number>(Number(offer.min_order || 1));
  const [units, setUnits] = useState<number>(100);
  const [unitSize, setUnitSize] = useState("3.5g");
  const [preRollPackQty, setPreRollPackQty] = useState(1);

  const [packagingMode, setPackagingMode] = useState("jcrad");
  const [packagingSkuId, setPackagingSkuId] = useState("");
  const [secondaryBagSkuId, setSecondaryBagSkuId] = useState("");
  const [extraTouchPoints] = useState(0);
  const [preRollMode, setPreRollMode] = useState("preroll_no_infusion_any_size");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPreRollMode = mode === "pre_roll";

  const unitSizeOptions = useMemo(() => {
    if (isPreRollMode) return [...PRE_ROLL_UNIT_SIZES];
    return CATEGORY_UNIT_SIZES[category] || ["1g"];
  }, [category, isPreRollMode]);

  const invalidPreRollPackSelection = isPreRollMode && preRollPackQty === 5 && unitSize === "1g";
  const requiresSecondaryBag = mode === "copack" && packagingMode === "jcrad" && category === "concentrate";

  const filteredSkus = useMemo(() => {
    return packagingSkus.filter((s) => {
      const skuCategory = String(s.category || s.applies_to || "").toLowerCase();

      if (isPreRollMode) {
        if (skuCategory && skuCategory !== "pre_roll") return false;
        const skuSize = Number(s.size_grams || 0);
        const skuQty = Number(s.pack_qty || 0);
        const unitSizeNumber = Number(unitSize.replace("g", ""));
        if (skuSize > 0 && Math.abs(skuSize - unitSizeNumber) > 1e-9) return false;
        if (skuQty > 0 && skuQty !== preRollPackQty) return false;
        return true;
      }

      if (skuCategory && skuCategory !== category) return false;
      return true;
    });
  }, [packagingSkus, category, isPreRollMode, unitSize, preRollPackQty]);

  const secondaryBagOptions = useMemo(() => {
    return packagingSkus.filter((s) => {
      const packagingType = String((s as any).packaging_type || "").toLowerCase();
      const sizeGrams = Number((s as any).size_grams || 0);
      const active = (s as any).active === true;
      if (!active) return false;
      if (packagingType !== "flower_in_bag") return false;
      if (Math.abs(sizeGrams - 3.5) > 1e-9) return false;

      const role = String((s as any).packaging_role || "").toLowerCase();
      if (role && role !== "secondary") return false;

      const contexts = Array.isArray((s as any).workflow_contexts)
        ? ((s as any).workflow_contexts as unknown[]).map((v) => String(v || "").toLowerCase())
        : [];
      const appliesTo = String((s as any).applies_to || (s as any).category || "").toLowerCase();
      return contexts.includes("concentrate") || appliesTo === "concentrate";
    });
  }, [packagingSkus]);

  useEffect(() => {
    if (!unitSizeOptions.includes(unitSize)) {
      setUnitSize(unitSizeOptions[0]);
    }
  }, [unitSizeOptions, unitSize]);

  useEffect(() => {
    if (isPreRollMode) {
      setPackagingMode("jcrad");
    }
  }, [isPreRollMode]);

  useEffect(() => {
    if (!requiresSecondaryBag) {
      setSecondaryBagSkuId("");
      return;
    }

    if (!secondaryBagOptions.some((s: any) => String(s.id) === secondaryBagSkuId)) {
      setSecondaryBagSkuId("");
    }
  }, [requiresSecondaryBag, secondaryBagOptions, secondaryBagSkuId]);

  async function ensureEstimate() {
    const existing = getEstimateId();
    if (existing) return existing;

    const res = await fetch("/api/estimate/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        notes,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || `Estimate create failed (${res.status})`);
    }

    const estimateId = String(json?.estimate?.id || "");
    if (!estimateId) throw new Error("Estimate id missing");
    setEstimateId(estimateId);
    return estimateId;
  }

  async function addToEstimate() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (invalidPreRollPackSelection) {
        throw new Error("5-pack pre-rolls are only allowed in 0.5g or 0.75g.");
      }
      if (requiresSecondaryBag && !secondaryBagSkuId) {
        throw new Error("Secondary bag (required) must be selected for concentrate JC RAD packaging.");
      }

      const estimateId = await ensureEstimate();
      let packagingSubmissionId: string | null = null;
      if (mode === "copack" && packagingMode === "customer") {
        if (!frontFile || !backFile) {
          throw new Error("Upload both front and back artwork for customer packaging.");
        }
        const packagingCategory = inferPackagingCategoryFromContext(mode, category);
        if (!packagingCategory) throw new Error("Unable to infer packaging category for this product.");
        const form = new FormData();
        form.set("estimate_id", estimateId);
        form.set("category", packagingCategory);
        form.set("notes", notes || "");
        form.set("front_file", frontFile);
        form.set("back_file", backFile);
        const submissionRes = await fetch("/api/packaging/submission/create", {
          method: "POST",
          body: form,
        });
        const submissionJson = await submissionRes.json().catch(() => ({}));
        if (!submissionRes.ok) {
          throw new Error(submissionJson?.error || `Packaging submission failed (${submissionRes.status})`);
        }
        packagingSubmissionId = String(submissionJson?.submission?.id || "");
        if (!packagingSubmissionId) throw new Error("Packaging submission id missing.");
      }

      const apiMode = mode === "pre_roll" ? "copack" : mode;

      const res = await fetch("/api/estimate/add-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate_id: estimateId,
          offer_id: offer.id,
          mode: apiMode,
          quantity_lbs: quantityLbs,
          units,
          unit_size: unitSize,
          packaging_mode: apiMode === "bulk" ? null : packagingMode,
          packaging_sku_id: apiMode === "copack" && packagingMode === "jcrad" ? packagingSkuId : null,
          secondary_packaging_sku_id:
            apiMode === "copack" && packagingMode === "jcrad" && category === "concentrate" ? secondaryBagSkuId : null,
          packaging_submission_id: packagingSubmissionId,
          extra_touch_points: apiMode === "copack" && packagingMode === "customer" ? extraTouchPoints : 0,
          pre_roll_mode: isPreRollMode ? preRollMode : null,
          pre_roll_pack_qty: isPreRollMode ? preRollPackQty : 1,
          notes,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Add line failed (${res.status})`);
      }

      setSuccess("Line added to estimate cart.");
    } catch (e: any) {
      setError(e?.message || "Add to estimate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {mediaUrls.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mediaUrls.slice(0, 3).map((url) => (
            <img key={url} src={url} alt="product media" style={{ width: 220, borderRadius: 8, border: "1px solid #eee" }} />
          ))}
        </div>
      )}

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {offer.allow_bulk && !isPreRollView && (
            <button onClick={() => setMode("bulk")} disabled={mode === "bulk"}>Bulk</button>
          )}
          {offer.allow_copack && (
            <button onClick={() => setMode("copack")} disabled={mode === "copack" || isPreRollView}>Copack</button>
          )}
          {offer.allow_copack && category === "flower" && (
            <button onClick={() => setMode("pre_roll")} disabled={mode === "pre_roll"}>Pre-roll</button>
          )}
        </div>

        {mode === "bulk" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <label>Quantity (lbs)</label>
            <input type="number" min={offer.min_order || 0} step="0.01" value={quantityLbs} onChange={(e) => setQuantityLbs(Number(e.target.value))} />
            <div style={{ fontSize: 13, opacity: 0.8 }}>Min order: {Number(offer.min_order || 0)} lbs</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <label>Units</label>
            <input type="number" min={1} value={units} onChange={(e) => setUnits(Number(e.target.value))} />

            <label>{isPreRollMode ? "Pre-roll size" : "Unit size"}</label>
            <select value={unitSize} onChange={(e) => setUnitSize(e.target.value)}>
              {unitSizeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>

            {isPreRollMode && (
              <>
                <label>Pre-roll qty per package</label>
                <select value={preRollPackQty} onChange={(e) => setPreRollPackQty(Number(e.target.value))}>
                  <option value={1}>1</option>
                  <option value={5}>5</option>
                </select>
                {invalidPreRollPackSelection && (
                  <div style={{ color: "#a00", fontSize: 13 }}>
                    5-pack pre-rolls are only allowed in 0.5g or 0.75g (not 1g).
                  </div>
                )}

                <label>Infusion type (labor mode)</label>
                <select value={preRollMode} onChange={(e) => setPreRollMode(e.target.value)}>
                  <option value="preroll_no_infusion_any_size">preroll_no_infusion_any_size</option>
                  <option value="internal_infusion">internal_infusion</option>
                  <option value="external_infusion">external_infusion</option>
                  <option value="5pk_no_infusion">5pk_no_infusion</option>
                  <option value="5pk_internal_dry_infusion">5pk_internal_dry_infusion</option>
                  <option value="5pk_external_infusion">5pk_external_infusion</option>
                </select>
              </>
            )}

            <label>Packaging mode</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPackagingMode("jcrad")} disabled={packagingMode === "jcrad"}>JC RAD Packaging</button>
              {!isPreRollMode && (
                <button onClick={() => setPackagingMode("customer")} disabled={packagingMode === "customer"}>Customer Packaging</button>
              )}
            </div>

            {packagingMode === "jcrad" ? (
              <>
                <label>Select Packaging SKU</label>
                <select value={packagingSkuId} onChange={(e) => setPackagingSkuId(e.target.value)}>
                  <option value="">Select</option>
                  {filteredSkus.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {requiresSecondaryBag && (
                  <>
                    <label>Secondary bag (required)</label>
                    <select value={secondaryBagSkuId} onChange={(e) => setSecondaryBagSkuId(e.target.value)}>
                      <option value="">Select</option>
                      {secondaryBagOptions.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {packagingSkuId && (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    Tiers: {(packagingTiers || [])
                      .filter((t: any) => t.packaging_sku_id === packagingSkuId)
                      .map((t: any) => `MOQ ${t.moq}: $${Number(t.unit_price).toFixed(2)}`)
                      .join(" | ") || "none"}
                  </div>
                )}
              </>
            ) : (
              <>
                <label>Front artwork</label>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setFrontFile(e.target.files?.[0] || null)} />
                <label>Back artwork</label>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setBackFile(e.target.files?.[0] || null)} />
                <div style={{ fontSize: 13, color: "#355060" }}>
                  Artwork uploads inline and is attached to this estimate line.
                </div>
              </>
            )}
          </div>
        )}

        <hr />

        <label>Customer name</label>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
        <label>Customer email</label>
        <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Customer email" />
        <label>Customer phone</label>
        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Customer phone" />
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

        <button
          onClick={addToEstimate}
          disabled={
            busy ||
            invalidPreRollPackSelection ||
            ((mode !== "bulk") && packagingMode === "jcrad" && !packagingSkuId) ||
            (requiresSecondaryBag && !secondaryBagSkuId)
          }
        >
          {busy ? "Adding..." : "Add to Estimate"}
        </button>

        {error && <div style={{ color: "#a00" }}>{error}</div>}
        {success && <div style={{ color: "#176f2c" }}>{success}</div>}
      </div>
    </div>
  );
}
