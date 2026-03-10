import { type ChangeEvent, type ReactNode } from "react";
import CategoryRail from "@/components/menu/CategoryRail";
import { type MenuCategory, type MenuMode } from "@/components/menu/types";

type CategoryOption = {
  value: MenuCategory;
  label: string;
};

type MenuLayoutProps = {
  branding: ReactNode;
  valueStrip?: ReactNode;
  headerActions?: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  mode: MenuMode;
  onModeChange: (value: MenuMode) => void;
  onOpenCart: () => void;
  cartCount: number;
  categories: CategoryOption[];
  selectedCategory: MenuCategory;
  onSelectCategory: (value: MenuCategory) => void;
  main: ReactNode;
  cartPanel: ReactNode;
  mobileCartOpen: boolean;
  onCloseMobileCart: () => void;
};

export default function MenuLayout({
  branding,
  valueStrip,
  headerActions,
  searchValue,
  onSearchChange,
  mode,
  onModeChange,
  onOpenCart,
  cartCount,
  categories,
  selectedCategory,
  onSelectCategory,
  main,
  cartPanel,
  mobileCartOpen,
  onCloseMobileCart,
}: MenuLayoutProps) {
  function handleSearch(event: ChangeEvent<HTMLInputElement>) {
    onSearchChange(event.target.value);
  }

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-8 pt-4 md:px-6">
        <header className="mb-2.5 rounded-2xl border border-[#e4eaee] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfc_100%)] p-3 shadow-[0_14px_34px_-26px_rgba(16,24,40,0.28)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1">{branding}</div>
            <label className="min-w-56 flex-[1.2]">
              <input
                value={searchValue}
                onChange={handleSearch}
                placeholder="Search flower, concentrate, vape..."
                className="w-full rounded-full border border-[#d7e1e8] bg-[#fbfdfe] px-4 py-2 text-sm text-[#1f2937] placeholder:text-[#8ba1af] focus:border-[#14b8a6] focus:outline-none"
              />
            </label>
            <div className="inline-flex rounded-full border border-[#d3dde4] bg-[#f7fafb] p-1 text-xs">
              <button
                type="button"
                onClick={() => onModeChange("bulk")}
                className={[
                  "rounded-full px-3 py-1.5 font-semibold transition",
                  mode === "bulk" ? "bg-[#14b8a6] text-white" : "text-[#4e6473] hover:text-[#21313c]",
                ].join(" ")}
              >
                Bulk
              </button>
              <button
                type="button"
                onClick={() => onModeChange("copack")}
                className={[
                  "rounded-full px-3 py-1.5 font-semibold transition",
                  mode === "copack" ? "bg-[#22c55e] text-white" : "text-[#4e6473] hover:text-[#21313c]",
                ].join(" ")}
              >
                Copack
              </button>
            </div>
            {headerActions ? <div className="hidden md:block md:ml-auto">{headerActions}</div> : null}
            <button
              type="button"
              onClick={onOpenCart}
              className="rounded-full border border-[#d3dde4] bg-[#f7fafb] px-3 py-2 text-sm font-semibold text-[#1f2937] transition hover:border-[#14b8a6] lg:hidden"
            >
              Estimate Cart ({cartCount})
            </button>
          </div>
          {valueStrip ? (
            <div className="mt-3 rounded-full border border-[#d4e3e3] bg-[#eef7f6] px-4 py-1.5 text-center text-xs font-medium tracking-[0.08em] text-[#0f766e]">
              {valueStrip}
            </div>
          ) : null}
        </header>

        <div className="mb-3 rounded-2xl border border-[#e2ebf0] bg-[repeating-linear-gradient(135deg,#ffffff_0px,#ffffff_18px,#f6f9fb_18px,#f6f9fb_36px)] px-2 py-2 md:px-3 md:py-2 shadow-[0_14px_30px_-26px_rgba(16,24,40,0.4)]">
          <CategoryRail categories={categories} selected={selectedCategory} onSelect={onSelectCategory} mobile />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <main>{main}</main>

          <div className="hidden lg:block lg:pl-1">
            <div className="sticky top-4">{cartPanel}</div>
          </div>
        </div>
      </div>

      {mobileCartOpen ? (
        <div className="fixed inset-0 z-50 bg-black/20 p-3 lg:hidden" onClick={onCloseMobileCart}>
          <div className="ml-auto h-full w-full max-w-md overflow-auto rounded-2xl border border-[#dce6eb] bg-white p-3 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2d3d4a]">Estimate Cart</h2>
              <button
                type="button"
                onClick={onCloseMobileCart}
                className="rounded-full border border-[#d3dde4] px-2 py-1 text-xs text-[#5c7280]"
              >
                Close
              </button>
            </div>
            {cartPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
