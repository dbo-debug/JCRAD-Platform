"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PACKAGING_CATEGORIES,
  packagingCategoryLabel,
  type PackagingCategory,
} from "@/lib/packaging/category";

type SubmissionRow = {
  id: string;
  category: PackagingCategory;
  status: string;
  notes: string;
  review_notes: string;
  front_image_url: string | null;
  back_image_url: string | null;
  created_at: string | null;
};

type PackagingUploadClientProps = {
  submissions: SubmissionRow[];
  defaultCategory: PackagingCategory;
  returnTo: string;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

function formatDate(value: string | null): string {
  if (!value) return "Date pending";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Date pending";
  return new Date(parsed).toLocaleDateString();
}

function statusLabel(status: string): string {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
}

export default function PackagingUploadClient({
  submissions,
  defaultCategory,
  returnTo,
}: PackagingUploadClientProps) {
  const router = useRouter();
  const [category, setCategory] = useState<PackagingCategory>(defaultCategory);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submissionsByCategory = useMemo(() => {
    const grouped = new Map<PackagingCategory, SubmissionRow[]>();
    for (const key of PACKAGING_CATEGORIES) grouped.set(key, []);
    for (const row of submissions) {
      grouped.get(row.category)?.push(row);
    }
    return grouped;
  }, [submissions]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!frontFile || !backFile) {
      setError("Front and back artwork files are required.");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("customer_name", "");
      form.append("customer_phone", "");
      form.append("notes", notes || "Customer packaging submission");
      form.append("front_file", frontFile);
      form.append("back_file", backFile);

      const res = await fetch("/api/packaging/submission/create", {
        method: "POST",
        body: form,
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(String(json?.error || `Packaging upload failed (${res.status})`));
      }

      setSuccess("Packaging submitted. Review pending.");
      setFrontFile(null);
      setBackFile(null);
      setNotes("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Packaging upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[#173543]">Packaging category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PackagingCategory)}
            className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a] focus:border-[#14b8a6] focus:outline-none"
          >
            {PACKAGING_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {packagingCategoryLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[#173543]">Front artwork</span>
            <input
              type="file"
              onChange={(e) => setFrontFile(e.target.files?.[0] || null)}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a] file:mr-3 file:rounded file:border-0 file:bg-[#eef7f6] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#0f766e] focus:border-[#14b8a6] focus:outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[#173543]">Back artwork</span>
            <input
              type="file"
              onChange={(e) => setBackFile(e.target.files?.[0] || null)}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a] file:mr-3 file:rounded file:border-0 file:bg-[#eef7f6] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#0f766e] focus:border-[#14b8a6] focus:outline-none"
            />
          </label>
        </div>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[#173543]">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a] placeholder:text-[#8aa0ae] focus:border-[#14b8a6] focus:outline-none"
            placeholder="Packaging notes for compliance review"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-3 py-2 text-sm text-[#991b1b]">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-xl border border-[#cde9e6] bg-[#eefaf8] px-3 py-2 text-sm text-[#0f766e]">
            {success}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit Packaging"}
          </button>
          <Link
            href={returnTo}
            className="inline-flex items-center rounded-full border border-[#cfdce4] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Back
          </Link>
        </div>
      </form>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[#173543]">Submitted Packaging</h2>
        {PACKAGING_CATEGORIES.map((cat) => {
          const rows = submissionsByCategory.get(cat) || [];
          return (
            <div key={cat} className="space-y-2 rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-4">
              <p className="text-sm font-semibold text-[#173543]">{packagingCategoryLabel(cat)}</p>
              {rows.length === 0 ? (
                <p className="text-sm text-[#5d7685]">No submissions yet.</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-[#d8e5ec] bg-white px-3 py-2 text-sm text-[#24404d]">
                      <p className="font-semibold capitalize">{statusLabel(row.status)}</p>
                      <p className="text-xs text-[#5d7685]">Submitted: {formatDate(row.created_at)}</p>
                      {row.notes ? <p className="mt-1 text-xs text-[#5d7685]">Notes: {row.notes}</p> : null}
                      {row.review_notes ? <p className="mt-1 text-xs text-[#5d7685]">Review: {row.review_notes}</p> : null}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {row.front_image_url ? (
                          <a href={row.front_image_url} target="_blank" rel="noreferrer" className="text-[#0f766e] underline">
                            Front artwork
                          </a>
                        ) : null}
                        {row.back_image_url ? (
                          <a href={row.back_image_url} target="_blank" rel="noreferrer" className="text-[#0f766e] underline">
                            Back artwork
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
