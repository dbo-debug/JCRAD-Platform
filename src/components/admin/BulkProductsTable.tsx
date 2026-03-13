"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { displayPriceUnit } from "@/lib/pricing-display";

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  created_at: string | null;
  thumbnail_url?: string | null;
  active?: boolean | null;
  is_active?: boolean | null;
  status?: string | null;
  inventory_qty?: number | null;
  inventory_unit?: string | null;
  bulk_cost_per_lb?: number | null;
  bulk_sell_per_lb?: number | null;
  material_cost_per_g?: number | null;
  offer?: {
    bulk_cost_per_lb?: number | null;
    bulk_sell_per_lb?: number | null;
    material_cost_per_g?: number | null;
  } | null;
};

type ActionType = "deactivate" | "restore";
type ActivityTab = "Active" | "Inactive" | "All";

const CATEGORY_TABS = ["All", "Flower", "Concentrate", "Vape", "Pre-Roll"] as const;
const ACTIVITY_TABS: ActivityTab[] = ["Active", "Inactive", "All"];

function isActiveProduct(product: ProductRow): boolean {
  if (typeof product.active === "boolean") return product.active;
  if (typeof product.is_active === "boolean") return product.is_active;
  return String(product.status || "").toLowerCase() === "active";
}

function formatCreated(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatQty(value: unknown, unit: string | null | undefined): string {
  const qty = finiteOrNull(value);
  if (qty == null) return "-";
  const normalizedUnit = String(unit || "").trim();
  if (!normalizedUnit) return "-";
  return `${qty.toFixed(2)} ${normalizedUnit}`;
}

function formatMoneyPerUnit(value: unknown, product: { inventory_unit?: unknown; category?: unknown }): string {
  const n = finiteOrNull(value);
  if (n == null) return "-";
  return `$${n.toFixed(2)}/${displayPriceUnit(product)}`;
}

function categoryMatches(productCategory: string | null, selectedCategory: (typeof CATEGORY_TABS)[number]): boolean {
  const normalized = String(productCategory || "").toLowerCase();
  if (selectedCategory === "All") return true;
  if (selectedCategory === "Pre-Roll") {
    return normalized === "pre_roll" || normalized === "preroll" || normalized === "pre-roll";
  }
  return normalized === selectedCategory.toLowerCase();
}

export default function BulkProductsTable() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityTab>("Active");
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_TABS)[number]>("All");
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: ActionType; product: ProductRow } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedActivity === "Active") params.set("active", "true");
    if (selectedActivity === "Inactive") params.set("active", "false");
    const query = params.toString();
    const response = await fetch(`/api/admin/products${query ? `?${query}` : ""}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(String(json?.error || "Failed to load products"));
      setProducts([]);
      setLoading(false);
      return;
    }

    setProducts((json?.products || []) as ProductRow[]);
    setLoading(false);
  }, [selectedActivity]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function openActionModal(type: ActionType, product: ProductRow) {
    setPendingAction({ type, product });
    setModalError(null);
  }

  function closeActionModal() {
    if (mutatingId) return;
    setPendingAction(null);
    setModalError(null);
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const { type, product } = pendingAction;
    setMutatingId(product.id);
    setModalError(null);

    try {
      const res = await fetch(`/api/admin/catalog-items/${product.id}`, {
        method: type === "deactivate" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: type === "deactivate" ? undefined : JSON.stringify({ active: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || "Update failed"));
      setProducts((prev) =>
        prev.map((row) =>
          row.id === product.id
            ? {
              ...row,
              active: type === "restore",
              is_active: type === "restore",
              status: type === "restore" ? "active" : "inactive",
            }
            : row
        )
      );
      setPendingAction(null);
    } catch (err: any) {
      setModalError(String(err?.message || "Failed to update item"));
    } finally {
      setMutatingId(null);
    }
  }

  const filtered = useMemo(() => {
    const byActivity =
      selectedActivity === "All"
        ? products
        : products.filter((product) =>
          selectedActivity === "Active" ? isActiveProduct(product) : !isActiveProduct(product)
        );

    return selectedCategory === "All"
      ? byActivity
      : byActivity.filter((product) => categoryMatches(product.category, selectedCategory));
  }, [products, selectedActivity, selectedCategory]);
  const hasRows = filtered.length > 0;

  return (
    <div>
      <AdminPageHeader
        title="Bulk Products"
        description="Manage product catalog records."
        action={
          <Link
            href="/admin/catalog/bulk/new"
            className="inline-flex items-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            + Add Product
          </Link>
        }
      />

      <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-[#dbe9ef] bg-[#f6fbfd] p-2 text-sm">
        {ACTIVITY_TABS.map((tab) => {
          const active = tab === selectedActivity;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedActivity(tab)}
              className={[
                "rounded px-3 py-1.5 transition-colors",
                active ? "bg-[#14b8a6] text-white" : "bg-transparent text-[#5b7382] hover:text-[#173543]",
              ].join(" ")}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-[#dbe9ef] bg-[#f6fbfd] p-2 text-sm">
        {CATEGORY_TABS.map((tab) => {
          const active = tab === selectedCategory;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedCategory(tab)}
              className={[
                "rounded px-3 py-1.5 transition-colors",
                active ? "bg-[#14b8a6] text-white" : "bg-transparent text-[#5b7382] hover:text-[#173543]",
              ].join(" ")}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {loading ? <p className="mb-4 text-sm text-[#5b7382]">Loading products...</p> : null}
      {error ? <p className="mb-4 text-sm text-[#991b1b]">{error}</p> : null}

      {!loading && !error && !hasRows ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-[#dbe9ef] bg-white text-center">
          <p className="text-lg text-[#173543]">No products yet.</p>
          <p className="mt-2 text-sm text-[#5b7382]">
            Click &ldquo;Add Product&rdquo; to create your first catalog item.
          </p>
        </div>
      ) : hasRows ? (
        <div className="overflow-x-auto rounded-lg border border-[#dbe9ef] bg-white">
          <table className="min-w-full text-left text-sm text-[#173543]">
            <thead className="border-b border-[#dbe9ef] text-[#5b7382]">
              <tr>
                <th className="px-4 py-3 font-medium">Image</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Sell Price</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const active = isActiveProduct(product);
                const inventoryQty = finiteOrNull(product.inventory_qty);
                const inventoryUnit = product.inventory_unit ?? null;
                const costFromOffer = finiteOrNull(product.bulk_cost_per_lb ?? product.offer?.bulk_cost_per_lb);
                const costFromMaterial = finiteOrNull(
                  (product.material_cost_per_g ?? product.offer?.material_cost_per_g) != null
                    ? Number(product.material_cost_per_g ?? product.offer?.material_cost_per_g) * 453.592
                    : null
                );
                const effectiveCost = costFromOffer ?? costFromMaterial;
                const sell = finiteOrNull(product.bulk_sell_per_lb ?? product.offer?.bulk_sell_per_lb);

                return (
                  <tr key={product.id} className="border-b border-[#eef3f6] last:border-b-0">
                    <td className="px-4 py-3">
                      <img
                        src={product.thumbnail_url || "/brand/PRIMARY.png"}
                        alt={`${product.name || "Product"} image`}
                        className="h-14 w-14 rounded-md border border-[#dbe9ef] object-cover"
                      />
                    </td>
                    <td className="px-4 py-3">{product.name || "Untitled"}</td>
                    <td className="px-4 py-3 capitalize text-[#4f6877]">{product.category || "-"}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatQty(inventoryQty, inventoryUnit)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatMoneyPerUnit(effectiveCost, product)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatMoneyPerUnit(sell, product)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded px-2 py-1 text-xs font-semibold",
                          active ? "bg-[#14b8a6] text-white" : "bg-[#e6edf2] text-[#4f6877]",
                        ].join(" ")}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatCreated(product.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/catalog/bulk/${product.id}/edit`}
                          className="rounded border border-[#cfdde5] px-2.5 py-1 text-xs text-[#4f6877] hover:text-[#173543]"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/catalog/bulk/${product.id}/media`}
                          className="rounded border border-[#cfdde5] px-2.5 py-1 text-xs text-[#4f6877] hover:text-[#173543]"
                        >
                          Media
                        </Link>
                        <button
                          type="button"
                          disabled={mutatingId === product.id}
                          onClick={() => openActionModal(active ? "deactivate" : "restore", product)}
                          className="rounded border border-[#cfdde5] px-2.5 py-1 text-xs text-[#4f6877] hover:text-[#173543] disabled:opacity-60"
                        >
                          {mutatingId === product.id ? "Saving..." : active ? "Deactivate" : "Restore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg border border-[#dbe9ef] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#173543]">
              {pendingAction.type === "deactivate" ? "Deactivate product?" : "Restore product?"}
            </h2>
            <p className="mt-2 text-sm text-[#4f6877]">
              {pendingAction.type === "deactivate"
                ? "This will hide the product from the menu and prevent new estimates using it. You can restore it later."
                : "This will make the product visible on the menu again."}
            </p>
            {modalError ? <p className="mt-3 text-sm text-[#991b1b]">{modalError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeActionModal}
                disabled={!!mutatingId}
                className="rounded border border-[#cfdde5] px-3 py-1.5 text-xs text-[#4f6877] hover:text-[#173543] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmAction()}
                disabled={!!mutatingId}
                className="rounded bg-[#14b8a6] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {mutatingId
                  ? "Saving..."
                  : pendingAction.type === "deactivate"
                    ? "Deactivate"
                    : "Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
