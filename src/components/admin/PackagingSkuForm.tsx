"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AppliesTo = "flower" | "concentrate" | "vape" | "pre_roll";
type PackagingType =
  | "flower_in_bag"
  | "flower_in_jar"
  | "pre_roll_tube"
  | "pre_roll_jar"
  | "vape_510_cart"
  | "vape_all_in_one"
  | "concentrate_jar";

const VAPE_FILL_OPTIONS = ["0.5", "1"] as const;

export type PackagingSkuFormValues = {
  id?: string | null;
  name: string;
  applies_to: AppliesTo;
  packaging_type: string;
  size_grams: number | null;
  pack_qty: number;
  vape_device: string | null;
  vape_fill_grams: number | null;
  unit_cost: number;
  inventory_qty: number;
  active: boolean;
  thumbnail_url?: string | null;
  thumbnail_bucket?: string | null;
  thumbnail_object_path?: string | null;
};

type FormState = {
  name: string;
  applies_to: AppliesTo;
  packaging_type: PackagingType;
  size_grams: string;
  pack_qty: string;
  vape_device: string;
  vape_fill_grams: string;
  unit_cost: string;
  inventory_qty: string;
  active: boolean;
  thumbnail_url: string;
  thumbnail_bucket: string;
  thumbnail_object_path: string;
};

function toOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRequiredNumber(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePackagingType(value: string): PackagingType | null {
  const raw = value.trim().toLowerCase();
  if (
    raw === "flower_in_bag" ||
    raw === "flower_in_jar" ||
    raw === "pre_roll_tube" ||
    raw === "pre_roll_jar" ||
    raw === "vape_510_cart" ||
    raw === "vape_all_in_one" ||
    raw === "concentrate_jar"
  ) {
    return raw;
  }
  return null;
}

function getPreRollPackagingType(packQty: number): PackagingType {
  return packQty === 1 ? "pre_roll_tube" : "pre_roll_jar";
}

function getAllowedPackagingTypes(appliesTo: AppliesTo, packQty: number): PackagingType[] {
  if (appliesTo === "flower") return ["flower_in_bag", "flower_in_jar"];
  if (appliesTo === "vape") return ["vape_510_cart", "vape_all_in_one"];
  if (appliesTo === "concentrate") return ["concentrate_jar"];
  return [getPreRollPackagingType(packQty)];
}

function getDefaultPackagingType(appliesTo: AppliesTo, packQty: number): PackagingType {
  if (appliesTo === "flower") return "flower_in_bag";
  if (appliesTo === "vape") return "vape_510_cart";
  if (appliesTo === "concentrate") return "concentrate_jar";
  return getPreRollPackagingType(packQty);
}

export default function PackagingSkuForm({
  mode,
  initialValues,
}: {
  mode: "new" | "edit";
  initialValues: PackagingSkuFormValues;
}) {
  const router = useRouter();
  const initialPackQty = Math.max(1, Number(initialValues.pack_qty || 1));
  const initialPackagingType =
    normalizePackagingType(initialValues.packaging_type) || getDefaultPackagingType(initialValues.applies_to, initialPackQty);

  const [form, setForm] = useState<FormState>({
    name: initialValues.name,
    applies_to: initialValues.applies_to,
    packaging_type: initialPackagingType,
    size_grams: initialValues.size_grams == null ? "" : String(initialValues.size_grams),
    pack_qty: String(initialPackQty),
    vape_device: initialValues.vape_device || "",
    vape_fill_grams: initialValues.vape_fill_grams == null ? "" : String(initialValues.vape_fill_grams),
    unit_cost: String(initialValues.unit_cost),
    inventory_qty: String(initialValues.inventory_qty),
    active: initialValues.active,
    thumbnail_url: String(initialValues.thumbnail_url || ""),
    thumbnail_bucket: String(initialValues.thumbnail_bucket || ""),
    thumbnail_object_path: String(initialValues.thumbnail_object_path || ""),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const packQtyNumber = Math.max(1, Number(form.pack_qty || 1));

  const allowedPackagingTypes = useMemo(
    () => getAllowedPackagingTypes(form.applies_to, packQtyNumber),
    [form.applies_to, packQtyNumber]
  );

  useEffect(() => {
    setForm((prev) => {
      const next: FormState = { ...prev };
      let changed = false;

      if (prev.applies_to !== "pre_roll" && prev.pack_qty !== "1") {
        next.pack_qty = "1";
        changed = true;
      }

      if (prev.applies_to !== "vape") {
        if (prev.vape_fill_grams !== "") {
          next.vape_fill_grams = "";
          changed = true;
        }
        if (prev.vape_device !== "") {
          next.vape_device = "";
          changed = true;
        }
      } else if (!VAPE_FILL_OPTIONS.includes(prev.vape_fill_grams as (typeof VAPE_FILL_OPTIONS)[number])) {
        next.vape_fill_grams = "1";
        changed = true;
      }

      const nextPackQty = Math.max(1, Number(next.pack_qty || 1));
      const allowed = getAllowedPackagingTypes(next.applies_to, nextPackQty);
      if (!allowed.includes(next.packaging_type)) {
        next.packaging_type = getDefaultPackagingType(next.applies_to, nextPackQty);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [form.applies_to, form.pack_qty]);

  async function onUploadThumbnail() {
    if (!initialValues.id) {
      setUploadError("Save this SKU first to enable uploads.");
      return;
    }
    if (!selectedFile) {
      setUploadError("Select an image file first.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(initialValues.id)}/upload-thumbnail`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(json?.error || `Upload failed (${response.status})`));
      }

      const nextUrl = String(json?.publicUrl || "").trim();
      const nextObjectPath = String(json?.objectPath || "").trim();

      setForm((prev) => ({
        ...prev,
        thumbnail_url: nextUrl || prev.thumbnail_url,
        thumbnail_bucket: "catalog-public",
        thumbnail_object_path: nextObjectPath || prev.thumbnail_object_path,
      }));
      setSelectedFile(null);
      setUploadSuccess("Saved thumbnail.");
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const name = form.name.trim();
    const unitCost = toRequiredNumber(form.unit_cost);
    const inventoryQty = toRequiredNumber(form.inventory_qty);
    const packQtyInput = toRequiredNumber(form.pack_qty);
    const packQty = form.applies_to === "pre_roll" ? packQtyInput : 1;
    const sizeGrams = form.applies_to === "vape" ? null : toOptionalNumber(form.size_grams);
    const packagingType =
      allowedPackagingTypes.find((x) => x === form.packaging_type) ||
      getDefaultPackagingType(form.applies_to, Math.max(1, Number(packQty || 1)));

    const vapeFillGrams =
      form.applies_to === "vape" ? (form.vape_fill_grams === "0.5" ? 0.5 : form.vape_fill_grams === "1" ? 1 : null) : null;

    if (!name) {
      setError("Name is required.");
      setBusy(false);
      return;
    }
    if (unitCost == null || unitCost < 0) {
      setError("Unit cost must be a number >= 0.");
      setBusy(false);
      return;
    }
    if (inventoryQty == null || inventoryQty < 0) {
      setError("Qty available must be a number >= 0.");
      setBusy(false);
      return;
    }
    if (form.applies_to === "pre_roll" && (packQty == null || packQty < 1)) {
      setError("Pack qty must be a number >= 1 for pre-roll.");
      setBusy(false);
      return;
    }
    if (form.applies_to === "vape" && vapeFillGrams == null) {
      setError("Vape fill grams must be 0.5 or 1.0.");
      setBusy(false);
      return;
    }
    if (!packagingType) {
      setError("Packaging type is required.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/packaging-skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialValues.id || null,
          name,
          applies_to: form.applies_to,
          packaging_type: packagingType,
          size_grams: sizeGrams,
          pack_qty: form.applies_to === "pre_roll" ? packQty : 1,
          vape_device: form.applies_to === "vape" ? form.vape_device.trim() || null : null,
          vape_fill_grams: form.applies_to === "vape" ? vapeFillGrams : null,
          unit_cost: unitCost,
          inventory_qty: inventoryQty,
          active: form.active,
          thumbnail_url: form.thumbnail_url.trim() || null,
          thumbnail_bucket: form.thumbnail_bucket.trim() || null,
          thumbnail_object_path: form.thumbnail_object_path.trim() || null,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String(json?.error || `Save failed (${response.status})`));
      }

      router.push("/admin/catalog/packaging");
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const thumbnailPreview = String(form.thumbnail_url || "").trim() || "/brand/PRIMARY.png";

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-[var(--surface-border)] bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Name</span>
          <input
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Applies To</span>
          <select
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.applies_to}
            onChange={(e) => setForm((prev) => ({ ...prev, applies_to: e.target.value as AppliesTo }))}
          >
            <option value="flower">flower</option>
            <option value="concentrate">concentrate</option>
            <option value="vape">vape</option>
            <option value="pre_roll">pre_roll</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Packaging Type</span>
          <select
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.packaging_type}
            onChange={(e) => setForm((prev) => ({ ...prev, packaging_type: e.target.value as PackagingType }))}
            disabled={form.applies_to === "pre_roll" || form.applies_to === "concentrate"}
          >
            {allowedPackagingTypes.map((packagingType) => (
              <option key={packagingType} value={packagingType}>
                {packagingType}
              </option>
            ))}
          </select>
          {form.applies_to === "pre_roll" ? (
            <span className="text-xs text-[#5b7382]">Pre-roll packaging is determined by Pack Qty (1 = tube, 2+ = jar).</span>
          ) : null}
        </label>

        {form.applies_to !== "vape" ? (
          <label className="grid gap-1">
            <span className="text-sm text-[#4f6877]">Size Grams (optional)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
              value={form.size_grams}
              onChange={(e) => setForm((prev) => ({ ...prev, size_grams: e.target.value }))}
            />
          </label>
        ) : null}

        {form.applies_to === "pre_roll" ? (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Pack Qty</span>
              <input
                type="number"
                min={1}
                step="1"
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={form.pack_qty}
                onChange={(e) => setForm((prev) => ({ ...prev, pack_qty: e.target.value }))}
                required
              />
              <span className="text-xs text-[#5b7382]">Only shown for Pre-Roll. 1 = single tube, 2+ = jar multipack.</span>
            </label>

            <div className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Pre-Roll Pack Type</span>
              <div className="flex flex-wrap gap-4 rounded border border-[#dbe9ef] bg-[#f6fbfd] px-3 py-2 text-sm text-[#2f4a59]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="pre-roll-pack-type"
                    checked={Number(form.pack_qty || 0) === 1}
                    onChange={() => setForm((prev) => ({ ...prev, pack_qty: "1", packaging_type: "pre_roll_tube" }))}
                  />
                  Single (1)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="pre-roll-pack-type"
                    checked={Number(form.pack_qty || 0) >= 2}
                    onChange={() => setForm((prev) => ({ ...prev, pack_qty: "5", packaging_type: "pre_roll_jar" }))}
                  />
                  Multipack (5)
                </label>
              </div>
            </div>
          </>
        ) : null}

        {form.applies_to === "vape" ? (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Vape Device (optional)</span>
              <input
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={form.vape_device}
                onChange={(e) => setForm((prev) => ({ ...prev, vape_device: e.target.value }))}
                placeholder="510_cart, all_in_one..."
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-[#4f6877]">Vape Fill Grams</span>
              <select
                className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
                value={form.vape_fill_grams}
                onChange={(e) => setForm((prev) => ({ ...prev, vape_fill_grams: e.target.value }))}
              >
                <option value="0.5">0.5</option>
                <option value="1">1.0</option>
              </select>
              <span className="text-xs text-[#5b7382]">Only shown for Vape.</span>
            </label>
          </>
        ) : null}

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Unit Cost</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.unit_cost}
            onChange={(e) => setForm((prev) => ({ ...prev, unit_cost: e.target.value }))}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-[#4f6877]">Qty Available</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            value={form.inventory_qty}
            onChange={(e) => setForm((prev) => ({ ...prev, inventory_qty: e.target.value }))}
            required
          />
        </label>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-[#2f4a59]">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
          />
          Active
        </label>
      </div>

      {initialValues.id ? (
        <div className="space-y-4 rounded-lg border border-[#dbe9ef] bg-[#f9fcfd] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[#173543]">Thumbnail</h3>
            <p className="mt-1 text-xs text-[#5b7382]">Upload a thumbnail. It will persist on Save Changes.</p>
          </div>
          <img
            src={thumbnailPreview}
            alt={`${form.name || "Packaging SKU"} thumbnail`}
            className="h-40 w-40 rounded-md border border-[#dbe9ef] object-cover"
          />
          <div className="grid gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="rounded border border-[#cfdde5] bg-white px-3 py-2 text-sm text-[#173543]"
            />
            <button
              type="button"
              onClick={onUploadThumbnail}
              disabled={uploading || !selectedFile}
              className="w-fit rounded bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload Thumbnail"}
            </button>
            {uploadError ? <p className="text-sm text-[#991b1b]">{uploadError}</p> : null}
            {uploadSuccess ? <p className="text-sm text-[#0f766e]">{uploadSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[#991b1b]">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {busy ? "Saving..." : mode === "new" ? "Create Packaging SKU" : "Save Changes"}
      </button>
    </form>
  );
}
