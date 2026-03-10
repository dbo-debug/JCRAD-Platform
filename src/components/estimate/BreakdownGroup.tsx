import Money from "@/components/estimate/Money";
import { ceilDisplayCent, perUnitComponent } from "@/components/estimate/utils";
import type { BreakdownGroupData, EstimateLine } from "@/components/estimate/types";

type BreakdownGroupProps = {
  title: string;
  line: EstimateLine;
  unitLabel: string;
  group: BreakdownGroupData;
};

export default function BreakdownGroup({ title, line, unitLabel, group }: BreakdownGroupProps) {
  return (
    <section className="rounded-2xl border border-[#dbe6ed] bg-[#fbfdfe] p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5b7382]">{title}</div>
      <div className="space-y-2">
        {group.rows.map((row) => (
          <div key={row.id} className="flex items-start justify-between gap-3 text-sm text-[#324a59]">
            <span>{row.label}</span>
            <span className="text-right">
              <Money value={row.total} className="font-semibold text-[#1f3746]" />
              <span className="ml-1 text-xs text-[#6c8494]">
                (<Money value={ceilDisplayCent(perUnitComponent(row.total, line))} />/{unitLabel})
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-[#dbe6ed] pt-2 text-sm font-semibold text-[#16384a]">
        <div className="flex items-center justify-between">
          <span>{title} Subtotal</span>
          <span className="text-right">
            <Money value={group.subtotal} />
            <span className="ml-1 text-xs text-[#6c8494]">
              (<Money value={ceilDisplayCent(perUnitComponent(group.subtotal, line))} />/{unitLabel})
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
