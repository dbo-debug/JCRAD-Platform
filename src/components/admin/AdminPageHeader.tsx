import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function AdminPageHeader({ title, description, action }: AdminPageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-[var(--workspace-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--workspace-text)]">{title}</h1>
        {description ? <p className="mt-1.5 text-sm leading-6 text-[var(--workspace-text-secondary)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
