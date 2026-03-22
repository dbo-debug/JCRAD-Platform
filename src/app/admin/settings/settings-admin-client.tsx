"use client";

import { useEffect, useState } from "react";
import {
  ESTIMATOR_SETTINGS_FIELDS,
  SEGMENT_BUILDER_SETTINGS_FIELDS,
  settingFieldsToDefaults,
  type AppSettingField,
} from "@/lib/appSettingsRegistry";

type PricingForm = {
  default_margin_pct: number;
  target_markup_pct: number;
  coa_base_cost_usd: number;
  extra_touch_point_cost_usd: number;
};

type SettingsValue = number | boolean | string;
type SettingsForm = Record<string, SettingsValue>;

const DEFAULT_PRICING: PricingForm = {
  default_margin_pct: 20,
  target_markup_pct: 20,
  coa_base_cost_usd: 450,
  extra_touch_point_cost_usd: 0.1,
};

const DEFAULT_ESTIMATOR = settingFieldsToDefaults(ESTIMATOR_SETTINGS_FIELDS);
const DEFAULT_SEGMENT_BUILDER = settingFieldsToDefaults(SEGMENT_BUILDER_SETTINGS_FIELDS);

const ESTIMATOR_GROUPS = [
  {
    title: "Estimator / Flower",
    description: "Whole-pound flower handling and flower finished-goods loss assumptions.",
    fields: [
      "flower_yield_pct",
      "farmers_pound_grams",
      "flower_whole_pounds_only",
      "flower_finished_goods_loss_pct_3_5g",
      "flower_finished_goods_loss_pct_5g",
      "flower_finished_goods_loss_pct_7g",
      "flower_finished_goods_loss_pct_14g",
      "flower_finished_goods_loss_pct_28g",
    ],
  },
  {
    title: "Estimator / Pre-roll",
    description: "Pre-roll specific base output and finished-goods loss assumptions.",
    fields: [
      "preroll_yield_pct",
      "preroll_base_units_per_lb_0_5g",
      "preroll_base_units_per_lb_0_75g",
      "preroll_base_units_per_lb_1g",
      "preroll_finished_goods_loss_pct_0_5g",
      "preroll_finished_goods_loss_pct_0_75g",
      "preroll_finished_goods_loss_pct_1g",
    ],
  },
  {
    title: "Estimator / Concentrate",
    description: "Concentrate stays grams-based. No infusion controls are applied here. Packaging remains driven by current SKU/slot logic.",
    fields: [
      "concentrate_yield_pct",
    ],
  },
  {
    title: "Estimator / Vape",
    description: "Vape keeps its fill/yield-based estimator path. Packaging remains driven by current vape packaging rules and SKU/slot logic.",
    fields: [
      "vape_fill_yield_pct",
    ],
  },
  {
    title: "Estimator / Infusion",
    description: "Infusion controls only for flower/pre-roll infused runs. Not used by concentrate or vape.",
    fields: [
      "internal_infusion_g_per_lb",
      "infusion_internal_loss_pct",
      "infusion_internal_thca_loss_pct",
      "external_infusion_distillate_g_per_unit_1g",
      "infusion_external_dist_loss_pct",
      "external_infusion_kief_g_per_unit_1g",
      "infusion_external_dry_loss_pct",
    ],
  },
] as const;

function numericValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asSettingsForm(value: unknown, defaults: SettingsForm): SettingsForm {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      if (typeof fallback === "boolean") return [key, obj[key] === true];
      if (typeof fallback === "string") return [key, String(obj[key] ?? fallback)];
      return [key, numericValue(obj[key], fallback)];
    }),
  );
}

function fieldByKey(fields: AppSettingField[], key: string): AppSettingField {
  return fields.find((field) => field.key === key) || {
    key,
    label: key,
    description: "",
    kind: "number",
    defaultValue: 0,
  };
}

function sectionCardStyle() {
  return {
    border: "1px solid #d7e3ea",
    borderRadius: 12,
    padding: 16,
    display: "grid",
    gap: 12,
    background: "#fff",
  };
}

function inputStyle() {
  return {
    width: "100%",
    border: "1px solid #cfdbe3",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "#fff",
  };
}

