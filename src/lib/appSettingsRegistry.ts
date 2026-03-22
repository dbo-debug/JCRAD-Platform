export type AppSettingKind = "percent" | "number" | "boolean" | "time";

export type AppSettingField = {
  key: string;
  label: string;
  description: string;
  kind: AppSettingKind;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
};

export type AppSettingRow = {
  key: string | null;
  value_json: unknown;
};

export const ESTIMATOR_SETTINGS_FIELDS: AppSettingField[] = [
  {
    key: "flower_yield_pct",
    label: "Flower default yield %",
    description: "Fallback flower yield when a size-specific flower loss or yield is not set.",
    kind: "percent",
    defaultValue: 92,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "farmers_pound_grams",
    label: "Farmers pound grams",
    description: "Infused pre-roll expected-unit math uses this pound-to-grams convention.",
    kind: "number",
    defaultValue: 454,
    min: 1,
    step: 0.001,
  },
  {
    key: "flower_whole_pounds_only",
    label: "Flower whole pounds only",
    description: "When enabled, flower starting weight on estimate submission must be a whole-pound value.",
    kind: "boolean",
    defaultValue: true,
  },
  {
    key: "flower_finished_goods_loss_pct_3_5g",
    label: "Flower 3.5g loss %",
    description: "Finished-goods loss for 3.5g flower runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "flower_finished_goods_loss_pct_5g",
    label: "Flower 5g loss %",
    description: "Finished-goods loss for 5g flower runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "flower_finished_goods_loss_pct_7g",
    label: "Flower 7g loss %",
    description: "Finished-goods loss for 7g flower runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "flower_finished_goods_loss_pct_14g",
    label: "Flower 14g loss %",
    description: "Finished-goods loss for 14g flower runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "flower_finished_goods_loss_pct_28g",
    label: "Flower 28g loss %",
    description: "Finished-goods loss for 28g flower runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "preroll_yield_pct",
    label: "Pre-roll default yield %",
    description: "Fallback pre-roll yield when a size-specific pre-roll loss or yield is not set.",
    kind: "percent",
    defaultValue: 92,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "preroll_base_units_per_lb_0_5g",
    label: "Pre-roll 0.5g base units/lb",
    description: "Top-end base output used for 0.5g pre-roll runs.",
    kind: "number",
    defaultValue: 880,
    min: 1,
    step: 1,
  },
  {
    key: "preroll_base_units_per_lb_0_75g",
    label: "Pre-roll 0.75g base units/lb",
    description: "Top-end base output used for 0.75g pre-roll runs.",
    kind: "number",
    defaultValue: 586,
    min: 1,
    step: 1,
  },
  {
    key: "preroll_base_units_per_lb_1g",
    label: "Pre-roll 1g base units/lb",
    description: "Top-end base output used for 1g pre-roll runs.",
    kind: "number",
    defaultValue: 440,
    min: 1,
    step: 1,
  },
  {
    key: "preroll_finished_goods_loss_pct_0_5g",
    label: "Pre-roll 0.5g loss %",
    description: "Displayed low-side loss for 0.5g pre-roll runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "preroll_finished_goods_loss_pct_0_75g",
    label: "Pre-roll 0.75g loss %",
    description: "Displayed low-side loss for 0.75g pre-roll runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "preroll_finished_goods_loss_pct_1g",
    label: "Pre-roll 1g loss %",
    description: "Displayed low-side loss for 1g pre-roll runs.",
    kind: "percent",
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "concentrate_yield_pct",
    label: "Concentrate yield %",
    description: "Grams-based concentrate output loss assumption. Concentrate stays grams-based and does not use infusion logic.",
    kind: "percent",
    defaultValue: 95,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "vape_fill_yield_pct",
    label: "Vape fill yield %",
    description: "Vape fill/yield assumption. Vape keeps its own fill-based estimator path and does not use infusion logic.",
    kind: "percent",
    defaultValue: 97,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "internal_infusion_g_per_lb",
    label: "Internal infusion grams/lb",
    description: "Base dry internal infusion target per starting pound of flower.",
    kind: "number",
    defaultValue: 80,
    min: 0,
    step: 0.1,
  },
  {
    key: "infusion_internal_loss_pct",
    label: "Internal infusion loss %",
    description: "Usable-mass loss applied to internal infusion inputs.",
    kind: "percent",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "infusion_internal_thca_loss_pct",
    label: "THCA internal loss %",
    description: "Optional THCA-specific internal infusion loss assumption.",
    kind: "percent",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "external_infusion_distillate_g_per_unit_1g",
    label: "External distillate g per 1g unit",
    description: "External liquid infusion ratio for a 1g unit before process loss.",
    kind: "number",
    defaultValue: 0.1,
    min: 0,
    step: 0.001,
  },
  {
    key: "infusion_external_dist_loss_pct",
    label: "External distillate loss %",
    description: "Usable-mass loss applied to external liquid infusion inputs.",
    kind: "percent",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "external_infusion_kief_g_per_unit_1g",
    label: "External dry g per 1g unit",
    description: "External dry infusion ratio for a 1g unit before process loss.",
    kind: "number",
    defaultValue: 0.15,
    min: 0,
    step: 0.001,
  },
  {
    key: "infusion_external_dry_loss_pct",
    label: "External dry loss %",
    description: "Usable-mass loss applied to external dry infusion inputs.",
    kind: "percent",
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
];

export const SEGMENT_BUILDER_SETTINGS_FIELDS: AppSettingField[] = [
  {
    key: "route_planner_default_start_time",
    label: "Default start time",
    description: "Default departure time used when the route planner opens.",
    kind: "time",
    defaultValue: "09:00",
  },
  {
    key: "route_planner_default_required_return_time",
    label: "Required return by",
    description: "Default shift-end target used for route feasibility.",
    kind: "time",
    defaultValue: "16:30",
  },
  {
    key: "route_planner_default_max_stops",
    label: "Default max stops",
    description: "Default planning cap used when building pending-stop and territory previews.",
    kind: "number",
    defaultValue: 12,
    min: 1,
    max: 40,
    step: 1,
  },
  {
    key: "route_planner_default_visit_minutes",
    label: "Default visit minutes",
    description: "Visit duration used when route planning requests do not override it.",
    kind: "number",
    defaultValue: 30,
    min: 0,
    max: 240,
    step: 1,
  },
  {
    key: "route_planner_default_lunch_minutes",
    label: "Default lunch minutes",
    description: "Lunch block used when route planning requests do not override it.",
    kind: "number",
    defaultValue: 30,
    min: 0,
    max: 180,
    step: 1,
  },
  {
    key: "route_planner_fallback_drive_mph",
    label: "Fallback drive MPH",
    description: "Average speed used for heuristic timing when Google routing is unavailable.",
    kind: "number",
    defaultValue: 22,
    min: 1,
    max: 120,
    step: 1,
  },
];

export function settingFieldsToDefaults(fields: AppSettingField[]): Record<string, number | boolean | string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.defaultValue]));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readSettingValue(field: AppSettingField, valueJson: unknown): number | boolean | string {
  const obj = asObject(valueJson);

  if (field.kind === "percent") {
    const pct = Number(obj.pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) return field.defaultValue;
    return Math.round(pct * 10000) / 100;
  }

  if (field.kind === "boolean") {
    if (typeof obj.enabled === "boolean") return obj.enabled;
    if (typeof obj.value === "boolean") return obj.value;
    return field.defaultValue;
  }

  if (field.kind === "time") {
    const value = String(obj.value || "").trim();
    return /^\d{2}:\d{2}$/.test(value) ? value : field.defaultValue;
  }

  const candidates = [obj.value, obj.number, obj.usd, obj.g_per_lb, obj.g_per_unit_1g, obj.grams];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return field.defaultValue;
}

