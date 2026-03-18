import Link from "next/link";

const ACTIONS = [
  {
    title: "View Menu",
    description: "See current wholesale inventory, categories, and ready-to-price products.",
    href: "/menu",
    accent: "from-[#14b8a6] to-[#0f766e]",
  },
  {
    title: "Build Estimate",
    description: "Start an estimate cart fast and send over what you need priced.",
    href: "/estimate",
    accent: "from-[#f59e0b] to-[#d97706]",
  },
  {
    title: "Request Samples",
    description: "Reach out with your launch needs, target formats, or sample requests.",
    href: "/contact",
    accent: "from-[#3b82f6] to-[#1d4ed8]",
  },
];

export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="overflow-hidden rounded-[36px] border border-[#d8e6ed] bg-[linear-gradient(145deg,#ffffff_0%,#f2fbfb_48%,#f8fbff_100%)] shadow-[0_24px_60px_rgba(16,42,67,0.08)]">
        <div className="border-b border-[#d7e6ed] px-5 py-8 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">JC RAD Start</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#173543] sm:text-4xl">One link for menu, estimates, and fast follow-up.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5b7382] sm:text-base">
            If we just met at Hall of Flowers, start here. You can review the live menu, build an estimate, or send over what you need and we&apos;ll get back to you quickly.
          </p>
        </div>

        <div className="grid gap-4 p-5 sm:p-8">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-[28px] border border-[#d7e6ed] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b7d6de] hover:shadow-[0_18px_40px_rgba(16,42,67,0.08)]"
            >
              <div className={`inline-flex rounded-full bg-gradient-to-r ${action.accent} px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white`}>
                Quick Access
              </div>
              <h2 className="mt-4 text-xl font-semibold text-[#173543]">{action.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5b7382]">{action.description}</p>
              <p className="mt-4 text-sm font-semibold text-[#0f766e] transition group-hover:text-[#0b5d56]">Open {action.title}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
