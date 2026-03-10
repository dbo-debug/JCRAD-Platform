"use client";

import { useEffect, useState } from "react";

type YieldForm = {
  flower_yield_pct: number;
  concentrate_yield_pct: number;
  preroll_yield_pct: number;
  vape_fill_yield_pct: number;
};

type PricingForm = {
  default_margin_pct: number;
  target_markup_pct: number;
  coa_base_cost_usd: number;
  extra_touch_point_cost_usd: number;
};

const DEFAULT_YIELDS: YieldForm = {
  flower_yield_pct: 92,
  concentrate_yield_pct: 95,
  preroll_yield_pct: 92,
  vape_fill_yield_pct: 97,
};

const DEFAULT_PRICING: PricingForm = {
  default_margin_pct: 20,
  target_markup_pct: 20,
  coa_base_cost_usd: 450,
  extra_touch_point_cost_usd: 0.1,
};

export default function SettingsAdminClient() {
  const [yields, setYields] = useState<YieldForm>(DEFAULT_YIELDS);
  const [pricing, setPricing] = useState<PricingForm>(DEFAULT_PRICING);
  const [busy, setBusy] = useState(false);
  const [yieldError, setYieldError] = useState<string | null>(null);
  const [yieldSuccess, setYieldSuccess] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setYieldError(null);
    setYieldSuccess(null);
    setPricingError(null);
    setPricingSuccess(null);

    const [yieldRes, pricingRes] = await Promise.all([
      fetch("/api/admin/settings/yields"),
      fetch("/api/admin/settings/pricing"),
    ]);

    const yieldJson = await yieldRes.json().catch(() => ({}));
    if (yieldRes.ok) {
      setYields({
        flower_yield_pct: Number(yieldJson?.flower_yield_pct ?? DEFAULT_YIELDS.flower_yield_pct),
        concentrate_yield_pct: Number(yieldJson?.concentrate_yield_pct ?? DEFAULT_YIELDS.concentrate_yield_pct),
        preroll_yield_pct: Number(yieldJson?.preroll_yield_pct ?? DEFAULT_YIELDS.preroll_yield_pct),
        vape_fill_yield_pct: Number(yieldJson?.vape_fill_yield_pct ?? DEFAULT_YIELDS.vape_fill_yield_pct),
      });
    } else {
      setYieldError(yieldJson?.error || `Yield load failed (${yieldRes.status})`);
    }

    const pricingJson = await pricingRes.json().catch(() => ({}));
    if (pricingRes.ok) {
      setPricing({
        default_margin_pct: Number(pricingJson?.default_margin_pct ?? DEFAULT_PRICING.default_margin_pct),
        target_markup_pct: Number(
          pricingJson?.target_markup_pct ?? DEFAULT_PRICING.target_markup_pct
        ),
        coa_base_cost_usd: Number(pricingJson?.coa_base_cost_usd ?? DEFAULT_PRICING.coa_base_cost_usd),
        extra_touch_point_cost_usd: Number(
          pricingJson?.extra_touch_point_cost_usd ?? DEFAULT_PRICING.extra_touch_point_cost_usd
        ),
      });
    } else {
      setPricingError(pricingJson?.error || `Pricing load failed (${pricingRes.status})`);
    }

    setBusy(false);
  }

  async function saveYields() {
    setBusy(true);
    setYieldError(null);
    setYieldSuccess(null);

    const fields = Object.entries(yields) as Array<[keyof YieldForm, number]>;
    for (const [key, value] of fields) {
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setYieldError(`${key} must be between 0 and 100.`);
        setBusy(false);
        return;
      }
    }

    const res = await fetch("/api/admin/settings/yields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(yields),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setYieldError(json?.error || `Yield save failed (${res.status})`);
      setBusy(false);
      return;
    }

    setYields({
      flower_yield_pct: Number(json?.flower_yield_pct ?? yields.flower_yield_pct),
      concentrate_yield_pct: Number(json?.concentrate_yield_pct ?? yields.concentrate_yield_pct),
      preroll_yield_pct: Number(json?.preroll_yield_pct ?? yields.preroll_yield_pct),
      vape_fill_yield_pct: Number(json?.vape_fill_yield_pct ?? yields.vape_fill_yield_pct),
    });
    setYieldSuccess("Yield settings saved.");
    setBusy(false);
  }

  async function savePricing() {
    setBusy(true);
    setPricingError(null);
    setPricingSuccess(null);

    if (!Number.isFinite(pricing.default_margin_pct) || pricing.default_margin_pct < 0 || pricing.default_margin_pct > 100) {
      setPricingError("Default margin % must be between 0 and 100.");
      setBusy(false);
      return;
    }
    if (!Number.isFinite(pricing.target_markup_pct) || pricing.target_markup_pct < 0 || pricing.target_markup_pct > 500) {
      setPricingError("Target markup % must be between 0 and 500.");
      setBusy(false);
      return;
    }
    if (!Number.isFinite(pricing.coa_base_cost_usd) || pricing.coa_base_cost_usd < 0) {
      setPricingError("COA base cost must be >= 0.");
      setBusy(false);
      return;
    }
    if (!Number.isFinite(pricing.extra_touch_point_cost_usd) || pricing.extra_touch_point_cost_usd < 0) {
      setPricingError("Extra touch point cost must be >= 0.");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/admin/settings/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pricing),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setPricingError(json?.error || `Pricing save failed (${res.status})`);
      setBusy(false);
      return;
    }

    setPricing({
      default_margin_pct: Number(json?.default_margin_pct ?? pricing.default_margin_pct),
      target_markup_pct: Number(json?.target_markup_pct ?? pricing.target_markup_pct),
      coa_base_cost_usd: Number(json?.coa_base_cost_usd ?? pricing.coa_base_cost_usd),
      extra_touch_point_cost_usd: Number(json?.extra_touch_point_cost_usd ?? pricing.extra_touch_point_cost_usd),
    });
    setPricingSuccess("Pricing defaults saved.");
    setBusy(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ padding: 24, display: "grid", gap: 12, maxWidth: 760 }}>
      <h1 style={{ margin: 0 }}>Admin Settings</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>Yield Assumptions</strong>

        <label>Flower yield %</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={yields.flower_yield_pct}
          onChange={(e) => setYields((v) => ({ ...v, flower_yield_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Used to estimate units from starting weight (accounts for waste/loss).
        </div>

        <label>Concentrate yield %</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={yields.concentrate_yield_pct}
          onChange={(e) => setYields((v) => ({ ...v, concentrate_yield_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Used to estimate units from starting weight (accounts for waste/loss).
        </div>

        <label>Pre-roll yield %</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={yields.preroll_yield_pct}
          onChange={(e) => setYields((v) => ({ ...v, preroll_yield_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Used to estimate units from starting weight (accounts for waste/loss).
        </div>

        <label>Vape fill yield %</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={yields.vape_fill_yield_pct}
          onChange={(e) => setYields((v) => ({ ...v, vape_fill_yield_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Used to estimate units from starting weight (accounts for waste/loss).
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveYields} disabled={busy}>{busy ? "Saving..." : "Save Yield Settings"}</button>
        </div>
        {yieldError && <div style={{ color: "#a00" }}>{yieldError}</div>}
        {yieldSuccess && <div style={{ color: "#176f2c" }}>{yieldSuccess}</div>}
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
        <strong>Pricing Defaults</strong>

        <label>Default margin (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={pricing.default_margin_pct}
          onChange={(e) => setPricing((v) => ({ ...v, default_margin_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Applied to (material + packaging + labor + COA) cost to generate price.
        </div>

        <label>Target markup (%)</label>
        <input
          type="number"
          min={0}
          max={500}
          step="0.1"
          value={pricing.target_markup_pct}
          onChange={(e) => setPricing((v) => ({ ...v, target_markup_pct: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Used for sell price derivation: sell = cost * (1 + markup).
        </div>

        <label>COA base cost ($)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricing.coa_base_cost_usd}
          onChange={(e) => setPricing((v) => ({ ...v, coa_base_cost_usd: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>Charged per batch/run and allocated across units.</div>

        <label>Extra touch point cost ($)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricing.extra_touch_point_cost_usd}
          onChange={(e) => setPricing((v) => ({ ...v, extra_touch_point_cost_usd: Number(e.target.value) }))}
          disabled={busy}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Added labor cost per extra touch point (customer packaging).
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={savePricing} disabled={busy}>{busy ? "Saving..." : "Save Pricing Defaults"}</button>
          <button onClick={load} disabled={busy}>{busy ? "Loading..." : "Reload"}</button>
        </div>
        {pricingError && <div style={{ color: "#a00" }}>{pricingError}</div>}
        {pricingSuccess && <div style={{ color: "#176f2c" }}>{pricingSuccess}</div>}
      </div>
    </div>
  );
}
