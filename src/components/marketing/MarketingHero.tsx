import type { ReactNode } from "react";

type MarketingHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  imageSrc?: string;
  tall?: boolean;
  brandMarkSrc?: string;
};

export default function MarketingHero({
  eyebrow,
  title,
  subtitle,
  imageSrc,
  tall = false,
  brandMarkSrc,
}: MarketingHeroProps) {
  if (imageSrc) {
    return (
      <section
        className={[
          "relative overflow-hidden rounded-3xl border border-[#243644] bg-[#111a22] p-7 md:p-12",
          tall ? "min-h-[420px] md:min-h-[500px]" : "",
        ].join(" ")}
      >
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(12,22,29,0.9)_0%,rgba(12,22,29,0.68)_50%,rgba(20,184,166,0.28)_100%)]" />
        <div className="relative grid h-full items-end gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8be6df]">{eyebrow}</p>
            <h1 className="text-3xl font-semibold leading-tight text-white md:text-5xl">{title}</h1>
            <p className="max-w-xl text-white/90 md:text-lg md:leading-relaxed">{subtitle}</p>
          </div>
          {brandMarkSrc ? (
            <div className="hidden self-center justify-self-end md:block">
              <img src={brandMarkSrc} alt="JC RAD Inc." className="h-auto w-[260px] opacity-90" />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#dbe9ef] bg-white p-6 md:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold text-[#13303f] md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-[#4a6575]">{subtitle}</p>
    </section>
  );
}
