import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react";

/**
 * WMO weather code → one informational glyph. Always --muted; weather is
 * never an alarm, so it never carries the accent.
 */
export function WeatherIcon({
  code,
  isDay = true,
  size = 14,
  className = "",
}: {
  code: number;
  isDay?: boolean;
  size?: number;
  className?: string;
}) {
  const Icon = pick(code, isDay);
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      aria-hidden
      className={`shrink-0 text-muted ${className}`}
    />
  );
}

function pick(code: number, isDay: boolean) {
  if (code === 0) return isDay ? Sun : Moon;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}
