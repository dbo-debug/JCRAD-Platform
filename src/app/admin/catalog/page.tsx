import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

const CARDS = [
  {
    title: "Bulk Products",
    description: "Create and manage flower, concentrate, vape, and pre-roll product records.",
    href: "/admin/catalog/bulk",
  },
  {
    title: "Packaging",
    description: "Maintain packaging SKUs, compliance states, and unit-cost references.",
    href: "/admin/catalog/packaging",
  },
] as const;

export default function AdminCatalogPage() {
  return (
    <div>
      <AdminPageHeader
        title="Catalog"
        description="Manage bulk products and packaging SKUs."
      />

      <section className="grid gap-5 md:grid-cols-2">
        {CARDS.map((card) => (
          <div
            key={card.href}
            className="group rounded-xl border border-[var(--surface-border)] bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#14b8a6] hover:shadow-[0_12px_30px_-24px_rgba(16,24,40,0.45)]"
          >
            <h2 className="text-xl font-semibold text-[#173543]">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#5b7382]">{card.description}</p>
            <div className="mt-6">
              <Link
                href={card.href}
                className="inline-flex items-center rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
              >
                Manage
              </Link>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
