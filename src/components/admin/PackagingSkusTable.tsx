"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

type PackagingFilter = "All" | "Flower" | "Concentrate" | "Vape" | "Pre-Roll";
type AppliesTo = "flower" | "concentrate" | "vape" | "pre_roll";

type PackagingSkuRow = {
  id: string;
  name: string | null;
  applies_to: string | null;
  packaging_type: string | null;
  size_grams: number | null;
  pack_qty: number | null;
  vape_fill_grams: number | null;
  unit_cost: number | null;
  inventory_qty: number | null;
  active: boolean | null;
  thumbnail_url: string | null;
};

type ActionType = "deactivate" | "restore";

const FILTER_TABS: PackagingFilter[] = ["All", "Flower", "Concentrate", "Vape", "Pre-Roll"];

function normalizeAppliesTo(value: string | null): AppliesTo | "" {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "pre-roll" || raw === "preroll") return "pre_roll";
  if (raw === "flower" || raw === "concentrate" || raw === "vape" || raw === "pre_roll") return raw;
  return "";
}

function filterToAppliesTo(tab: PackagingFilter): AppliesTo | null {
  if (tab === "All") return null;
  if (tab === "Pre-Roll") return "pre_roll";
  return tab.toLowerCase() as Exclude<AppliesTo, "pre_roll">;
}

function formatAppliesTo(value: string | null): string {
  const normalized = normalizeAppliesTo(value);
  if (!normalized) return "-";
  if (normalized === "pre_roll") return "Pre-Roll";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSize(row: PackagingSkuRow): string {
  const sizeGrams = Number(row.size_grams);
  if (Number.isFinite(sizeGrams) && sizeGrams > 0) return `${sizeGrams}g`;
  const vapeFill = Number(row.vape_fill_grams);
  if (Number.isFinite(vapeFill) && vapeFill > 0) return `${vapeFill}g`;
  return "-";
}

function formatMoney(value: number | null): string {
  if (!Number.isFinite(Number(value))) return "-";
  const n = Number(value);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value: number | null): string {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function PackagingSkusTable() {
  const [rows, setRows] = useState<PackagingSkuRow[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<PackagingFilter>("All");
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: ActionType; row: PackagingSkuRow } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/admin/packaging-skus", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(String(json?.error || "Failed to load packaging SKUs"));
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json?.skus || []) as PackagingSkuRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function openActionModal(type: ActionType, row: PackagingSkuRow) {
    setPendingAction({ type, row });
    setModalError(null);
  }

  function closeActionModal() {
    if (mutatingId) return;
    setPendingAction(null);
    setModalError(null);
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const { row, type } = pendingAction;

    setMutatingId(row.id);
    setModalError(null);

    try {
      const res = await fetch(`/api/admin/packaging-skus/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: type === "restore" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || "Failed to update packaging SKU"));
      await loadRows();
      setPendingAction(null);
    } catch (err: any) {
      setModalError(String(err?.message || "Failed to update packaging SKU"));
    } finally {
      setMutatingId(null);
    }
  }

  const filteredRows = useMemo(() => {
    const filterValue = filterToAppliesTo(selectedFilter);
    if (!filterValue) return rows;
    return rows.filter((row) => normalizeAppliesTo(row.applies_to) === filterValue);
  }, [rows, selectedFilter]);

  const hasRows = filteredRows.length > 0;

  return (
    <div>
      <AdminPageHeader
        title="Packaging"
        description="Manage packaging SKUs."
        action={
          <Link
            href="/admin/catalog/packaging/new"
            className="inline-flex items-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
          >
            + Add Packaging
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-[#dbe9ef] bg-[#f6fbfd] p-2 text-sm">
        {FILTER_TABS.map((tab) => {
          const active = tab === selectedFilter;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedFilter(tab)}
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

      {loading ? <p className="mb-4 text-sm text-[#5b7382]">Loading packaging...</p> : null}
      {error ? <p className="mb-4 text-sm text-[#991b1b]">{error}</p> : null}

      {!loading && !error && !hasRows ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-[#dbe9ef] bg-white text-center">
          <p className="text-lg text-[#173543]">No packaging SKUs yet.</p>
          <p className="mt-2 text-sm text-[#5b7382]">Click &ldquo;Add Packaging&rdquo; to create one.</p>
        </div>
      ) : hasRows ? (
        <div className="overflow-x-auto rounded-lg border border-[#dbe9ef] bg-white">
          <table className="min-w-full text-left text-sm text-[#173543]">
            <thead className="border-b border-[#dbe9ef] text-[#5b7382]">
              <tr>
                <th className="px-4 py-3 font-medium">Thumbnail</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Applies To</th>
                <th className="px-4 py-3 font-medium">Packaging Type</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Pack Qty</th>
                <th className="px-4 py-3 font-medium">Unit Cost</th>
                <th className="px-4 py-3 font-medium">Qty Available</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const active = !!row.active;
                const thumbnailSrc = String(row.thumbnail_url || "").trim();
                const imageSrc = thumbnailSrc
                  ? `${thumbnailSrc}${thumbnailSrc.includes("?") ? "&" : "?"}t=${encodeURIComponent(String(row.id || ""))}`
                  : "/brand/PRIMARY.png";
                return (
                  <tr key={row.id} className="border-b border-[#eef3f6] last:border-b-0">
                    <td className="px-4 py-3">
                      <img
                        src={imageSrc}
                        alt={`${row.name || "Packaging"} thumbnail`}
                        className="h-14 w-14 rounded-md border border-[#dbe9ef] object-cover"
                      />
                    </td>
                    <td className="px-4 py-3">{row.name || "Untitled"}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatAppliesTo(row.applies_to)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{row.packaging_type || "-"}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatSize(row)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatQty(row.pack_qty)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatMoney(row.unit_cost)}</td>
                    <td className="px-4 py-3 text-[#4f6877]">{formatQty(row.inventory_qty)}</td>
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
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/catalog/packaging/${row.id}/edit`}
                          className="rounded border border-[#cfdde5] px-2.5 py-1 text-xs text-[#4f6877] hover:text-[#173543]"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={mutatingId === row.id}
                          onClick={() => openActionModal(active ? "deactivate" : "restore", row)}
                          className="rounded border border-[#cfdde5] px-2.5 py-1 text-xs text-[#4f6877] hover:text-[#173543] disabled:opacity-60"
                        >
                          {mutatingId === row.id ? "Saving..." : active ? "Deactivate" : "Restore"}
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
              {pendingAction.type === "deactivate" ? "Deactivate packaging SKU?" : "Restore packaging SKU?"}
            </h2>
            <p className="mt-2 text-sm text-[#4f6877]">
              {pendingAction.type === "deactivate"
                ? "This will hide the packaging option from selection and prevent it from being used in new estimates. You can restore it later."
                : "This will make the packaging SKU selectable again."}
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
                {mutatingId ? "Saving..." : pendingAction.type === "deactivate" ? "Deactivate" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
