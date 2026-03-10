import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import Card from "@/components/ui/Card";
import PatternAccent from "@/components/marketing/PatternAccent";

export const metadata: Metadata = {
  title: "Compliance Approach",
  description:
    "Operator-facing compliance guidance from JC RAD Inc. covering packaging suitability, documentation expectations, order readiness, and practical launch planning.",
};

const COMPLIANCE_AREAS = [
  {
    title: "Packaging suitability",
    body: "Packaging format decisions are aligned early so production planning reflects realistic execution constraints.",
  },
  {
    title: "Documentation expectations",
    body: "Required documents are reviewed as part of onboarding and order preparation to reduce last-minute delays.",
  },
  {
    title: "Order readiness",
    body: "Order conversion is treated as a readiness checkpoint so teams move forward with clear compliance visibility.",
  },
  {
    title: "Retail-friendly simplicity",
    body: "Workflows prioritize practical, shelf-ready outcomes without unnecessary complexity in the launch path.",
  },
  {
    title: "Compliance-aware production planning",
    body: "Production assumptions are scoped with compliance in mind so launch plans remain disciplined and achievable.",
  },
] as const;

const COMMON_DOCS = [
  "Business license",
  "Seller's permit",
  "W-9",
  "IRS Form 8300 when applicable",
] as const;

export default function CompliancePage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Compliance"
        title="Compliance built into the workflow."
        description="JC RAD Inc. keeps packaging, documentation, and order expectations aligned early so operators can plan launches with fewer surprises."
        backgroundImage="/site-pics/compliance.jpg"
      />

      <PatternAccent />

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">What compliance means here</h2>
          <p className="max-w-3xl text-sm text-[#4a6575]">
            The goal is straightforward: keep packaging and launch workflows practical, documented, and ready for execution.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {COMPLIANCE_AREAS.map((item) => (
            <Card key={item.title} className="border border-[#dbe9ef] bg-white p-5 text-[#153447] shadow-sm">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-[#4a6575]">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#d3e8ea] bg-[#edf9f7] p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">What customers should expect</h2>
        <p className="mt-2 max-w-3xl text-sm text-[#4a6575]">
          Document requests can vary by order type and account profile, but these are common examples teams are typically asked to prepare:
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {COMMON_DOCS.map((item) => (
            <div key={item} className="rounded-xl border border-[#dbe9ef] bg-white px-4 py-3 text-sm font-medium text-[#234353]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Our approach</h2>
        <p className="mt-3 max-w-4xl text-sm text-[#4a6575]">
          Packaging should be simple. Compliance should be clean. Product quality should stay high while cost stays disciplined.
          That is the operating standard we apply when aligning menu selection, production planning, and order conversion.
        </p>
      </section>

      <section className="rounded-3xl border border-[#cde5e8] bg-[linear-gradient(180deg,#effaf9_0%,#e8f7fb_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#123646]">Need compliance guidance before moving forward?</h2>
            <p className="mt-2 text-sm text-[#446172]">
              Start with account access, review available categories, and connect with our team for planning support.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Create Account
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              Contact
            </Link>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center rounded-full border border-[#bcdce0] bg-white px-5 py-3 text-sm font-semibold text-[#1f4251]"
            >
              View Menu
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
