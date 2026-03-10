import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import Card from "@/components/ui/Card";
import PatternAccent from "@/components/marketing/PatternAccent";
import LaunchCalculatorPreview from "@/components/marketing/LaunchCalculatorPreview";

export const metadata: Metadata = {
  title: "Wholesale Copack Platform",
  description:
    "Launch and scale cannabis products with JC RAD Inc. wholesale supply, copack execution, and compliance-first operations.",
};

const CATEGORIES = [
  {
    label: "Flower",
    imageSrc: "/site-pics/premium.jpg",
    description: "Bulk indoor, deps, and category-driven sourcing.",
  },
  {
    label: "Pre-rolls",
    imageSrc: "/site-pics/prerolls.jpg",
    description: "Production-ready inputs for scalable packouts.",
  },
  {
    label: "Concentrates",
    imageSrc: "/site-pics/concentrates.jpg",
    description: "Flexible concentrate formats for branded launch plans.",
  },
  {
    label: "Vapes",
    imageSrc: "/site-pics/vape.jpg",
    description: "Hardware + oil workflow support for finished goods.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-10 md:space-y-14">
      <Hero
        eyebrow="California Wholesale + Copack"
        title="Production-ready cannabis supply and launch workflows."
        description="Wholesale flower, prerolls, vapes, and concentrates with integrated copack, compliance-first execution, and estimate-ready planning."
        backgroundImage="/site-pics/home-page-hero.jpg"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          Build Estimate
        </Link>
        <Link href="/contact?intent=call" className="text-sm font-semibold text-[#0f766e] underline underline-offset-4">
          Book a Call
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          "Transparent wholesale pricing",
          "Copack-ready workflows",
          "Compliance-first operations",
          "Built for California retail launches",
        ].map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-[#dbe9ef] bg-white px-4 py-3 text-sm font-semibold text-[#21404f] shadow-sm"
          >
            <div className="flex items-center justify-center gap-2 text-center">
              <span className="h-2 w-2 rounded-full bg-[#14b8a6]" />
              <span>{item}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Trusted by operators</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-[#233848] p-6 shadow-sm">
            <img
              src="/site-pics/premium.jpg"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,24,32,0.9)_0%,rgba(12,26,36,0.82)_55%,rgba(20,184,166,0.28)_100%)]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">Dustin Garnett</p>
                  <p className="text-sm text-white/80">High 90&apos;s</p>
                </div>
                <img
                  src="/high%2090%27s.png"
                  alt="High 90's"
                  className="h-14 w-auto object-contain opacity-95"
                />
              </div>
              <p className="mt-4 text-base text-white/95">
                &ldquo;JC RAD Inc. is one of the best in the business!&rdquo;
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[#233848] p-6 shadow-sm">
            <img
              src="/site-pics/compliance.jpg"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,24,32,0.92)_0%,rgba(12,26,36,0.84)_52%,rgba(20,184,166,0.24)_100%)]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">Ryan Cron</p>
                  <p className="text-sm text-white/80">Pabst / St Ides</p>
                </div>
                <img
                  src="/st%20ides.jpeg"
                  alt="St Ides"
                  className="h-14 w-auto rounded-sm object-contain opacity-95"
                />
              </div>
              <p className="mt-4 text-base text-white/95">
                &ldquo;JC RAD has been an invaluable supply chain partner from the beginning&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      <PatternAccent />

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Product Formats</h2>
          <p className="text-sm text-[#4a6575]">Source and configure the formats you need for retail launch.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <Link key={category.label} href="/menu" className="group">
              <Card className="relative overflow-hidden rounded-2xl border border-[#dbe9ef] bg-white p-0 text-white transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <img src={category.imageSrc} alt={category.label} className="h-48 w-full object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,24,0.06)_0%,rgba(7,17,24,0.72)_68%,rgba(7,17,24,0.86)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="text-lg font-semibold">{category.label}</h3>
                  <p className="mt-1 text-sm text-white/85">{category.description}</p>
                  <p className="mt-3 text-sm font-semibold text-[#8be6df]">View in Menu</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Plan production before you commit.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "1. Browse live menu pricing",
              body: "Review current category availability and pricing context before committing to volume.",
            },
            {
              title: "2. Build a production estimate",
              body: "Model format, packaging, and run assumptions with estimate-ready product options.",
            },
            {
              title: "3. Move into copack + compliance workflow",
              body: "Align packaging and documentation checkpoints early so launch planning stays realistic.",
            },
          ].map((item) => (
            <Card key={item.title} className="rounded-2xl border border-[#dbe9ef] bg-white p-5 text-[#153447] shadow-sm">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#d3e8ea] bg-[#edf9f7] p-6 shadow-[0_14px_30px_-24px_rgba(16,24,40,0.35)] md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f]">One partner for supply and production</h2>
        <p className="mt-2 max-w-4xl text-sm text-[#4a6575]">
          From source material to packaging-ready formats, JC RAD Inc. helps operators move from buying decisions to launch planning with fewer handoff points.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            "Wholesale flower sourcing",
            "Pre-roll packout planning",
            "Concentrate packaging workflows",
            "Vape-ready production inputs",
            "White-label launch support",
            "Packaging-aware estimating",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3 text-sm font-medium text-[#234353]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Live menu visibility</h2>
          <p className="text-sm text-[#4a6575]">
            Use the public menu to review current categories, pricing context, and estimate-ready product options.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Indoor Premium Flower",
              body: "Estimate-ready configuration",
            },
            {
              title: "Pre-roll Supply Input",
              body: "Packaging-aware planning",
            },
            {
              title: "Vape Launch Input",
              body: "Menu-driven pricing visibility",
            },
          ].map((item) => (
            <Card key={item.title} className="rounded-2xl border border-[#dbe9ef] bg-white p-5 text-[#153447] shadow-sm">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{item.body}</p>
            </Card>
          ))}
        </div>
        <div>
          <Link
            href="/menu"
            className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Open Menu
          </Link>
        </div>
      </section>

      <LaunchCalculatorPreview />

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Build launch estimates in minutes</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Choose product format",
            "Add packaging assumptions",
            "Review production cost structure",
            "Export a professional estimate",
          ].map((item) => (
            <Card key={item} className="rounded-xl border border-[#dbe9ef] bg-white p-4 text-sm font-medium text-[#234353] shadow-sm">
              {item}
            </Card>
          ))}
        </div>
        <div>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full border border-[#cfe0e7] bg-white px-5 py-3 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Start Estimate
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6">
        <h2 className="text-2xl font-semibold text-[#13303f]">Compliance-first execution</h2>
        <p className="mt-2 text-sm text-[#4a6575]">
          Packaging review, production planning, and documentation expectations are considered early so launch plans stay realistic.
        </p>
      </section>

      <section className="rounded-3xl border border-[#cde5e8] bg-[linear-gradient(180deg,#effaf9_0%,#e8f7fb_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#123646]">Ready to plan your next product launch?</h2>
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
              Build Estimate
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
