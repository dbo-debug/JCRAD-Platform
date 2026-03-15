"use client";

import { useState } from "react";

type ImportField = { key: string; label: string };
type PreviewRow = {
  rowNumber: number;
  classification: string;
  companyName: string | null;
  assignmentStatus: string;
  assignmentLabel: string | null;
  matchStatus: string;
  matchVia: string | null;
  parsedEmails: string[];
  warnings: string[];
};

type PreviewResponse = {
  spreadsheetId: string;
  tabName: string;
  headers: string[];
  mapping: Record<string, string | null>;
  summary: Record<string, number>;
  rows: PreviewRow[];
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function CustomerImportManager({ fields, canApply }: { fields: ImportField[]; canApply: boolean }) {
  const [spreadsheetIdOrUrl, setSpreadsheetIdOrUrl] = useState("");
  const [tabName, setTabName] = useState("Accounts");
  const [importNotes, setImportNotes] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function runPreview(nextMapping?: Record<string, string | null>) {
    setBusy("preview");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/workspace/customer-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_id_or_url: spreadsheetIdOrUrl,
          tab_name: tabName,
          mapping: nextMapping || mapping,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Preview failed (${res.status})`));
      const nextPreview = json as unknown as PreviewResponse;
      setPreview(nextPreview);
      setMapping(nextPreview.mapping || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function applyImport() {
    setBusy("apply");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/workspace/customer-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_id_or_url: spreadsheetIdOrUrl,
          tab_name: tabName,
          mapping,
          import_notes: importNotes,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Apply failed (${res.status})`));
      setSuccess(
        `Applied import. Created ${Number(json.report?.customersCreated || 0)} customers, updated ${Number(json.report?.customersUpdated || 0)}, created ${Number(json.report?.contactsCreated || 0)} contacts.`
      );
      if (json.preview) {
        const nextPreview = json.preview as PreviewResponse;
        setPreview(nextPreview);
        setMapping(nextPreview.mapping || {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Spreadsheet ID or URL</span>
            <input
              value={spreadsheetIdOrUrl}
              onChange={(e) => setSpreadsheetIdOrUrl(e.target.value)}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
              placeholder="Google Sheet URL or spreadsheet ID"
            />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Tab Name</span>
            <input
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
              placeholder="Accounts"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!spreadsheetIdOrUrl || !tabName || busy !== null}
            className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "preview" ? "Loading Preview..." : "Preview Import"}
          </button>
          <label className="inline-flex items-center gap-2 text-sm text-[#4a6575]">
            <input type="checkbox" checked={importNotes} onChange={(e) => setImportNotes(e.target.checked)} />
            Import notes as internal notes
          </label>
          {canApply ? (
            <button
              type="button"
              onClick={() => void applyImport()}
              disabled={!preview || busy !== null}
              className="rounded-full border border-[#14b8a6] px-4 py-2 text-sm font-semibold text-[#0f766e] disabled:opacity-60"
            >
              {busy === "apply" ? "Applying..." : "Apply Import"}
            </button>
          ) : (
            <p className="text-sm text-[#5d7685]">Preview is available for sales. Apply is restricted to admins.</p>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-[#991b1b]">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-[#0f766e]">{success}</p> : null}
      </section>

      {preview ? (
        <>
          <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#173543]">Column Mapping</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((field) => (
                <label key={field.key} className="grid gap-1 text-sm text-[#4a6575]">
                  <span>{field.label}</span>
                  <select
                    value={mapping[field.key] || ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value || null }))}
                    className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
                  >
                    <option value="">Unmapped</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void runPreview(mapping)}
                disabled={busy !== null}
                className="rounded-full border border-[#cfdde5] px-4 py-2 text-sm font-semibold text-[#24404d] disabled:opacity-60"
              >
                Refresh Preview
              </button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-5">
            {Object.entries(preview.summary).map(([key, value]) => (
              <div key={key} className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{key.replace(/_/g, " ")}</p>
                <p className="mt-2 text-2xl font-semibold text-[#173543]">{value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#dbe9ef] bg-white shadow-sm">
            <table className="min-w-full divide-y divide-[#e6eef3] text-sm">
              <thead className="bg-[#f7fbfd] text-left text-[#5b7382]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Row</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Classification</th>
                  <th className="px-4 py-3 font-semibold">Match</th>
                  <th className="px-4 py-3 font-semibold">Assignment</th>
                  <th className="px-4 py-3 font-semibold">Emails</th>
                  <th className="px-4 py-3 font-semibold">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef3f6]">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="align-top">
                    <td className="px-4 py-4 text-[#4f6877]">{row.rowNumber}</td>
                    <td className="px-4 py-4 text-[#173543] font-semibold">{row.companyName || "Missing Store Name"}</td>
                    <td className="px-4 py-4 text-[#4f6877]">{row.classification}</td>
                    <td className="px-4 py-4 text-[#4f6877]">{row.matchStatus}{row.matchVia ? ` (${row.matchVia})` : ""}</td>
                    <td className="px-4 py-4 text-[#4f6877]">{row.assignmentStatus}{row.assignmentLabel ? `: ${row.assignmentLabel}` : ""}</td>
                    <td className="px-4 py-4 text-[#4f6877]">{row.parsedEmails.length > 0 ? row.parsedEmails.join(", ") : "No clean email"}</td>
                    <td className="px-4 py-4 text-[#4f6877]">{row.warnings.length > 0 ? row.warnings.join(" | ") : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
