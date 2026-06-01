import type { ReactNode } from "react";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  backgroundImage: string;
};

export default function Hero({
  eyebrow,
  title,
  description,
  backgroundImage,
}: HeroProps) {
  return (
    <section className="relative min-h-[420px] overflow-hidden rounded-3xl border border-[#5a3a87] bg-[#2f1d47] p-7 shadow-[0_28px_48px_-34px_rgba(46,20,74,0.72)] md:min-h-[500px] md:p-12">
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-45"
      />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(40,18,63,0.92)_0%,rgba(66,29,101,0.76)_48%,rgba(240,207,89,0.24)_100%)]" />

      <div className="relative grid h-full items-end gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3d86f]">{eyebrow}</p>
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h1>
          <p className="max-w-xl text-white/90 md:text-lg md:leading-relaxed">{description}</p>
        </div>
        <div className="hidden self-center justify-self-end md:block">
          <img src="/brand/mot-white-on-white.png" alt="Motley Terpz" className="h-auto w-[260px] opacity-90" />
        </div>
      </div>
    </section>
  );
}
