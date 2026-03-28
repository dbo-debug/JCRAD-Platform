import type { ReactNode } from "react";

export function QueueStatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "warn" | "bad" | "neutral" | "ok";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#bde8e4] bg-[#e9fbf9] text-[#0f766e]"
      : tone === "bad"
        ? "border-[#f3d2d2] bg-[#fff4f4] text-[#991b1b]"
        : tone === "warn"
          ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
          : "border-[#d7e6ed] bg-[#f8fbfc] text-[#4f6877]";

  return <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}>{label}</span>;
}

export function QueueMetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-[#173543]">{value}</p>
    </div>
  );
}

export function QueueMetaCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2edf2] bg-[#f9fcfd] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a8290]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#173543]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[#5b7382]">{helper}</p> : null}
    </div>
  );
}

export function QueuePurposePanel({
  title = "Queue Purpose",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7891a0]">{title}</p>
      <div className="mt-1 text-sm text-[#5b7382]">{children}</div>
    </section>
  );
}
