import Link from "next/link";
import type { ReactNode } from "react";

export type WorkflowCardTone = "default" | "warn";

export type WorkflowCardProps = {
  title: string;
  value: number;
  href: string;
  description: string;
  ctaLabel: string;
  tone?: WorkflowCardTone;
};

export type ActionRowItem = {
  title: string;
  count: number;
  href: string;
  tone: "neutral" | "warn";
  detail: string;
  ctaLabel: string;
};

export type QueueSnapshotItem = {
  title: string;
  subtitle: string;
  detail: string;
  href: string;
  ctaLabel: string;
};

export type ShortcutRailItem = {
  title: string;
  description: string;
  href: string;
};

export type ActivityListItem = {
  id: string;
  title: string;
  timestamp: string;
  byline: string;
  detail?: string;
};

export function WorkflowCard({
  title,
  value,
  href,
  description,
  ctaLabel,
  tone = "default",
}: WorkflowCardProps) {
  return (
    <Link
      href={href}
      className={[
        "rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5",
        tone === "warn"
          ? "border-[#f2ddba] bg-[#fffaf0] hover:border-[#d9a441]"
          : "border-[#dbe9ef] bg-white hover:border-[#14b8a6]",
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-[#173543]">{value}</p>
      <p className="mt-2 min-h-[2.5rem] text-sm text-[#5b7382]">{description}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{ctaLabel}</p>
    </Link>
  );
}

export function QueueActionRow({ item }: { item: ActionRowItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-start justify-between gap-3 rounded-lg border border-[#dbe9ef] bg-white px-3 py-3 text-sm transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
    >
      <div className="min-w-0">
        <p className="font-semibold text-[#173543]">{item.title}</p>
        <p className="mt-1 text-xs text-[#5b7382]">{item.detail}</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{item.ctaLabel}</p>
      </div>
      <span
        className={[
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
          item.tone === "warn" ? "bg-[#fff3dd] text-[#8a5a08]" : "bg-[#eef7f6] text-[#0f766e]",
        ].join(" ")}
      >
        {item.count}
      </span>
    </Link>
  );
}

export function SummaryBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#173543]">{value}</p>
      <p className="mt-1 text-xs text-[#5b7382]">{detail}</p>
    </div>
  );
}

export function QueueSnapshotCard({ item }: { item: QueueSnapshotItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-lg border border-[#dbe9ef] bg-white px-3 py-3 transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5d7685]">{item.title}</p>
      <p className="mt-2 text-base font-semibold text-[#173543]">{item.subtitle}</p>
      <p className="mt-1 text-xs text-[#5b7382]">{item.detail}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0f766e]">{item.ctaLabel}</p>
    </Link>
  );
}

export function ShortcutRail({ cards }: { cards: ReadonlyArray<ShortcutRailItem> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-3 transition hover:border-[#14b8a6] hover:bg-[#f6fbfd]"
        >
          <p className="font-semibold text-[#173543]">{card.title}</p>
          <p className="mt-1 text-xs text-[#5b7382]">{card.description}</p>
        </Link>
      ))}
    </div>
  );
}

export function PlatformActivityList({ events }: { events: ActivityListItem[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-[#5b7382]">No activity logged yet.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((row) => (
        <div key={row.id} className="rounded-lg border border-[#dbe9ef] bg-white px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-[#173543]">{row.title}</p>
            <span className="text-xs text-[#6d8593]">{row.timestamp}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#5b7382]">{row.byline}</p>
          {row.detail ? <p className="mt-1 text-xs text-[#4f6877]">{row.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function DashboardPanel({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#173543]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[#5b7382]">{description}</p> : null}
        </div>
        {href && hrefLabel ? (
          <Link
            href={href}
            className="rounded-full border border-[#cfdce4] px-3 py-1 text-xs font-semibold text-[#2a4655] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
          >
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warn" | "ok" | "bad";
}) {
  const toneClass =
    tone === "ok"
      ? "border-[#cde9e6] bg-[#eefaf8] text-[#0f766e]"
      : tone === "bad"
        ? "border-[#f3d2d2] bg-[#fff4f4] text-[#991b1b]"
        : "border-[#f2ddba] bg-[#fff9ed] text-[#8a5a08]";

  return (
    <div className={["rounded-lg border px-2 py-2 text-center", toneClass].join(" ")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
