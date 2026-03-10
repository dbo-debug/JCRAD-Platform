"use client";

import { useEffect, useMemo, useState } from "react";

type MediaType = "image" | "thumbnail" | "coa" | "spec_sheet" | "lab_result" | "other";
type Visibility = "internal" | "public";

type VariantMediaRow = {
  id: string;
  variant_id: string;
  media_type: MediaType;
  bucket: string;
  object_path: string;
  title: string | null;
  notes: string | null;
  visibility: Visibility;
  approved: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
  url: string | null;
};

const API_BASE = "/api/admin/variant-media";

type VariantMediaManagerProps = {
  initialVariantId?: string;
};

function formatHttpError(action: string, res: Response, json: unknown) {
  const payload = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const message =
    (typeof payload?.error === "string" && payload.error) ||
    (typeof payload?.message === "string" && payload.message) ||
    JSON.stringify(json);

  return `${action} failed (HTTP ${res.status}): ${message}`;
}

export default function VariantMediaManager({ initialVariantId = "" }: VariantMediaManagerProps) {
  const [variantId, setVariantId] = useState(initialVariantId);
  const [rows, setRows] = useState<VariantMediaRow[]>([]);
  const [busy, setBusy] = useState<null | "load" | "upload" | "update" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [file, setFile] = useState<File | null>(null);

  const canAct = useMemo(() => busy === null, [busy]);

  useEffect(() => {
    setVariantId(initialVariantId);
  }, [initialVariantId]);

  async function load() {
    setError(null);
    setBusy("load");
    try {
      if (!variantId) {
        setRows([]);
        setError("Paste a variant_id first.");
        return;
      }

      const res = await fetch(`${API_BASE}/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatHttpError("Load media", res, json));
        return;
      }

      setRows(json.media || []);
    } catch (e: any) {
      setError(e?.message || "Load error");
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    setError(null);
    setBusy("upload");

    try {
      if (!variantId) return setError("variant_id required");
      if (!file) return setError("file required");

      const form = new FormData();
      form.append("variant_id", variantId);
      form.append("media_type", mediaType);
      form.append("title", title);
      form.append("notes", notes);
      form.append("visibility", visibility); // we'll store this
      form.append("file", file);

      const res = await fetch("/api/admin/upload-variant-media", {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatHttpError("Upload", res, json));
        return;
      }

      // Clear form
      setTitle("");
      setNotes("");
      setFile(null);

      // Refresh list
      await load();
    } catch (e: any) {
      setError(e?.message || "Upload error");
    } finally {
      setBusy(null);
    }
  }

  async function updateRow(id: string, patch: Partial<Pick<VariantMediaRow, "approved" | "visibility" | "title" | "notes" | "sort_order" | "is_featured">>) {
    setError(null);
    setBusy("update");

    try {
      const res = await fetch(`${API_BASE}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatHttpError("Update media", res, json));
        return;
      }

      // optimistic local update
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } as VariantMediaRow : r))
      );
    } catch (e: any) {
      setError(e?.message || "Update error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRow(id: string) {
    setError(null);
    setBusy("delete");

    try {
      const res = await fetch(`${API_BASE}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatHttpError("Delete media", res, json));
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || "Delete error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 18, display: "grid", gap: 16, maxWidth: 1100 }}>
      {/* Variant selector */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>variant_id</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="paste catalog_variants.id"
            style={{ flex: 1, minWidth: 420, padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
          />
          <button
            onClick={load}
            disabled={!canAct}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #222" }}
          >
            {busy === "load" ? "Loading..." : "Load Media"}
          </button>
        </div>
      </div>

      {/* Upload */}
      <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Upload media to this variant</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>media_type</div>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as MediaType)}
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            >
              <option value="image">image</option>
              <option value="thumbnail">thumbnail</option>
              <option value="coa">coa</option>
              <option value="spec_sheet">spec_sheet</option>
              <option value="lab_result">lab_result</option>
              <option value="other">other</option>
            </select>

            <div style={{ fontWeight: 700 }}>visibility</div>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            >
              <option value="public">public (customer can see once approved)</option>
              <option value="internal">internal (never shown to customers)</option>
            </select>

            <div style={{ fontWeight: 700 }}>title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Batch COA, Hero image, etc"
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            />

            <div style={{ fontWeight: 700 }}>notes</div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            />

            <div style={{ fontWeight: 700 }}>file</div>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <button
              onClick={upload}
              disabled={!canAct}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #222" }}
            >
              {busy === "upload" ? "Uploading..." : "Upload"}
            </button>
            <span style={{ marginLeft: 10, opacity: 0.8 }}>
              Uploads as <b>approved=false</b> (you approve below).
            </span>
          </div>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div style={{ padding: 12, background: "#ffe6e6", border: "1px solid #ffb3b3", borderRadius: 12 }}>
          <b>Error:</b> {error}
        </div>
      )}

      {/* List */}
      <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          Media ({rows.length})
        </div>

        {rows.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No media loaded yet. Paste variant_id and click Load.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {r.media_type} - {r.title || "(no title)"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{r.object_path}</div>
                    {r.url && (
                      <div style={{ marginTop: 6 }}>
                        <a href={r.url} target="_blank" rel="noreferrer">
                          Open file
                        </a>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={r.approved}
                        disabled={!canAct}
                        onChange={(e) => updateRow(r.id, { approved: e.target.checked })}
                      />
                      <span style={{ fontWeight: 700 }}>Approved</span>
                    </label>

                    <select
                      value={r.visibility}
                      disabled={!canAct}
                      onChange={(e) => updateRow(r.id, { visibility: e.target.value as Visibility })}
                      style={{ padding: 8, border: "1px solid #ccc", borderRadius: 10 }}
                    >
                      <option value="public">public</option>
                      <option value="internal">internal</option>
                    </select>

                    <button
                      onClick={() => deleteRow(r.id)}
                      disabled={!canAct}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #222",
                        background: "transparent",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Image preview */}
                {r.media_type === "image" && r.url && (
                  <img
                    src={r.url}
                    alt={r.title || "image"}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      maxWidth: 520,
                      borderRadius: 12,
                      border: "1px solid #eee",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
