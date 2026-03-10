import BreakdownColumn from "@/components/estimate/BreakdownColumn";
import Money from "@/components/estimate/Money";
import type { EstimateLine } from "@/components/estimate/types";
import {
  buildBreakdownGroups,
  ceilDisplayCent,
  lineDetailsText,
  lineTags,
  lineTitle,
  money,
  perUnitTotal,
  quantityDisplay,
} from "@/components/estimate/utils";

type EstimateLineCardProps = {
  line: EstimateLine;
  lineKey: string;
  expanded: boolean;
  onToggle?: () => void;
  busy?: boolean;
  onRemove?: (lineId: string) => void;
  className?: string;
};

export default function EstimateLineCard({
  line,
  lineKey,
  expanded,
  onToggle,
  busy = false,
  onRemove,
  className = "",
}: EstimateLineCardProps) {
  const lineTotal = money(line?.line_sell_total ?? line?.line_total);
  const perUnit = perUnitTotal(line);
  const groups = buildBreakdownGroups(line);
  const tags = lineTags(line);

  return (
    <article
      className={`estimate-break-avoid estimate-card rounded-2xl border border-[#dbe6ed] bg-white px-3 py-2.5 shadow-[0_14px_24px_-24px_rgba(16,24,40,0.45)] ${className}`}
      data-line-key={lineKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[15px] font-semibold leading-5 text-[#173547]">{lineTitle(line)}</div>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={`${lineKey}-${tag}`}
                className="rounded-full border border-[#bfe5e0] bg-[#ecfbf8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#0f766e]"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="text-[11px] leading-4 text-[#627d8d]">{lineDetailsText(line) || " "}</div>
        </div>

        <div className="w-full max-w-[360px] rounded-xl border border-[#d4e2ea] bg-[#f8fcfb] px-2.5 py-2 sm:w-auto sm:min-w-[320px]">
          <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.08em] text-[#5a7484]">
            <span>Qty</span>
            <span className="text-right">Per Unit</span>
            <span className="text-right">Line Total</span>
          </div>
          <div className="mt-0.5 grid grid-cols-3 gap-2 text-[12px] text-[#153446] [font-variant-numeric:tabular-nums]">
            <span className="font-semibold">{quantityDisplay(line)}</span>
            <span className="text-right font-semibold"><Money value={ceilDisplayCent(perUnit.value)} />/{perUnit.label}</span>
            <span className="text-right text-[14px] font-bold"><Money value={lineTotal} /></span>
          </div>
        </div>
      </div>

      <div className="no-print mt-2 flex items-center justify-between gap-2 border-t border-[#e3ecf1] pt-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-[#cfe0e8] px-2.5 py-1 text-[11px] font-semibold text-[#2f4a59] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
        >
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(String(line?.id || ""))}
            disabled={busy}
            className="rounded-full border border-[#d9c5c5] px-2.5 py-1 text-[11px] font-semibold text-[#8a2c2c] transition hover:border-[#8a2c2c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className={[
          "line-breakdown mt-2 border-t border-[#e3ecf1] pt-2",
          expanded ? "block" : "hidden print:block",
          "space-y-2",
        ].join(" ")}>
          {groups.map((group) => (
            <BreakdownColumn
              key={`${lineKey}-${group.id}`}
              title={group.title}
              line={line}
              unitLabel={perUnit.label}
              group={group}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
