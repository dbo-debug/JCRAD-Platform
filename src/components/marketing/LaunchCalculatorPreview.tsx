import Link from "next/link";

const ASSUMPTIONS = [
  { label: "Product format", value: "Pre-rolls" },
  { label: "Material input", value: "5 lb indoor flower" },
  { label: "Unit size", value: "1g" },
  { label: "Packaging format", value: "JC RAD tube" },
  { label: "Target units", value: "2,250" },
] as const;

const OUTPUT_ROWS = [
  { label: "Estimated output", value: "2,086-2,267 units" },
  { label: "Packaging-ready estimate", value: "$8,295.52" },
  { label: "Stickers", value: "3 per unit included" },
  { label: "Workflow note", value: "Compliance workflow required before order" },
] as const;

export default function LaunchCalculatorPreview() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Preview your launch economics</h2>
        <p className="max-w-3xl text-sm text-[#4a6575]">
          Model product format, packaging assumptions, and estimated output before moving into production planning.
        </p>
      </div>

      <div className="rounded-3xl border border-[#dbe9ef] bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#c8e3e2] bg-[#ecfbf9] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
            Preview Only
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d7e6ed] bg-[#f8fcfe] px-3 py-1 text-xs font-semibold text-[#2f4f5f]">
            Copack
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d7e6ed] bg-[#f8fcfe] px-3 py-1 text-xs font-semibold text-[#2f4f5f]">
            Pre-roll
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d7e6ed] bg-[#f8fcfe] px-3 py-1 text-xs font-semibold text-[#2f4f5f]">
            Packaging-aware
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#dbe9ef] bg-[#f9fcfd] p-4 md:p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0f766e]">Assumptions</h3>
            <div className="mt-3 space-y-2">
              {ASSUMPTIONS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-[#dbe9ef] bg-white px-3 py-2"
                >
                  <span className="text-xs font-medium text-[#4a6575]">{item.label}</span>
                  <span className="text-sm font-semibold text-[#173543]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#cfe4e8] bg-[linear-gradient(180deg,#f7fcfd_0%,#edf9f7_100%)] p-4 md:p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0f766e]">Production summary</h3>
            <div className="mt-3 space-y-2">
              {OUTPUT_ROWS.map((item) => (
                <div key={item.label} className="rounded-xl border border-[#dbe9ef] bg-white px-3 py-2">
                  <p className="text-xs font-medium text-[#4a6575]">{item.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#153447]">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#5a7685]">
              Final numbers depend on category, material, packaging, and production assumptions.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Build Your Estimate
          </Link>
          <Link href="/menu" className="text-sm font-semibold text-[#0f766e] underline underline-offset-4">
            View Menu First
          </Link>
        </div>
      </div>
    </section>
  );
}
