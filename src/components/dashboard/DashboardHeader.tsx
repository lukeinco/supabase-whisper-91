import type { ReactNode } from "react";
import { useOffline } from "@/lib/state-cache";
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
  const offline = useOffline();
  return (
    <header className="w-full border-b border-border px-4 py-3">
      <div className="flex w-full items-baseline justify-between gap-4">
        <h1 className="min-w-0 truncate font-display text-[20px] font-medium leading-tight text-foreground">
          {formatDate(new Date())}
        </h1>
        <div className="shrink-0">{right ?? (showWeather ? <WeatherLine /> : weather)}</div>
      </div>
      {offline ? (
        <p className="pt-1 font-mono text-[11px] text-muted">offline — showing last known</p>
      ) : null}
    </header>
  );

}
