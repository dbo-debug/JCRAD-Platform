import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import Card from "@/components/ui/Card";
import PatternAccent from "@/components/marketing/PatternAccent";

export const metadata: Metadata = {
  title: "Copack Manufacturing Services",
  description:
    "Copack services built for real dispensary products: prerolls, vape programs, concentrate packaging, and flower packout with practical launch execution.",
};

const SUPPORT_AREAS = [
  {
    title: "Pre-Roll Manufacturing",
    body: "Single gram prerolls, infused programs, and multi-pack formats designed for retail-ready sell-through and predictable replenishment.",
  },
  {
    title: "Vape Programs",
    body: "510 cartridge and all-in-one programs built around practical hardware selection, oil input planning, and finished-unit consistency.",
  },
  {
    title: "Concentrate Packaging",
    body: "Jarred rosin, sugar, diamonds, batter, and related packaged concentrate formats scoped for shelf-ready launch windows.",
  },
  {
    title: "Flower Packout",
    body: "Retail bagging programs for 1/8ths, quarters, 7g, and smalls-oriented value formats built for repeatable sell-through.",
  },
  {
    title: "House Brand Programs",
    body: "Low-friction, margin-aware product plans that help dispensaries build dependable house-brand assortments across core formats.",
  },
] as const;

const VALUE_PROPOSITION = [
  "Built for house-brand and margin-aware dispensary programs.",
  "Packaging kept simple, compliant, and launch-ready.",
  "Production planning designed around repeatable retail SKUs.",
] as const;

const WORKFLOW_STEPS = [
  {
    title: "1. Choose your product format",
    body: "Define which formats you are launching first: prerolls, vapes, concentrates, or flower packouts.",
  },
  {
    title: "2. Align packaging and compliance requirements",
    body: "Lock packaging format, labeling expectations, and documentation needs before production scheduling.",
  },
  {
    title: "3. Launch a repeatable retail-ready SKU",
    body: "Move into execution with realistic output assumptions designed for reliable reorder cycles.",
  },
] as const;

const PRODUCT_LAUNCHES = [
  {
    title: "Infused 1g Pre-Roll Program",
    points: ["Single gram format", "Infused workflow", "Retail tube or carton"],
  },
  {
    title: "1g AIO Vape Program",
    points: ["All-in-one hardware", "Distillate or liquid diamond input", "Shelf-ready finished unit"],
  },
  {
    title: "House Flower Bag Program",
    points: ["Indoor flower or smalls", "Simple mylar packaging", "Repeatable margin-conscious format"],
  },
] as const;

const OPERATOR_REASONS = [
  "Faster product launches",
  "Simple compliant packaging",
  "Margin-aware formats",
  "Production-ready workflows",
  "Repeatable house-brand support",
] as const;

export default function CopackPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="COPACK SERVICES"
        title="Copack built for real dispensary products."
        description="Pre-roll packs, vape hardware programs, packaged concentrates, and flower packouts designed for house brands and retail shelves."
        backgroundImage="/site-pics/copack.jpg"
      />

      <PatternAccent />

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-5 md:p-7">
        <div className="grid gap-3 md:grid-cols-3">
          {VALUE_PROPOSITION.map((point) => (
            <div key={point} className="rounded-xl border border-[#dbe9ef] bg-[#f5fbfd] px-4 py-3 text-sm font-medium text-[#26485a]">
              {point}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">What we support</h2>
          <p className="max-w-3xl text-sm text-[#4a6575]">
            Operational support across the formats most teams need to launch and restock consistently.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {SUPPORT_AREAS.map((item) => (
            <Card key={item.title} className="border border-[#dbe9ef] bg-white p-5 text-[#153447] shadow-sm">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">How copack moves from idea to shelf</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {WORKFLOW_STEPS.map((step) => (
            <Card key={step.title} className="border border-[#dbe9ef] bg-[#f8fcfd] p-5">
              <h3 className="text-base font-semibold text-[#173847]">{step.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[#dbe9ef] bg-[#102330]">
          <img
            src="/site-pics/copacking1.jpg"
            alt="Copack production at JC RAD Inc."
            className="h-full min-h-[280px] w-full object-cover opacity-85"
          />
        </div>
        <div className="rounded-2xl border border-[#dbe9ef] bg-white p-6 md:p-8">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Built for house brands</h2>
          <p className="mt-3 text-sm text-[#4a6575]">
            JC RAD Inc. helps dispensaries and operators launch practical house-brand products without unnecessary complexity.
            The focus stays on formats that move, packaging that clears review, and production plans that can be repeated.
          </p>
          <p className="mt-3 text-sm text-[#4a6575]">
            Teams use this model to build consistent margin contribution across prerolls, vapes, concentrates, and flower bag programs.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Typical product launches</h2>
          <p className="max-w-3xl text-sm text-[#4a6575]">
            Common programs teams scope when planning new shelves, refreshes, or house-brand expansion.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCT_LAUNCHES.map((launch) => (
            <Card key={launch.title} className="border border-[#dbe9ef] bg-white p-5">
              <h3 className="text-base font-semibold text-[#173847]">{launch.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#4a6575]">
                {launch.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#14b8a6]" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#d3e8ea] bg-[#edf9f7] p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Why operators use JC RAD Inc.</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {OPERATOR_REASONS.map((item) => (
            <div key={item} className="rounded-xl border border-[#dbe9ef] bg-white px-4 py-3 text-sm font-medium text-[#234353]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[#dbe9ef] bg-white p-6 md:p-7">
          <h2 className="text-2xl font-semibold text-[#13303f]">Scope your next product launch</h2>
          <p className="mt-2 text-sm text-[#4a6575]">
            Build a realistic production plan around format, packaging, and launch timing before committing capital.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/menu"
              className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              View Menu
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-[#cfe0e7] bg-white px-5 py-3 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
            >
              Create Account
            </Link>
            <Link
              href="/contact?intent=call"
              className="inline-flex items-center justify-center rounded-full border border-[#cfe0e7] bg-white px-5 py-3 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
            >
              Book a Call
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-[#dbe9ef] bg-[linear-gradient(180deg,#effaf9_0%,#e8f7fb_100%)] p-6 md:p-7">
          <h3 className="text-xl font-semibold text-[#123646]">Production-first execution</h3>
          <p className="mt-2 text-sm text-[#416273]">
            JC RAD Inc. is structured around practical launches: clear assumptions, disciplined packaging strategy, and formats built for reorder velocity.
          </p>
          <p className="mt-3 text-sm text-[#416273]">
            The result is a cleaner path from sourcing and planning to shelf-ready finished units.
          </p>
        </div>
      </section>
    </div>
  );
}
