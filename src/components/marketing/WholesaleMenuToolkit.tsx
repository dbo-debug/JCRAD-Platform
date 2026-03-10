"use client";

import { FormEvent, useMemo, useState } from "react";

type WholesaleMenuItem = {
  category: string;
  subcategory: string;
  name: string;
  qty: string;
  price: string;
};

type WholesaleMenuToolkitProps = {
  items: WholesaleMenuItem[];
};

function toCategoryOrder(category: string): number {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "flower") return 0;
  if (normalized === "pre-roll") return 1;
  if (normalized === "concentrate") return 2;
  if (normalized === "vape") return 3;
  return 9;
}

function buildCopyText(category: string, items: WholesaleMenuItem[], includeSignature = true): string {
  const grouped = new Map<string, WholesaleMenuItem[]>();
  for (const item of items) {
    const key = String(item.subcategory || "GENERAL").trim().toUpperCase() || "GENERAL";
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  }

  const lines: string[] = [category.toUpperCase()];
  for (const [subcategory, subItems] of grouped.entries()) {
    lines.push(subcategory);
    for (const item of subItems) {
      lines.push(`${item.qty} - ${item.name} - ${item.price}`);
    }
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  if (includeSignature) {
    lines.push("");
    lines.push("Call JC RAD Inc. at 323-612-6064");
  }
  return lines.join("\n");
}

export default function WholesaleMenuToolkit({ items }: WholesaleMenuToolkitProps) {
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");

  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, WholesaleMenuItem[]>();
    for (const item of items) {
      const key = String(item.category || "").trim() || "General";
      const list = grouped.get(key) || [];
      list.push(item);
      grouped.set(key, list);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => toCategoryOrder(a[0]) - toCategoryOrder(b[0]))
      .map(([category, groupedItems]) => ({ category, items: groupedItems }));
  }, [items]);

  const allSectionsText = useMemo(() => {
    const blocks = categoryGroups.map((group) => buildCopyText(group.category, group.items, false));
    return `${blocks.join("\n\n")}\n\nCall JC RAD Inc. at 323-612-6064`;
  }, [categoryGroups]);

  async function onCopySection(category: string, sectionItems: WholesaleMenuItem[]) {
    const text = buildCopyText(category, sectionItems);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus((prev) => ({ ...prev, [category]: "Copied" }));
    } catch {
      setCopyStatus((prev) => ({ ...prev, [category]: "Copy failed" }));
    }
  }

  async function onCopyAll() {
    try {
      await navigator.clipboard.writeText(allSectionsText);
      setCopyStatus((prev) => ({ ...prev, all: "Copied" }));
    } catch {
      setCopyStatus((prev) => ({ ...prev, all: "Copy failed" }));
    }
  }

  function onSubmitSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setSmsMessage("Enter a phone number to request updates.");
      return;
    }
    if (!consent) {
      setSmsMessage("Consent is required before requesting text updates.");
      return;
    }
    setSmsMessage("SMS delivery is not connected yet. This form is ready for backend integration.");
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Category menu breakdown</h2>
          <button
            type="button"
            onClick={onCopyAll}
            className="inline-flex items-center justify-center rounded-full border border-[#cfe0e7] bg-white px-4 py-2 text-sm font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Copy Full Menu
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {categoryGroups.map((section) => (
            <div key={section.category} className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[#153447]">{section.category}</h3>
                <button
                  type="button"
                  onClick={() => onCopySection(section.category, section.items)}
                  className="inline-flex items-center justify-center rounded-full border border-[#cfe0e7] bg-white px-3 py-1.5 text-xs font-semibold text-[#2b4756] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
                >
                  {`Copy ${section.category} Menu`}
                </button>
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[#e0eaef] bg-[#f9fcfd] p-3 text-sm leading-relaxed text-[#2f4958]">
                {buildCopyText(section.category, section.items)}
              </pre>
              {copyStatus[section.category] ? (
                <p className="mt-2 text-xs font-semibold text-[#0f766e]">{copyStatus[section.category]}</p>
              ) : null}
            </div>
          ))}
        </div>
        {copyStatus.all ? <p className="text-xs font-semibold text-[#0f766e]">{copyStatus.all}</p> : null}
      </section>

      <section className="rounded-3xl border border-[#d3e8ea] bg-[#edf9f7] p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-[#13303f] md:text-3xl">Text me the menu</h2>
        <p className="mt-2 max-w-3xl text-sm text-[#4a6575]">
          Enter your phone number to request wholesale menu updates by text.
        </p>
        <form onSubmit={onSubmitSms} className="mt-5 space-y-4">
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(555) 123-4567"
            className="w-full rounded-lg border border-[#c9d7e2] bg-white px-4 py-3 text-[#1f2d3a] placeholder:text-[#8aa0ae] transition-colors focus:border-[#14b8a6] focus:outline-none"
          />
          <label className="flex items-start gap-3 text-sm text-[#3f5f6e]">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#bdd3dd] text-[#14b8a6] focus:ring-[#14b8a6]"
            />
            <span>
              By submitting your phone number, you agree to receive menu updates and marketing text messages from JC RAD
              Inc. Message/data rates may apply.
            </span>
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-[#14b8a6] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Send Menu by Text
          </button>
        </form>
        {smsMessage ? <p className="mt-3 text-sm font-medium text-[#0f766e]">{smsMessage}</p> : null}
      </section>
    </div>
  );
}