export function serializeSettingValue(field: AppSettingField, value: unknown): Record<string, unknown> {
  if (field.kind === "percent") {
    const percent = Number(value);
    const bounded = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : Number(field.defaultValue);
    return { pct: Math.round((bounded / 100) * 10000) / 10000 };
  }

  if (field.kind === "boolean") {
    return { enabled: value === true || value === "true" || value === 1 || value === "1" };
  }

  if (field.kind === "time") {
    const text = String(value || "").trim();
    return { value: /^\d{2}:\d{2}$/.test(text) ? text : String(field.defaultValue) };
  }

  const numeric = Number(value);
  const fallback = Number(field.defaultValue);
  return { value: Number.isFinite(numeric) ? numeric : fallback };
}

export function valuesFromRows(
  fields: AppSettingField[],
  rows: AppSettingRow[] | null | undefined,
): Record<string, number | boolean | string> {
  const byKey = new Map<string, unknown>();
  for (const row of rows || []) {
    byKey.set(String(row.key || ""), row.value_json);
  }

  return Object.fromEntries(fields.map((field) => [field.key, readSettingValue(field, byKey.get(field.key))]));
}

export function validateSettingValue(field: AppSettingField, value: unknown): string | null {
  if (field.kind === "boolean") return null;

  if (field.kind === "time") {
    return /^\d{2}:\d{2}$/.test(String(value || "").trim()) ? null : `${field.key} must be in HH:MM format`;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${field.key} must be a valid number`;
  if (field.min != null && numeric < field.min) return `${field.key} must be >= ${field.min}`;
  if (field.max != null && numeric > field.max) return `${field.key} must be <= ${field.max}`;
  return null;
}
