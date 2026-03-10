"use client";

import { useState } from "react";

type MediaType = "image" | "thumbnail" | "coa" | "spec_sheet" | "lab_result" | "other";

export default function MediaTestPage() {
  const [variantId, setVariantId] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "fetch" | null>(null);

  async function upload() {
    setError(null);
    setResult(null);

    if (!variantId) return setError("variant_id required");
    if (!file) return setError("file required");

    setBusy("upload");

    try {
      const form = new FormData();
      form.append("variant_id", variantId);
      form.append("media_type", mediaType);
      form.append("title", title);
      form.append("notes", notes);
      form.append("file", file);

      const res = await fetch("/api/admin/upload-variant-media", {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Upload failed");
        return;
      }

      setResult(json);
    } catch (e: any) {
      setError(e?.message || "Upload error");
    } finally {
      setBusy(null);
    }
  }

  async function fetchMedia() {
    setError(null);
    setResult(null);

    if (!variantId) return setError("variant_id required");

    setBusy("fetch");

    try {
      const res = await fetch("/api/variant-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Fetch failed");
        return;
      }

      setResult(json);
    } catch (e: any) {
      setError(e?.message || "Fetch error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        Variant Media Test (No Login Required)
      </h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Upload creates a DB row with <code>approved=false</code>. Then flip to{" "}
        <code>true</code> in Supabase and Fetch will show it.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label>
          <div style={{ fontWeight: 700 }}>variant_id</div>
          <input
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="paste catalog_variants.id"
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
          />
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>media_type</div>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as MediaType)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
          >
            <option value="image">image</option>
            <option value="thumbnail">thumbnail</option>
            <option value="coa">coa</option>
            <option value="spec_sheet">spec_sheet</option>
            <option value="lab_result">lab_result</option>
            <option value="other">other</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>title (optional)</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
          />
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>notes (optional)</div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
          />
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>file</div>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={upload}
            disabled={busy !== null}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #222",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy === "upload" ? "Uploading..." : "Upload (creates DB row)"}
          </button>

          <button
            onClick={fetchMedia}
            disabled={busy !== null}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #222",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy === "fetch" ? "Fetching..." : "Fetch Approved Public Media"}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              background: "#ffe6e6",
              border: "1px solid #ffb3b3",
              borderRadius: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            <b>Error:</b> {error}
          </div>
        )}

        {result && (
          <div style={{ display: "grid", gap: 12 }}>
            <pre
              style={{
                padding: 12,
                background: "#f5f5f5",
                borderRadius: 12,
                overflowX: "auto",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>

            {/* If the response includes media with url, show previews */}
            {Array.isArray(result?.media) && result.media.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Preview</div>
                <div style={{ display: "grid", gap: 16 }}>
                  {result.media.map((m: any) => (
                    <div
                      key={m.id}
                      style={{
                        padding: 12,
                        border: "1px solid #ddd",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {m.media_type} — {m.title || "(no title)"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {m.object_path}
                      </div>

                      {m.url && m.media_type === "image" && (
                        <img
                          src={m.url}
                          alt={m.title || "image"}
                          style={{
                            marginTop: 10,
                            width: "100%",
                            maxWidth: 520,
                            borderRadius: 12,
                            border: "1px solid #eee",
                          }}
                        />
                      )}

                      {m.url && m.media_type !== "image" && (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-block", marginTop: 10 }}
                        >
                          Open file
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload response includes media.url too */}
            {result?.media?.url && (
              <div>
                <div style={{ fontWeight: 800 }}>Uploaded file URL</div>
                <a href={result.media.url} target="_blank" rel="noreferrer">
                  {result.media.url}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}