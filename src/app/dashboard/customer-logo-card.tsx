"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

type LogoState = {
  logo_url: string | null;
  logo_bucket: string | null;
  logo_object_path: string | null;
};

type CustomerLogoCardProps = {
  initialLogo: LogoState;
};

const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function CustomerLogoCard({ initialLogo }: CustomerLogoCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logo, setLogo] = useState<LogoState>(initialLogo);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasLogo = Boolean(String(logo.logo_url || "").trim());

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
    setError(null);
    setSuccess(null);
  }

  async function uploadLogo() {
    if (!selectedFile) {
      setError("Choose a logo file first.");
      return;
    }

    setBusy("upload");
    setError(null);
    setSuccess(null);

    try {
      const form = new FormData();
      form.append("file", selectedFile);

      const res = await fetch("/api/customer/logo", {
        method: "POST",
        body: form,
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(String(json?.error || `Logo upload failed (${res.status})`));
      }

      const nextLogo = (json.logo || {}) as Partial<LogoState>;
      setLogo({
        logo_url: String(nextLogo.logo_url || "").trim() || null,
        logo_bucket: String(nextLogo.logo_bucket || "").trim() || null,
        logo_object_path: String(nextLogo.logo_object_path || "").trim() || null,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess(hasLogo ? "Logo replaced." : "Logo uploaded.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    setBusy("remove");
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/customer/logo", {
        method: "DELETE",
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(String(json?.error || `Logo removal failed (${res.status})`));
      }

      setLogo({
        logo_url: null,
        logo_bucket: null,
        logo_object_path: null,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess("Logo removed.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Logo removal failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-4">
        {hasLogo ? (
          <img
            src={String(logo.logo_url || "")}
            alt="Customer brand logo"
            className="h-24 w-full rounded-lg border border-[#dbe9ef] bg-white object-contain p-3"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-[#c9dbe4] bg-[#f6fbfd] px-4 text-sm text-[#4a6575]">
            No logo uploaded yet.
          </div>
        )}
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[#173543]">{hasLogo ? "Replace logo" : "Upload logo"}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={onFileChange}
          disabled={busy !== null}
          className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a] file:mr-3 file:rounded file:border-0 file:bg-[#eef7f6] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#0f766e] focus:border-[#14b8a6] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="text-xs text-[#5d7685]">JPG, PNG, or WebP up to 5MB.</span>
      </label>

      {error ? (
        <div className="rounded-xl border border-[#f3d2d2] bg-[#fff4f4] px-3 py-2 text-sm text-[#991b1b]">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-[#cde9e6] bg-[#eefaf8] px-3 py-2 text-sm text-[#0f766e]">{success}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void uploadLogo()}
          disabled={!selectedFile || busy !== null}
          className="inline-flex items-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "upload" ? "Saving..." : hasLogo ? "Replace logo" : "Upload logo"}
        </button>
        {hasLogo ? (
          <button
            type="button"
            onClick={() => void removeLogo()}
            disabled={busy !== null}
            className="inline-flex items-center rounded-full border border-[#d9c5c5] px-4 py-2 text-sm font-semibold text-[#8a2c2c] transition hover:border-[#8a2c2c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "remove" ? "Removing..." : "Remove logo"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
