import type { ReactNode } from "react";

type SurfaceShellProps = {
  children: ReactNode;
  withContainer?: boolean;
  containerClassName?: string;
  className?: string;
};

export default function SurfaceShell({
  children,
  withContainer = false,
  containerClassName = "",
  className = "",
}: SurfaceShellProps) {
  const shellClassName = [
    "min-h-screen text-[var(--text)]",
    "bg-[radial-gradient(circle_at_top,#f1fbff_0%,#f7fbfd_36%,#ffffff_82%)]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!withContainer) {
    return <div className={shellClassName}>{children}</div>;
  }

  return (
    <div className={shellClassName}>
      <div className={["mx-auto w-full max-w-6xl px-6 py-10", containerClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}

