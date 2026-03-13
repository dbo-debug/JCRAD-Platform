"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LIQUID_INFUSION_MEDIA } from "@/lib/infusion-config";

type FormCategory = "flower" | "concentrate" | "vape" | "pre_roll";
type InventoryUnit = "lb" | "g";
type FlowerGrade = "Shake" | "Smalls" | "Mediums" | "Premium";
type FlowerCultivation = "Indoor" | "Light Assist" | "Full Term";
type ConcentrateType =
  | "THCA"
  | "Kief"
  | "Bubble Hash"
  | "Freeze Dried Rosin"
  | "Shatter"
  | "Diamonds"
  | "Badder"
  | "Rosin";
type VapeMedium = (typeof LIQUID_INFUSION_MEDIA)[number];
type ProductBundleResponse = {
  error?: string;
  catalog_item?: { id?: string | null } | null;
  product?: { id?: string | null } | null;
};

type OfferStatusResponse = {
  error?: string;
};

export type BulkProductFormValues = {
  catalog_item_id?: string | null;
  product_id?: string | null;
  name: string;
  category: FormCategory;
  inventory_qty: number;
  inventory_unit: InventoryUnit;
  active: boolean;
  bulk_cost_per_lb: number;
  bulk_sell_per_lb: number | null;
  min_order: number;
  allow_bulk: boolean;
  allow_copack: boolean;
  offer_status: "draft" | "published";
};

const FLOWER_GRADES: FlowerGrade[] = ["Shake", "Smalls", "Mediums", "Premium"];
const FLOWER_CULTIVATIONS: FlowerCultivation[] = ["Indoor", "Light Assist", "Full Term"];
const CONCENTRATE_TYPES: ConcentrateType[] = [
  "THCA",
  "Kief",
  "Bubble Hash",
  "Freeze Dried Rosin",
  "Shatter",
  "Diamonds",
  "Badder",
  "Rosin",
];
const VAPE_MEDIA: VapeMedium[] = [...LIQUID_INFUSION_MEDIA];

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function startsWithToken(value: string, token: string): boolean {
  return value.toLowerCase().startsWith(`${token.toLowerCase()} `) || value.toLowerCase() === token.toLowerCase();
}

function endsWithToken(value: string, token: string): boolean {
  return value.toLowerCase().endsWith(` ${token.toLowerCase()}`) || value.toLowerCase() === token.toLowerCase();
}

function parseFlowerName(name: string): { cultivation: FlowerCultivation | ""; grade: FlowerGrade | ""; strain: string } {
  const raw = normalizeWhitespace(name);
  if (!raw) return { cultivation: "", grade: "", strain: "" };

  const cultivation = FLOWER_CULTIVATIONS.find((c) => startsWithToken(raw, c)) || "";
  const grade = FLOWER_GRADES.find((g) => endsWithToken(raw, g)) || "";
  if (!cultivation || !grade) return { cultivation: "", grade: "", strain: raw };

  const withoutPrefix = raw.slice(cultivation.length).trim();
  const withoutSuffix = withoutPrefix.slice(0, Math.max(0, withoutPrefix.length - grade.length)).trim();
  if (!withoutSuffix) return { cultivation: "", grade: "", strain: raw };
  return { cultivation, grade, strain: withoutSuffix };
}

function parseFromPrefix(name: string, options: string[]): { prefix: string; rest: string } {
  const raw = normalizeWhitespace(name);
  if (!raw) return { prefix: "", rest: "" };
  for (const option of options) {
    if (startsWithToken(raw, option)) {
      const rest = raw.slice(option.length).trim();
      return { prefix: option, rest };
    }
  }
  return { prefix: "", rest: raw };
}

