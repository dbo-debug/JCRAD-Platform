import type { BreakdownGroupData, BreakdownRow, EstimateLine } from "@/components/estimate/types";

export function money(n: unknown): number {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function fmtUsd(n: unknown): string {
  return `$${money(n).toFixed(2)}`;
}

export function ceilDisplayCent(n: unknown): number {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.ceil((v - 1e-9) * 100) / 100;
}

export function quotedUnitsHigh(line: EstimateLine): number {
  const fromRange = Number(line?.unit_range_high);
  const fromUnits = Number(line?.units);
  if (Number.isFinite(fromRange) && fromRange > 0) return Math.floor(fromRange);
  if (Number.isFinite(fromUnits) && fromUnits > 0) return Math.floor(fromUnits);
  return 0;
}

export function modeLabel(line: EstimateLine): "Bulk" | "Copack" | "Pre-roll" {
  if (String(line?.pre_roll_mode || "").toLowerCase()) return "Pre-roll";
  if (String(line?.mode || "").toLowerCase() === "copack") return "Copack";
  return "Bulk";
}

export function lineTitle(line: EstimateLine): string {
  const productName = String(line?.offers?.products?.name || "").trim();
  if (productName) return productName;
  const category = String(line?.offers?.products?.category || "").trim();
  if (category) return `${category[0].toUpperCase()}${category.slice(1)} line`;
  return "Estimate Line";
}

export function bulkUnit(line: EstimateLine): "lb" | "g" {
  return String(line?.quantity_unit || "lb").toLowerCase() === "g" ? "g" : "lb";
}

export function quantityDisplay(line: EstimateLine): string {
  if (String(line?.mode || "").toLowerCase() === "bulk") {
    const qty = Number(line?.quantity ?? line?.quantity_lbs ?? 0);
    const unit = bulkUnit(line);
    return `${qty.toFixed(unit === "g" ? 0 : 3)} ${unit}`;
  }
  return `${quotedUnitsHigh(line).toLocaleString()} units`;
}

export function perUnitTotal(line: EstimateLine): { value: number; label: string } {
  const lineTotal = money(line?.line_sell_total ?? line?.line_total);
  if (String(line?.mode || "").toLowerCase() === "bulk") {
    const qty = Number(line?.quantity ?? line?.quantity_lbs ?? 0);
    const unit = bulkUnit(line);
    const value = qty > 0 ? lineTotal / qty : 0;
    return { value, label: unit };
  }

  const unitsHigh = quotedUnitsHigh(line);
  const value = unitsHigh > 0 ? lineTotal / unitsHigh : 0;
  return { value, label: "unit" };
}

export function perUnitComponent(total: number, line: EstimateLine): number {
  if (String(line?.mode || "").toLowerCase() === "bulk") {
    const qty = Number(line?.quantity ?? line?.quantity_lbs ?? 0);
    return qty > 0 ? total / qty : 0;
  }
  const unitsHigh = quotedUnitsHigh(line);
  return unitsHigh > 0 ? total / unitsHigh : 0;
}

function resolveMaterialSellSplit(line: EstimateLine): { flower: number; infusion: number } {
  const materialSell = money(line?.material_total ?? line?.material_sell_total ?? 0);
  const flowerCost = Math.max(0, money(line?.material_flower_cost_total));
  const infusionCost = Math.max(0, money(line?.material_infusion_cost_total));
  const denom = flowerCost + infusionCost;

  if (denom <= 0) return { flower: materialSell, infusion: 0 };

  const flowerSell = money(materialSell * (flowerCost / denom));
  const infusionSell = money(materialSell - flowerSell);
  return { flower: flowerSell, infusion: infusionSell };
}

function positiveRows(rows: BreakdownRow[]): BreakdownRow[] {
  return rows.filter((row) => money(row.total) > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickNumber(group: Record<string, unknown>, key: string, fallback = 0): number {
  const raw = Number(group[key]);
  if (!Number.isFinite(raw)) return fallback;
  return raw;
}

function formatCommercialQty(value: number, unit: string): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (unit === "lb") return `${value.toFixed(3)} lb`;
  if (unit === "g") return `${value.toFixed(3)} g`;
  return `${value.toFixed(3)} ${unit}`;
}

function formatRate(rate: number, unit: string): string {
  if (!Number.isFinite(rate) || rate <= 0) return "";
  return `${fmtUsd(rate)}/${unit}`;
}

function detailFromQtyRate(quantity: number, unit: string, total: number, explicitRate?: number): string {
  const qtyText = formatCommercialQty(quantity, unit);
  if (!qtyText) return "";
  const derivedRate = quantity > 0 ? money(total / quantity) : 0;
  const rate = explicitRate != null && Number.isFinite(explicitRate) && explicitRate > 0 ? explicitRate : derivedRate;
  const rateText = formatRate(rate, unit);
  return rateText ? `${qtyText} @ ${rateText}` : qtyText;
}

function infusionLabel(prefix: string, name: string): string {
  return name ? `${prefix}: ${name}` : prefix;
}

function combineDetails(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" • ");
}

function baseMaterialLabel(line: EstimateLine): string {
  const category = String(line?.offers?.products?.category || "").trim().toLowerCase();
  const productName = String(line?.offers?.products?.name || "").trim();
  if (category === "flower") return "Flower";
  if (productName) return productName;
  if (category === "vape") return "Vape Material";
  if (category === "concentrate") return "Concentrate Material";
  return "Materials";
}

function baseMaterialDetail(line: EstimateLine, total: number): string {
  const category = String(line?.offers?.products?.category || "").trim().toLowerCase();
  if (category === "flower") {
    const qty = Number(line?.quantity ?? line?.quantity_lbs ?? 0);
    return detailFromQtyRate(qty, "lb", total);
  }
  const qty = Number(line?.quantity ?? 0);
  return detailFromQtyRate(qty, "g", total);
}

function packagingUnitDetail(total: number, line: EstimateLine): string {
  const units = quotedUnitsHigh(line);
  if (units <= 0 || money(total) <= 0) return "";
  return `${fmtUsd(ceilDisplayCent(total / units))}/unit`;
}

export function buildBreakdownGroups(line: EstimateLine): BreakdownGroupData[] {
  const infusionInputs = asRecord(line?.infusion_inputs);
  const costBreakdown = asRecord(infusionInputs.cost_breakdown);
  const material = asRecord(costBreakdown.material);
  const packaging = asRecord(costBreakdown.packaging);
  const labor = asRecord(costBreakdown.labor);
  const coa = asRecord(costBreakdown.coa);
  const materialSplit = resolveMaterialSellSplit(line);
  const baseLabel = baseMaterialLabel(line);
  const baseMaterialTotal = money(pickNumber(material, "flower_sell_total", materialSplit.flower));
  const internalInfusionName = String(
    line?.infusion_internal_product_name || line?.infusion_inputs?.internal?.product_name || ""
  ).trim();
  const externalLiquidName = String(
    line?.infusion_external_liquid_product_name || line?.infusion_inputs?.external?.liquid_product_name || ""
  ).trim();
  const externalDryName = String(
    line?.infusion_external_dry_product_name || line?.infusion_inputs?.external?.dry_product_name || ""
  ).trim();

  const materialsRows = positiveRows([
    {
      id: "flower",
      label: baseLabel,
      detail: baseMaterialDetail(line, baseMaterialTotal),
      total: baseMaterialTotal,
    },
    {
      id: "internal",
      label: infusionLabel("Internal Infusion", internalInfusionName),
      detail: combineDetails([
        detailFromQtyRate(
          pickNumber(material, "internal_infusion_grams"),
          "g",
          pickNumber(material, "internal_infusion_sell_total")
        ),
        internalInfusionName && !pickNumber(material, "internal_infusion_grams")
          ? internalInfusionName
          : "",
      ]),
      total: money(pickNumber(material, "internal_infusion_sell_total")),
    },
    {
      id: "ext-dist",
      label: infusionLabel("External Liquid", externalLiquidName),
      detail: combineDetails([
        detailFromQtyRate(
          pickNumber(material, "external_distillate_grams_base"),
          "g",
          pickNumber(material, "external_distillate_sell_total"),
          pickNumber(material, "external_distillate_sell_per_g")
        ),
        pickNumber(material, "external_distillate_grams_to_pull") > 0
          ? `pull ${pickNumber(material, "external_distillate_grams_to_pull").toFixed(3)} g`
          : "",
      ]),
      total: money(pickNumber(material, "external_distillate_sell_total")),
    },
    {
      id: "ext-dry",
      label: infusionLabel("External Dry", externalDryName),
      detail: combineDetails([
        detailFromQtyRate(
          pickNumber(material, "external_dry_grams_base"),
          "g",
          pickNumber(material, "external_dry_sell_total"),
          pickNumber(material, "external_dry_sell_per_g")
        ),
        pickNumber(material, "external_dry_grams_to_pull") > 0
          ? `pull ${pickNumber(material, "external_dry_grams_to_pull").toFixed(3)} g`
          : "",
      ]),
      total: money(pickNumber(material, "external_dry_sell_total")),
    },
  ]);

  const packagingBaseFallback = money(line?.packaging_total)
    - money(pickNumber(packaging, "stickers_sell_total"))
    - money(pickNumber(packaging, "heat_shrink_sell_total"))
    - money(pickNumber(packaging, "cone_sell_total"));
  const packagingPrimaryLabel = String(packaging.primary_label || "").trim();
  const packagingSecondaryLabel = String(packaging.secondary_label || "").trim();

  const packagingRows = positiveRows([
    packagingPrimaryLabel
      ? {
        id: "pack-primary",
        label: packagingPrimaryLabel,
        detail: packagingUnitDetail(money(pickNumber(packaging, "primary_sell_total")), line),
        total: money(pickNumber(packaging, "primary_sell_total")),
      }
      : {
        id: "pack",
        label: "Packaging",
        detail: packagingUnitDetail(money(pickNumber(packaging, "base_sell_total", packagingBaseFallback)), line),
        total: money(pickNumber(packaging, "base_sell_total", packagingBaseFallback)),
      },
    packagingSecondaryLabel
      ? {
        id: "pack-secondary",
        label: packagingSecondaryLabel,
        detail: packagingUnitDetail(money(pickNumber(packaging, "secondary_sell_total")), line),
        total: money(pickNumber(packaging, "secondary_sell_total")),
      }
      : { id: "pack-secondary", label: "", total: 0 },
    {
      id: "stickers",
      label: "Stickers",
      detail: packagingUnitDetail(money(pickNumber(packaging, "stickers_sell_total")), line),
      total: money(pickNumber(packaging, "stickers_sell_total")),
    },
    {
      id: "heat",
      label: "Heat Shrink",
      detail: packagingUnitDetail(money(pickNumber(packaging, "heat_shrink_sell_total")), line),
      total: money(pickNumber(packaging, "heat_shrink_sell_total")),
    },
    {
      id: "cones",
      label: "Cones",
      detail: packagingUnitDetail(money(pickNumber(packaging, "cone_sell_total")), line),
      total: money(pickNumber(packaging, "cone_sell_total")),
    },
  ]);

  const productionRows = positiveRows([
    { id: "labor", label: "Labor", total: money(pickNumber(labor, "sell_total", Number(line?.labor_total || 0))) },
    { id: "coa", label: "COA", total: money(pickNumber(coa, "sell_total", Number(line?.coa_total || 0))) },
  ]);

  const groups: BreakdownGroupData[] = [
    { id: "materials", title: "Materials", rows: materialsRows, subtotal: money(materialsRows.reduce((sum, row) => sum + row.total, 0)) },
    { id: "packaging", title: "Packaging", rows: packagingRows, subtotal: money(packagingRows.reduce((sum, row) => sum + row.total, 0)) },
    { id: "production", title: "Production", rows: productionRows, subtotal: money(productionRows.reduce((sum, row) => sum + row.total, 0)) },
  ];

  return groups.filter((group) => group.rows.length > 0);
}

export function lineTags(line: EstimateLine): string[] {
  const tags: string[] = [modeLabel(line)];
  const unitSize = String(line?.unit_size || "").trim();
  if (unitSize) tags.push(unitSize);
  const packagingMode = String(line?.packaging_mode || "").toLowerCase();
  if (packagingMode === "customer") tags.push("Customer Packaging");
  if (packagingMode === "jcrad") tags.push("JC RAD Packaging");
  return tags;
}

export function lineDetailsText(line: EstimateLine): string {
  const details: string[] = [];
  const mode = String(line?.mode || "").toLowerCase();

  if (mode === "bulk") {
    details.push(`Input: ${quantityDisplay(line)}`);
  } else {
    const q = Number(line?.quantity || 0);
    const qu = String(line?.quantity_unit || "").toLowerCase();
    if (q > 0 && (qu === "lb" || qu === "g")) details.push(`Start: ${q.toFixed(qu === "g" ? 0 : 3)} ${qu}`);
    if (line?.unit_size) details.push(`Size: ${String(line.unit_size)}`);
  }

  const internalInfusionName = String(
    line?.infusion_internal_product_name || line?.infusion_inputs?.internal?.product_name || ""
  ).trim();
  const liquidInfusionName = String(
    line?.infusion_external_liquid_product_name || line?.infusion_inputs?.external?.liquid_product_name || ""
  ).trim();
  const dryInfusionName = String(
    line?.infusion_external_dry_product_name || line?.infusion_inputs?.external?.dry_product_name || ""
  ).trim();

  if (internalInfusionName) details.push(`Internal: ${internalInfusionName}`);
  if (liquidInfusionName || dryInfusionName) {
    details.push(`External: ${[liquidInfusionName, dryInfusionName].filter(Boolean).join(" + ")}`);
  }

  return details.join(" • ");
}
