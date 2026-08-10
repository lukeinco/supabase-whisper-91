import type { ReactNode } from "react";

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DashboardHeader({
  weather = "—",
  right,
}: {
  weather?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex w-full items-baseline justify-between gap-4 border-b border-border px-4 py-3">
      <h1 className="min-w-0 truncate font-display text-[20px] font-medium leading-tight text-foreground">
        {formatDate(new Date())}
      </h1>
      <div className="shrink-0 font-mono text-[11px] text-muted">
        {right ?? weather}
      </div>
    </header>
  );
}
