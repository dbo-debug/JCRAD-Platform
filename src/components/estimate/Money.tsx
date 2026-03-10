import { fmtUsd } from "@/components/estimate/utils";

type MoneyProps = {
  value: unknown;
  className?: string;
};

export default function Money({ value, className }: MoneyProps) {
  return <span className={className}>{fmtUsd(value)}</span>;
}
