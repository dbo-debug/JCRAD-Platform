import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

function variantClass(variant: ButtonVariant): string {
  if (variant === "secondary") {
    return "bg-[#4d287b] text-white border border-[#6f32b5]/20 hover:border-[#f0cf59]";
  }
  if (variant === "ghost") {
    return "bg-transparent text-[#6f32b5] border border-[#8f52dc]/40 hover:border-[#8f52dc]";
  }
  return "bg-[#f0cf59] text-[#4b2a08] border border-[#f0cf59] hover:bg-[#f6dc78]";
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f52dc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf6]",
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
