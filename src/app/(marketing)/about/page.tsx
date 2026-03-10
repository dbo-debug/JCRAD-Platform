import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import Card from "@/components/ui/Card";
import PatternAccent from "@/components/marketing/PatternAccent";

export const metadata: Metadata = {
  title: "About",
  description:
    "JC RAD Inc. company story: from vape manufacturing and extraction to distribution, house-brand specialization, and multi-SKU wholesale support for margin-focused operators.",
};

const MILESTONES = [
  {
    year: "2016",
    title: "Manufacturing foundation",
    body: "Started in cannabis operations with vape manufacturing and ethanol extraction.",
  },
  {
    year: "2018",
    title: "Distribution expansion",
    body: "Expanded into distribution to support broader channel access and reliable movement of product.",
  },
  {
    year: "JC RAD Inc. launch",
    title: "Bulk + retail focus",
    body: "Formally launched JC RAD Inc. with bulk flower supply and retail-ready product support.",
  },
  {
    year: "Specialization",
    title: "House-brand operator programs",
    body: "Became a specialist in affordable house-brand programs designed for dispensary economics.",
  },
  {
    year: "Today",
    title: "Trusted multi-SKU partner",
    body: "Supports operators with dependable multi-SKU supply built to improve margins and profitability.",
  },
] as const;

const PHILOSOPHY = [
  "Packaging should be simple and compliant.",
  "Product quality should stay high.",
  "Cost structure should stay disciplined.",
  "Retail profitability should improve with each launch cycle.",
] as const;

const WHY_OPERATORS_CHOOSE_US = [
  "House-brand support built for dispensary realities",
  "Affordable product strategy across key categories",
  "Margin improvement through practical format planning",
  "Dependable sourcing across repeatable SKU programs",
] as const;

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="About JC RAD Inc."
        title="Built from real cannabis operations."
        description="From manufacturing and extraction to distribution and house-brand program execution, JC RAD Inc. is built for operators who need practical, margin-aware supply decisions."
        backgroundImage="/site-pics/home-page-hero.jpg"
      />

      <PatternAccent />

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Milestones</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {MILESTONES.map((item) => (
            <Card key={`${item.year}-${item.title}`} className="border border-[#dbe9ef] bg-white p-5 text-[#153447] shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">{item.year}</p>
              <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#d3e8ea] bg-[#edf9f7] p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Operating philosophy</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {PHILOSOPHY.map((item) => (
            <div key={item} className="rounded-xl border border-[#dbe9ef] bg-white px-4 py-3 text-sm font-medium text-[#234353]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Why operators work with JC RAD Inc.</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {WHY_OPERATORS_CHOOSE_US.map((item) => (
            <div key={item} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3 text-sm font-medium text-[#234353]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#cde5e8] bg-[linear-gradient(180deg,#effaf9_0%,#e8f7fb_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#123646]">Explore the platform</h2>
            <p className="mt-2 text-sm text-[#446172]">
              Review current categories, create your account, and connect with the team to plan your next launch window.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/menu"
              className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              View Menu
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              Create Account
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              Contact
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
