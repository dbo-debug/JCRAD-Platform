"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

type Intent = "samples" | "call" | "compliance" | "general";

function getIntentLabel(intent: Intent): string {
  if (intent === "samples") return "Request Samples";
  if (intent === "call") return "Book a Call";
  if (intent === "compliance") return "Compliance Guidance";
  return "General Inquiry";
}

function parseIntent(value: string | null): Intent {
  const intent = String(value || "").trim().toLowerCase();
  if (intent === "samples" || intent === "call" || intent === "compliance") return intent;
  return "general";
}

export default function ContactForm() {
  const searchParams = useSearchParams();
  const initialIntent = parseIntent(searchParams.get("intent"));

  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="border border-[#cfe5e8] bg-[#eefaf9] p-6 text-[#153447]">
        <h2 className="text-xl font-semibold text-[#0f766e]">Thanks, we received your request.</h2>
        <p className="mt-2 text-sm text-[#3f6274]">Our team will follow up shortly to continue your {getIntentLabel(intent).toLowerCase()} request.</p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 inline-flex rounded-full border border-[#b8dce0] px-4 py-2 text-sm font-semibold text-[#184051]"
        >
          Submit Another Request
        </button>
      </Card>
    );
  }

  return (
    <Card className="border border-[#dbe9ef] bg-white p-6 text-[#153447]">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#274555]">Inquiry Type</label>
          <select
            value={intent}
            onChange={(event) => setIntent(parseIntent(event.target.value))}
            className="w-full rounded-md border border-[#d0dee6] bg-white px-3 py-2.5 text-sm text-[#173543]"
          >
            <option value="general">General Inquiry</option>
            <option value="samples">Request Samples</option>
            <option value="call">Book a Call</option>
            <option value="compliance">Compliance Guidance</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#274555]">Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} required className="border-[#d0dee6] bg-white text-[#173543] placeholder:text-[#7a92a0] focus-visible:ring-[#14b8a6] focus-visible:ring-offset-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#274555]">Company</label>
            <Input value={company} onChange={(event) => setCompany(event.target.value)} required className="border-[#d0dee6] bg-white text-[#173543] placeholder:text-[#7a92a0] focus-visible:ring-[#14b8a6] focus-visible:ring-offset-white" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#274555]">Email</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="border-[#d0dee6] bg-white text-[#173543] placeholder:text-[#7a92a0] focus-visible:ring-[#14b8a6] focus-visible:ring-offset-white" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#274555]">Message</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            required
            className="w-full rounded-md border border-[#d0dee6] bg-white px-3 py-2.5 text-sm text-[#173543] placeholder:text-[#7a92a0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14b8a6]"
            placeholder="Tell us your category, timeline, and goals."
          />
        </div>

        <Button type="submit" className="rounded-full bg-[#14b8a6] text-white hover:bg-[#14b8a6]">
          Send Request
        </Button>
      </form>
    </Card>
  );
}
