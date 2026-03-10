import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function AdminPageHeader({ title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#173543]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[#5b7382]">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
