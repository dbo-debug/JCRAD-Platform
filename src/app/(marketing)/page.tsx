import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coming Back Soon",
  description: "JC RAD INC. Coming back soon...",
};

export default function HomePage() {
  return (
    <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden py-10">
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(240,249,251,0.96)_42%,_rgba(228,240,245,0.9)_100%)]" />
      <div className="absolute inset-0 rounded-[2rem] bg-[linear-gradient(135deg,_rgba(13,111,122,0.08),_transparent_48%,_rgba(23,53,67,0.08))]" />

      <div className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white/88 px-8 py-12 text-center shadow-[0_24px_80px_rgba(20,58,74,0.12)] backdrop-blur sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#0d6f7a]">JC RAD INC.</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#173543] sm:text-6xl">
          Coming back soon...
        </h1>
      </div>
    </section>
  );
}
