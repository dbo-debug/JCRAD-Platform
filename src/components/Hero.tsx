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
    <section className="relative min-h-[420px] overflow-hidden rounded-3xl border border-[#163e52] bg-[#123245] p-7 shadow-[0_28px_48px_-34px_rgba(15,42,53,0.72)] md:min-h-[500px] md:p-12">
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-45"
      />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(11,35,47,0.94)_0%,rgba(17,58,78,0.8)_52%,rgba(46,187,163,0.24)_100%)]" />

      <div className="relative grid h-full items-end gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8be6df]">{eyebrow}</p>
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h1>
          <p className="max-w-xl text-white/90 md:text-lg md:leading-relaxed">{description}</p>
        </div>
        <div className="hidden self-center justify-self-end md:block">
          <img src="/brand/WHITE.png" alt="JC RAD Inc." className="h-auto w-[320px]" />
        </div>
      </div>
    </section>
  );
}
