import { type MenuCategory } from "@/components/menu/types";

type CategoryOption = {
  value: MenuCategory;
  label: string;
};

type CategoryRailProps = {
  categories: CategoryOption[];
  selected: MenuCategory;
  onSelect: (value: MenuCategory) => void;
  mobile?: boolean;
};

export default function CategoryRail({ categories, selected, onSelect, mobile = false }: CategoryRailProps) {
  if (mobile) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((entry) => {
          const active = entry.value === selected;
          return (
            <button
              key={entry.value}
              type="button"
              onClick={() => onSelect(entry.value)}
              className={[
                "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition",
                active
                  ? "border-[#14b8a6] bg-[#14b8a6]/12 text-[#0f766e]"
                  : "border-[#cbd9e2] bg-[#f9fcfd] text-[#3f5867] hover:border-[#14b8a6]/60 hover:text-[#0f766e]",
              ].join(" ")}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="space-y-2 rounded-2xl border border-[#dce6eb] bg-white p-3 shadow-[0_16px_28px_-24px_rgba(16,24,40,0.45)]">
      <div className="px-2 pb-1 text-xs uppercase tracking-[0.16em] text-[#748b99]">Categories</div>
      {categories.map((entry) => {
        const active = entry.value === selected;
        return (
          <button
            key={entry.value}
            type="button"
            onClick={() => onSelect(entry.value)}
            className={[
              "w-full rounded-xl px-4 py-2 text-left text-sm font-medium transition",
              active
                ? "border border-[#14b8a6] bg-gradient-to-r from-[#14b8a6]/10 to-[#14b8a6]/5 text-[#0f766e]"
                : "border border-[#d2dee6] bg-[#f8fbfc] text-[#3f5867] hover:border-[#c4d3dc] hover:text-[#22333f]",
            ].join(" ")}
          >
            {entry.label}
          </button>
        );
      })}
    </nav>
  );
}
