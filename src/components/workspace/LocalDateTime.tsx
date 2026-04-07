"use client";

import { useSyncExternalStore } from "react";

function formatBrowserLocalDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";

  const date = new Date(parsed);
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${datePart} • ${timePart}`;
}

export default function LocalDateTime({
  value,
  fallback = "Unknown",
}: {
  value: string | null | undefined;
  fallback?: string;
}) {
  const text = String(value || "").trim();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const formatted = !text ? fallback : isClient ? formatBrowserLocalDateTime(text) : fallback;

  return (
    <time suppressHydrationWarning dateTime={text || undefined}>
      {formatted}
    </time>
  );
}
