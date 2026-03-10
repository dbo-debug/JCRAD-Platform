"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function safeInternalPath(value: string | null): string {
  const candidate = String(value || "").trim();
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  return candidate;
}

export default function AgeGatePage() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => safeInternalPath(searchParams.get("returnTo")), [searchParams]);

  function confirmAge() {
    document.cookie = `age_verified=true; Max-Age=${THIRTY_DAYS_SECONDS}; Path=/; SameSite=Lax`;
    window.location.href = returnTo;
  }

  function exitSite() {
    window.location.href = "https://google.com";
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fbfd_0%,#eef5f8_100%)] px-4 py-10 text-[#1c2f3a]">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
        <section className="w-full rounded-2xl border border-[#d9e7ee] bg-white p-8 shadow-[0_20px_40px_-26px_rgba(16,24,40,0.45)] md:p-10">
          <div className="mb-5 inline-flex rounded-full border border-[#bde8e4] bg-[#e9fbf9] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
            Age Verification
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[#173543]">Are you 21 or older?</h1>
          <p className="mt-3 text-base text-[#4a6575]">You must be 21+ to enter this site.</p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={confirmAge}
              className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Yes, I am 21+
            </button>
            <button
              type="button"
              onClick={exitSite}
              className="inline-flex items-center justify-center rounded-full border border-[#cfdde5] bg-white px-5 py-3 text-sm font-semibold text-[#2d4756] transition hover:border-[#9fb7c4]"
            >
              Exit
            </button>
          </div>

          <p className="mt-6 text-xs text-[#708995]">
            By entering, you confirm you are at least 21 years old.
          </p>
        </section>
      </div>
    </main>
  );
}
