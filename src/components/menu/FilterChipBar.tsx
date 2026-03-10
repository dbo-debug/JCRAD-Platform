type FilterChipGroup = {
  id: string;
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
};

type FilterChipBarProps = {
  groups: FilterChipGroup[];
  onClear: () => void;
};

export default function FilterChipBar({ groups, onClear }: FilterChipBarProps) {
  const activeCount = groups.reduce((count, group) => count + group.selected.length, 0);
  if (groups.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#dce6eb] bg-white p-3 shadow-[0_14px_24px_-24px_rgba(16,24,40,0.6)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.16em] text-[#6f8897]">Filters</div>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-[#cfdde5] px-2.5 py-1 text-[11px] font-semibold text-[#4e6877] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="space-y-1.5">
            <div className="text-xs text-[#5e7685]">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = group.selected.includes(option);
                return (
                  <button
                    key={`${group.id}-${option}`}
                    type="button"
                    onClick={() => group.onToggle(option)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      active
                        ? "border-[#14b8a6] bg-gradient-to-r from-[#14b8a6]/15 to-[#22c55e]/15 text-[#0f766e]"
                        : "border-[#d4e0e7] bg-[#fbfdfe] text-[#4e6674] hover:border-[#14b8a6]/60 hover:text-[#0f766e]",
                    ].join(" ")}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
