import Money from "@/components/estimate/Money";
import type { BreakdownGroupData, EstimateLine } from "@/components/estimate/types";
import { ceilDisplayCent, perUnitComponent } from "@/components/estimate/utils";

type BreakdownColumnProps = {
  title: string;
  line: EstimateLine;
  unitLabel: string;
  group: BreakdownGroupData;
};

export default function BreakdownColumn({ title, line, unitLabel, group }: BreakdownColumnProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#dbe6ed] bg-[#fbfdfe]">
      <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5c7787]">
        {title}
      </div>
      <div className="divide-y divide-[#e6eef3]">
        {group.rows.map((row, index) => (
          <div
            key={row.id}
            className={[
              "grid grid-cols-[1fr_auto] items-start gap-2 px-2.5 py-1.5 text-[11px] leading-4 text-[#324a59]",
              index % 2 === 1 ? "bg-[#f8fbfd]" : "bg-transparent",
            ].join(" ")}
          >
            <span>{row.label}</span>
            <span className="text-right [font-variant-numeric:tabular-nums]">
              <Money value={row.total} className="font-medium text-[#19384a]" />
              <span className="ml-1 text-[10px] text-[#6b8494]">
                (<Money value={ceilDisplayCent(perUnitComponent(row.total, line))} />/{unitLabel})
              </span>
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 bg-[#eef7f6] px-2.5 py-1.5 text-[11px] font-bold text-[#15384a]">
          <span>{title} Subtotal</span>
          <span className="text-right [font-variant-numeric:tabular-nums]">
            <Money value={group.subtotal} />
            <span className="ml-1 text-[10px] font-medium text-[#6b8494]">
              (<Money value={ceilDisplayCent(perUnitComponent(group.subtotal, line))} />/{unitLabel})
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
