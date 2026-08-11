import { formatWeather, useWeather } from "@/lib/weather";

/**
 * One line of mono weather. Renders nothing at all until real data exists —
 * no skeleton, no spinner, no error state.
 */
export function WeatherLine({ className = "" }: { className?: string }) {
  const w = useWeather();
  if (!w) return null;
  return <p className={`font-mono text-[12px] text-muted ${className}`}>{formatWeather(w)}</p>;
}
