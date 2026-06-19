import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coming Back Soon",
  description: "JC RAD is making updates to the site and will be back soon.",
};

export default function HomePage() {
  return (
    <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden py-10">
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(253,247,251,0.92)_42%,_rgba(240,225,250,0.88)_100%)]" />
      <div className="absolute inset-0 rounded-[2rem] bg-[linear-gradient(135deg,_rgba(143,82,220,0.1),_transparent_48%,_rgba(23,53,67,0.08))]" />

      <div className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white/80 px-8 py-12 text-center shadow-[0_24px_80px_rgba(89,47,128,0.16)] backdrop-blur sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8f52dc]">JC RAD</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#173543] sm:text-6xl">
          Coming back soon
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4f6470] sm:text-lg">
          We&apos;re making updates to the site. Please check back shortly.
        </p>
      </div>
    </section>
  );
}
