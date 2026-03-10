import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

function variantClass(variant: ButtonVariant): string {
  if (variant === "secondary") {
    return "bg-[#121821] text-white border border-white/10 hover:border-[#43E08B]/50";
  }
  if (variant === "ghost") {
    return "bg-transparent text-[#43E08B] border border-[#43E08B]/40 hover:border-[#43E08B]";
  }
  return "bg-[#43E08B] text-[#0B0F14] border border-[#43E08B] hover:bg-[#54e99a]";
}

export default function Button({
  children,
  className = "",
  variant = "primary",
  fullWidth = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#43E08B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        fullWidth ? "w-full" : "",
        variantClass(variant),
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
