import type { Metadata } from "next";
import Hero from "@/components/Hero";
import Card from "@/components/ui/Card";
import PatternAccent from "@/components/marketing/PatternAccent";
import ContactForm from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Connect with JC RAD Inc. for samples, production planning, wholesale sourcing, and compliance workflow guidance.",
};

export default function ContactPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Contact"
        title="Let’s scope your next launch."
        description="Share your category goals, packaging direction, and timeline. JC RAD Inc. will reply with practical next steps for sourcing, copack, and launch planning."
        backgroundImage="/site-pics/copack.jpg"
      />

      <PatternAccent />

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Project intake</h2>
        <p className="max-w-3xl text-sm text-[#4a6575]">
          Use this form to start a wholesale, copack, or compliance conversation. The more specific your inputs, the faster we can provide a useful response.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <ContactForm />

          <Card className="border border-[#dbe9ef] bg-[#f9fcfd] p-5 text-[#234353]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0f766e]">Response expectation</h3>
            <p className="mt-2 text-sm text-[#4a6575]">
              Initial responses focus on feasibility, required inputs, and the most practical next action for your team.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border border-[#dbe9ef] bg-white p-6 text-[#153447] shadow-sm">
            <h2 className="text-lg font-semibold text-[#13303f]">What to include</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#4a6575]">
              <li>Product categories and preferred formats</li>
              <li>Target launch window and estimated volume</li>
              <li>Packaging direction and any known constraints</li>
              <li>Distribution goals or house-brand priorities</li>
            </ul>
          </Card>

          <Card className="border border-[#d3e8ea] bg-[#edf9f7] p-6 text-[#234353]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0f766e]">Helpful prep checklist</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#3f6274]">
              <li>Decide top 1-2 launch categories first</li>
              <li>Estimate realistic first-run unit counts</li>
              <li>Confirm whether packaging is fixed or flexible</li>
              <li>Flag any hard launch deadlines up front</li>
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}
