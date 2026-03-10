"use client";

import { useEffect, useMemo, useState } from "react";

type MediaType = "image" | "coa" | "other";
type Visibility = "internal" | "public";

type MediaRow = {
  id: string;
  variant_id: string;
  media_type: string;
  bucket: string;
  object_path: string;
  title: string | null;
  notes: string | null;
  visibility: Visibility;
  approved: boolean;
  created_at: string;
  url: string | null;
};

function parseMediaType(value: string): MediaType {
  if (value === "image") return "image";
  if (value === "coa") return "coa";
  return "other";
}

export default function ProductMediaManager({
  productId,
  productName,
  productCategory,
}: {
  productId: string;
  productName?: string | null;
  productCategory?: string | null;
}) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "load" | "upload" | "update" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  const canAct = useMemo(() => busy === null && !!productId, [busy, productId]);

  async function load() {
    if (!productId) {
      setRows([]);
      return;
    }
    setBusy("load");
    setError(null);

    try {
      const res = await fetch("/api/admin/variant-media/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: productId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Load failed (${res.status})`);
        return;
      }

      setRows((json.media || []) as MediaRow[]);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, [productId]);

  async function upload() {
    if (!productId || !file) return;
    setBusy("upload");
    setError(null);

    try {
      const form = new FormData();
      form.append("product_id", productId);
      form.append("product_name", productName || "");
      form.append("product_category", productCategory || "");
      form.append("media_type", mediaType);
      form.append("title", title);
      form.append("notes", notes);
      form.append("visibility", visibility);
      form.append("file", file);

      const res = await fetch("/api/admin/upload-variant-media", {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Upload failed (${res.status})`);
        return;
      }

      setFile(null);
      setTitle("");
      setNotes("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function updateRow(id: string, patch: Partial<Pick<MediaRow, "approved" | "visibility">>) {
    setBusy("update");
    setError(null);

    try {
      const res = await fetch("/api/admin/variant-media/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Update failed (${res.status})`);
        return;
      }

      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRow(id: string) {
    setBusy("delete");
    setError(null);

    try {
      const res = await fetch("/api/admin/variant-media/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Delete failed (${res.status})`);
        return;
      }

      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!productId && <div style={{ fontSize: 13, opacity: 0.8 }}>Select a product to manage media.</div>}

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Upload</div>
        <select value={mediaType} onChange={(e) => setMediaType(parseMediaType(e.target.value))} disabled={!canAct}>
          <option value="image">image</option>
          <option value="other">video</option>
          <option value="coa">coa</option>
        </select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} disabled={!canAct}>
          <option value="public">public</option>
          <option value="internal">internal</option>
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" disabled={!canAct} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" disabled={!canAct} />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!canAct} />
        <div>
          <button onClick={upload} disabled={!canAct || !file}>{busy === "upload" ? "Uploading..." : "Upload"}</button>
          <button onClick={load} disabled={!canAct || busy === "load"} style={{ marginLeft: 8 }}>
            {busy === "load" ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#a00" }}>{error}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{row.media_type}</strong>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{row.visibility}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{row.object_path}</div>
            {row.url && <a href={row.url} target="_blank" rel="noreferrer">Open</a>}
            <div style={{ display: "flex", gap: 8 }}>
              <label>
                <input
                  type="checkbox"
                  checked={!!row.approved}
                  onChange={(e) => updateRow(row.id, { approved: e.target.checked })}
                  disabled={busy !== null}
                /> approved
              </label>
              <select
                value={row.visibility}
                onChange={(e) => updateRow(row.id, { visibility: e.target.value as Visibility })}
                disabled={busy !== null}
              >
                <option value="public">public</option>
                <option value="internal">internal</option>
              </select>
              <button onClick={() => deleteRow(row.id)} disabled={busy !== null}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
