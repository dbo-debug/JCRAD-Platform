import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={[
        "w-full rounded-lg border border-[#c9d7e2] bg-white px-4 py-3 text-sm text-[#1f2d3a] placeholder:text-[#8aa0ae] transition-colors",
        "focus:border-[#14b8a6] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
