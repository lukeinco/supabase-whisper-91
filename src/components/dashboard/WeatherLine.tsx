import { formatWeather, useWeather } from "@/lib/weather";
import { WeatherIcon } from "./WeatherIcon";

/**
 * One line of mono weather with a small condition glyph. Renders nothing at
 * all until real data exists — no skeleton, no spinner, no error state.
 */
export function WeatherLine({ className = "" }: { className?: string }) {
  const w = useWeather();
  if (!w) return null;
  return (
    <p
      className={`flex items-center gap-[6px] font-mono text-[12px] text-muted ${className}`}
    >
      <WeatherIcon code={w.code} isDay={w.isDay} size={14} />
      {formatWeather(w)}
    </p>
  );
}
