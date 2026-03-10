import Link from "next/link";
import ProductCard from "@/components/menu/ProductCard";
import { type ProductCardItem } from "@/components/menu/types";

type ProductGridProps = {
  items: ProductCardItem[];
  onAdd: (offerId: string) => void;
  emptyMessage?: string;
};

export default function ProductGrid({ items, onAdd, emptyMessage }: ProductGridProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-[#dce6eb] bg-white p-8 text-center text-sm text-[#58707f] shadow-[0_14px_26px_-22px_rgba(16,24,40,0.42)]">
        {emptyMessage || "No products match your current view."}
        <div className="mt-4">
          <Link
            href="/portal/onboarding"
            className="inline-flex rounded-full border border-[#cfdde5] px-3 py-1.5 text-xs font-semibold text-[#2f4a59] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Request sourcing help
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} onAdd={() => onAdd(item.id)} />
      ))}
    </div>
  );
}