export default function BulkProductForm({
  mode,
  initialValues,
}: {
  mode: "new" | "edit";
  initialValues: BulkProductFormValues;
}) {
  const router = useRouter();
  const [form, setForm] = useState<BulkProductFormValues>(initialValues);
  const initialName = normalizeWhitespace(String(initialValues.name || ""));
  const initialFlower = parseFlowerName(initialName);
  const initialConcentrate = parseFromPrefix(initialName, CONCENTRATE_TYPES);
  const initialVape = parseFromPrefix(initialName, VAPE_MEDIA);
  const [descriptorName, setDescriptorName] = useState<string>(() => {
    if (initialValues.category === "flower") return initialFlower.strain;
    if (initialValues.category === "concentrate") return initialConcentrate.rest;
    if (initialValues.category === "vape") return initialVape.rest;
    return initialName;
  });
  const [flowerCultivation, setFlowerCultivation] = useState<FlowerCultivation | "">(
    initialValues.category === "flower" ? initialFlower.cultivation : ""
  );
  const [flowerGrade, setFlowerGrade] = useState<FlowerGrade | "">(
    initialValues.category === "flower" ? initialFlower.grade : ""
  );
  const [concentrateType, setConcentrateType] = useState<ConcentrateType | "">(
    initialValues.category === "concentrate" ? (initialConcentrate.prefix as ConcentrateType | "") : ""
  );
  const [vapeMedium, setVapeMedium] = useState<VapeMedium | "">(
    initialValues.category === "vape" ? (initialVape.prefix as VapeMedium | "") : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitData = new FormData(e.currentTarget);
    const addAnother = submitData.get("addAnother") === "true";
    setBusy(true);
    setError("");
    setSuccess("");

    const inventoryQty = toFinite(form.inventory_qty);
    const costPerUnit = toFinite(form.bulk_cost_per_lb);
    const sellPerUnit = toFinite(form.bulk_sell_per_lb);
    const minOrder = toFinite(form.min_order) ?? 0;
    const normalizedDescriptorName = normalizeWhitespace(descriptorName);
    let normalizedName = normalizeWhitespace(String(form.name || ""));
    if (form.category === "flower") {
      if (!flowerCultivation || !flowerGrade || !normalizedDescriptorName) {
        setError("Flower requires cultivation, grade, and strain.");
        setBusy(false);
        return;
      }
      normalizedName = `${flowerCultivation} ${normalizedDescriptorName} ${flowerGrade}`;
    } else if (form.category === "concentrate") {
      if (!concentrateType) {
        setError("Concentrate type is required.");
        setBusy(false);
        return;
      }
      normalizedName = normalizedDescriptorName ? `${concentrateType} ${normalizedDescriptorName}` : concentrateType;
    } else if (form.category === "vape") {
      if (!vapeMedium) {
        setError("Vape medium is required.");
        setBusy(false);
        return;
      }
      normalizedName = normalizedDescriptorName ? `${vapeMedium} ${normalizedDescriptorName}` : vapeMedium;
    } else {
      normalizedName = normalizedDescriptorName || normalizedName;
    }

    if (!normalizedName) {
      setError("Name is required.");
      setBusy(false);
      return;
    }
    if (inventoryQty == null || inventoryQty < 0) {
      setError("Inventory qty must be a number >= 0.");
      setBusy(false);
      return;
    }
    if (costPerUnit == null || costPerUnit < 0) {
      setError(`Cost per ${form.inventory_unit} is required.`);
      setBusy(false);
      return;
    }
    if (sellPerUnit != null && sellPerUnit < 0) {
      setError(`Sell per ${form.inventory_unit} must be >= 0 when provided.`);
      setBusy(false);
      return;
    }

    const productCategory = form.category === "pre_roll" ? "flower" : form.category;

    const payload = {
      product: {
        id: form.product_id || null,
        name: normalizedName,
        category: productCategory,
        type: null,
        tier: null,
        description: null,
        inventory_qty: inventoryQty,
        inventory_unit: form.inventory_unit,
      },
      offer: {
        status: form.offer_status,
        min_order: Math.max(0, minOrder),
        bulk_cost_per_lb: costPerUnit,
        bulk_sell_per_lb: sellPerUnit,
        material_cost_basis: form.inventory_unit === "g" ? "per_g" : "per_lb",
        material_cost_input: costPerUnit,
        allow_bulk: !!form.allow_bulk,
        allow_copack: !!form.allow_copack,
      },
      catalog_item: {
        id: form.catalog_item_id || null,
        name: normalizedName,
        category: form.category,
        active: !!form.active,
      },
    };

    try {
      const res = await fetch("/api/admin/product-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: ProductBundleResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json?.error || `Save failed (${res.status})`));
      }

      const nextCatalogItemId = String(json.catalog_item?.id || form.catalog_item_id || "");
      const nextProductId = String(json.product?.id || form.product_id || "");

      if (nextProductId) {
        const statusRes = await fetch("/api/admin/offers/set-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: nextProductId, status: form.offer_status }),
        });
        const statusJson: OfferStatusResponse = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(String(statusJson?.error || `Offer status update failed (${statusRes.status})`));
        }
      }

      setForm((prev) => ({
        ...prev,
        catalog_item_id: nextCatalogItemId || prev.catalog_item_id || null,
        product_id: nextProductId || prev.product_id || null,
        name: normalizedName,
      }));

      if (mode === "new" && nextCatalogItemId) {
        router.push(addAnother ? "/admin/catalog/bulk/new" : "/admin/catalog/bulk");
        return;
      }

      setSuccess("Saved successfully.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-[var(--surface-border)] bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Category</span>
          <select
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.category}
            onChange={(e) => {
              const nextCategory = e.target.value as FormCategory;
              setForm((prev) => ({ ...prev, category: nextCategory }));
            }}
          >
            <option value="flower">flower</option>
            <option value="concentrate">concentrate</option>
            <option value="vape">vape</option>
            <option value="pre_roll">pre_roll</option>
          </select>
        </label>

        {form.category === "flower" ? (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Cultivation</span>
              <select
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={flowerCultivation}
                onChange={(e) => setFlowerCultivation(e.target.value as FlowerCultivation | "")}
              >
                <option value="">Select cultivation</option>
                {FLOWER_CULTIVATIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Flower grade</span>
              <select
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={flowerGrade}
                onChange={(e) => setFlowerGrade(e.target.value as FlowerGrade | "")}
              >
                <option value="">Select grade</option>
                {FLOWER_GRADES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 md:col-span-2">
              <span className="text-sm text-[#4f6877]">Strain</span>
              <input
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={descriptorName}
                onChange={(e) => setDescriptorName(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {form.category === "concentrate" ? (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Concentrate type</span>
              <select
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={concentrateType}
                onChange={(e) => setConcentrateType(e.target.value as ConcentrateType | "")}
              >
                <option value="">Select type</option>
                {CONCENTRATE_TYPES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Name / Strain</span>
              <input
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={descriptorName}
                onChange={(e) => setDescriptorName(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {form.category === "vape" ? (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Vape medium</span>
              <select
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={vapeMedium}
                onChange={(e) => setVapeMedium(e.target.value as VapeMedium | "")}
              >
                <option value="">Select medium</option>
                {VAPE_MEDIA.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Name</span>
              <input
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={descriptorName}
                onChange={(e) => setDescriptorName(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {form.category === "pre_roll" ? (
          <label className="grid gap-1">
            <span className="text-sm text-[#4f6877]">Name</span>
            <input
              className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
              value={descriptorName}
              onChange={(e) => setDescriptorName(e.target.value)}
            />
          </label>
        ) : null}

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Inventory Qty</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.inventory_qty}
            onChange={(e) => setForm((prev) => ({ ...prev, inventory_qty: Number(e.target.value) }))}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Inventory Unit</span>
          <select
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.inventory_unit}
            onChange={(e) => setForm((prev) => ({ ...prev, inventory_unit: e.target.value as InventoryUnit }))}
          >
            <option value="lb">lb</option>
            <option value="g">g</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">
            {form.inventory_unit === "g" ? "Cost per g" : "Cost per lb"}
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.bulk_cost_per_lb}
            onChange={(e) => setForm((prev) => ({ ...prev, bulk_cost_per_lb: Number(e.target.value) }))}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">
            {form.inventory_unit === "g" ? "Sell per g (optional)" : "Sell per lb (optional)"}
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.bulk_sell_per_lb ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                bulk_sell_per_lb: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Min Order (optional)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.min_order}
            onChange={(e) => setForm((prev) => ({ ...prev, min_order: Number(e.target.value) }))}
          />
        </label>
      </div>

      <div className="rounded border border-[#dbe9ef] bg-[#f6fbfd] px-3 py-2 text-xs text-[#5b7382]">
        Display name preview:{" "}
        {form.category === "flower"
          ? normalizeWhitespace(
            `${flowerCultivation || ""} ${normalizeWhitespace(descriptorName)} ${flowerGrade || ""}`
          ) || "-"
          : form.category === "concentrate"
            ? normalizeWhitespace(`${concentrateType || ""} ${normalizeWhitespace(descriptorName)}`) || "-"
            : form.category === "vape"
              ? normalizeWhitespace(`${vapeMedium || ""} ${normalizeWhitespace(descriptorName)}`) || "-"
              : normalizeWhitespace(descriptorName) || "-"}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <label className="flex items-center gap-2 text-sm text-[#2f4a59]">
          <input
            type="checkbox"
            checked={form.allow_bulk}
            onChange={(e) => setForm((prev) => ({ ...prev, allow_bulk: e.target.checked }))}
          />
          Allow Bulk
        </label>
        <label className="flex items-center gap-2 text-sm text-[#2f4a59]">
          <input
            type="checkbox"
            checked={form.allow_copack}
            onChange={(e) => setForm((prev) => ({ ...prev, allow_copack: e.target.checked }))}
          />
          Allow Copack
        </label>
        <label className="flex items-center gap-2 text-sm text-[#2f4a59]">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-[#2f4a59]">
          <input
            type="checkbox"
            checked={form.offer_status === "published"}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, offer_status: e.target.checked ? "published" : "draft" }))
            }
          />
          Published
        </label>
      </div>

      {error ? <p className="text-sm text-[#991b1b]">{error}</p> : null}
      {success ? <p className="text-sm text-[#0f766e]">{success}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Saving..." : mode === "new" ? "Create Product" : "Save Changes"}
        </button>
        {mode === "new" ? (
          <button
            type="submit"
            name="addAnother"
            value="true"
            disabled={busy}
            className="rounded border border-[#9ccfc8] bg-white px-4 py-2 text-sm font-semibold text-[#0f766e] transition hover:bg-[#f6fbfd] disabled:opacity-60"
          >
            {busy ? "Saving..." : "Create & Add Another"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
