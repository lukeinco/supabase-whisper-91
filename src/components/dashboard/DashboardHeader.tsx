import type { ReactNode } from "react";
import { WeatherLine } from "./WeatherLine";

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DashboardHeader({
  weather,
  right,
  showWeather = true,
}: {
  weather?: ReactNode;
  right?: ReactNode;
  showWeather?: boolean;
}) {
  return (
    <header className="flex w-full items-baseline justify-between gap-4 border-b border-border px-4 py-3">
      <h1 className="min-w-0 truncate font-display text-[20px] font-medium leading-tight text-foreground">
        {formatDate(new Date())}
      </h1>
      <div className="shrink-0">{right ?? (showWeather ? <WeatherLine /> : weather)}</div>
    </header>
  );
}