function renderField(args: {
  field: AppSettingField;
  value: SettingsValue;
  disabled: boolean;
  onChange: (next: SettingsValue) => void;
}) {
  const { field, value, disabled, onChange } = args;

  if (field.kind === "boolean") {
    return (
      <label key={field.key} style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600, color: "#173543" }}>{field.label}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#425f6e", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          Enabled
        </label>
        <span style={{ fontSize: 12, color: "#5b7382" }}>{field.description}</span>
      </label>
    );
  }

  return (
    <label key={field.key} style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 600, color: "#173543" }}>{field.label}</span>
      <input
        type={field.kind === "time" ? "time" : "number"}
        min={field.min}
        max={field.max}
        step={field.step}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => onChange(field.kind === "time" ? event.target.value : Number(event.target.value))}
        style={inputStyle()}
      />
      <span style={{ fontSize: 12, color: "#5b7382" }}>{field.description}</span>
    </label>
  );
}

export default function SettingsAdminClient() {
  const [pricing, setPricing] = useState<PricingForm>(DEFAULT_PRICING);
  const [estimator, setEstimator] = useState<SettingsForm>(DEFAULT_ESTIMATOR);
  const [segmentBuilder, setSegmentBuilder] = useState<SettingsForm>(DEFAULT_SEGMENT_BUILDER);
  const [busySection, setBusySection] = useState<null | "load" | "pricing" | "estimator" | "segment_builder">(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);
  const [estimatorError, setEstimatorError] = useState<string | null>(null);
  const [estimatorSuccess, setEstimatorSuccess] = useState<string | null>(null);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [segmentSuccess, setSegmentSuccess] = useState<string | null>(null);

  async function load() {
    setBusySection("load");
    setPricingError(null);
    setEstimatorError(null);
    setSegmentError(null);

    const [pricingRes, estimatorRes, segmentRes] = await Promise.all([
      fetch("/api/admin/settings/pricing"),
      fetch("/api/admin/settings/estimator"),
      fetch("/api/admin/settings/segment-builder"),
    ]);

    const pricingJson = await pricingRes.json().catch(() => ({}));
    if (pricingRes.ok) {
      setPricing({
        default_margin_pct: numericValue(pricingJson?.default_margin_pct, DEFAULT_PRICING.default_margin_pct),
        target_markup_pct: numericValue(pricingJson?.target_markup_pct, DEFAULT_PRICING.target_markup_pct),
        coa_base_cost_usd: numericValue(pricingJson?.coa_base_cost_usd, DEFAULT_PRICING.coa_base_cost_usd),
        extra_touch_point_cost_usd: numericValue(
          pricingJson?.extra_touch_point_cost_usd,
          DEFAULT_PRICING.extra_touch_point_cost_usd,
        ),
      });
    } else {
      setPricingError(pricingJson?.error || `Pricing load failed (${pricingRes.status})`);
    }

    const estimatorJson = await estimatorRes.json().catch(() => ({}));
    if (estimatorRes.ok) {
      setEstimator(asSettingsForm(estimatorJson, DEFAULT_ESTIMATOR));
    } else {
      setEstimatorError(estimatorJson?.error || `Estimator load failed (${estimatorRes.status})`);
    }

    const segmentJson = await segmentRes.json().catch(() => ({}));
    if (segmentRes.ok) {
      setSegmentBuilder(asSettingsForm(segmentJson, DEFAULT_SEGMENT_BUILDER));
    } else {
      setSegmentError(segmentJson?.error || `Segment Builder load failed (${segmentRes.status})`);
    }

    setBusySection(null);
  }

  async function savePricing() {
    setBusySection("pricing");
    setPricingError(null);
    setPricingSuccess(null);

    const res = await fetch("/api/admin/settings/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pricing),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setPricingError(json?.error || `Pricing save failed (${res.status})`);
      setBusySection(null);
      return;
    }

    setPricingSuccess("Pricing defaults saved.");
    setBusySection(null);
  }

  async function saveEstimator() {
    setBusySection("estimator");
    setEstimatorError(null);
    setEstimatorSuccess(null);

    const res = await fetch("/api/admin/settings/estimator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(estimator),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setEstimatorError(json?.error || `Estimator save failed (${res.status})`);
      setBusySection(null);
      return;
    }

    setEstimator(asSettingsForm(json, DEFAULT_ESTIMATOR));
    setEstimatorSuccess("Estimator settings saved.");
    setBusySection(null);
  }

  async function saveSegmentBuilder() {
    setBusySection("segment_builder");
    setSegmentError(null);
    setSegmentSuccess(null);

    const res = await fetch("/api/admin/settings/segment-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(segmentBuilder),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSegmentError(json?.error || `Segment Builder save failed (${res.status})`);
      setBusySection(null);
      return;
    }

    setSegmentBuilder(asSettingsForm(json, DEFAULT_SEGMENT_BUILDER));
    setSegmentSuccess("Segment Builder settings saved.");
    setBusySection(null);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={sectionCardStyle()}>
        <strong style={{ color: "#173543" }}>Pricing Defaults</strong>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "#173543" }}>Default margin (%)</span>
            <input type="number" min={0} max={100} step="0.1" value={pricing.default_margin_pct} onChange={(e) => setPricing((v) => ({ ...v, default_margin_pct: Number(e.target.value) }))} disabled={busySection !== null} style={inputStyle()} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "#173543" }}>Target markup (%)</span>
            <input type="number" min={0} max={500} step="0.1" value={pricing.target_markup_pct} onChange={(e) => setPricing((v) => ({ ...v, target_markup_pct: Number(e.target.value) }))} disabled={busySection !== null} style={inputStyle()} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "#173543" }}>COA base cost (USD)</span>
            <input type="number" min={0} step="0.01" value={pricing.coa_base_cost_usd} onChange={(e) => setPricing((v) => ({ ...v, coa_base_cost_usd: Number(e.target.value) }))} disabled={busySection !== null} style={inputStyle()} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "#173543" }}>Extra touch point cost (USD)</span>
            <input type="number" min={0} step="0.01" value={pricing.extra_touch_point_cost_usd} onChange={(e) => setPricing((v) => ({ ...v, extra_touch_point_cost_usd: Number(e.target.value) }))} disabled={busySection !== null} style={inputStyle()} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={savePricing} disabled={busySection !== null}>{busySection === "pricing" ? "Saving..." : "Save Pricing Defaults"}</button>
        </div>
        {pricingError ? <div style={{ color: "#a00" }}>{pricingError}</div> : null}
        {pricingSuccess ? <div style={{ color: "#176f2c" }}>{pricingSuccess}</div> : null}
      </div>

      <div style={sectionCardStyle()}>
        <strong style={{ color: "#173543" }}>Estimator</strong>
        <span style={{ fontSize: 13, color: "#5b7382" }}>
          These keys match the estimator math already being read in the menu and estimate add-line paths. Saving here updates the existing `app_settings` values the estimator uses.
        </span>
        {ESTIMATOR_GROUPS.map((group) => (
          <div key={group.title} style={{ border: "1px solid #e1eaef", borderRadius: 10, padding: 12, display: "grid", gap: 12 }}>
            <strong style={{ color: "#173543" }}>{group.title}</strong>
            <span style={{ fontSize: 12, color: "#5b7382" }}>{group.description}</span>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {group.fields.map((key) => {
                const field = fieldByKey(ESTIMATOR_SETTINGS_FIELDS, key);
                return renderField({
                  field,
                  value: estimator[key],
                  disabled: busySection !== null,
                  onChange: (next) => setEstimator((current) => ({ ...current, [key]: next })),
                });
              })}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveEstimator} disabled={busySection !== null}>{busySection === "estimator" ? "Saving..." : "Save Estimator Settings"}</button>
        </div>
        {estimatorError ? <div style={{ color: "#a00" }}>{estimatorError}</div> : null}
        {estimatorSuccess ? <div style={{ color: "#176f2c" }}>{estimatorSuccess}</div> : null}
      </div>

      <div style={sectionCardStyle()}>
        <strong style={{ color: "#173543" }}>Segment Builder</strong>
        <span style={{ fontSize: 13, color: "#5b7382" }}>
          These are the actual global route-planning defaults currently supported: route frame defaults and heuristic fallback timing.
        </span>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {SEGMENT_BUILDER_SETTINGS_FIELDS.map((field) =>
            renderField({
              field,
              value: segmentBuilder[field.key],
              disabled: busySection !== null,
              onChange: (next) => setSegmentBuilder((current) => ({ ...current, [field.key]: next })),
            }),
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveSegmentBuilder} disabled={busySection !== null}>{busySection === "segment_builder" ? "Saving..." : "Save Segment Builder Settings"}</button>
        </div>
        {segmentError ? <div style={{ color: "#a00" }}>{segmentError}</div> : null}
        {segmentSuccess ? <div style={{ color: "#176f2c" }}>{segmentSuccess}</div> : null}
      </div>
    </div>
  );
}
