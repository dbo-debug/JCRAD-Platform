import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export default function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-white/5 bg-[#121821] text-white shadow-[0_8px_32px_rgba(0,0,0,0.25)]",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
