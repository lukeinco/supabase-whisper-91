import { useEffect, useState } from "react";

/** Colorado Springs — silent fallback when geolocation is denied or fails. */
const FALLBACK = { lat: 38.8339, lon: -104.8214 };

export type Weather = {
  temp: number;
  high: number;
  low: number;
  precip: number;
  sunrise: string;
  sunset: string;
};

function hhmm(iso: string): string {
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 5);
}

function coords(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(FALLBACK);
      return;
    }
    const done = (c: { lat: number; lon: number }) => resolve(c);
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => done(FALLBACK),
      { timeout: 8000, maximumAge: 15 * 60 * 1000 },
    );
  });
}

async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&temperature_unit=fahrenheit&timezone=America%2FDenver&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as {
    current?: { temperature_2m?: number };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      sunrise?: string[];
      sunset?: string[];
    };
  };
  const d = j.daily;
  const temp = j.current?.temperature_2m;
  const high = d?.temperature_2m_max?.[0];
  const low = d?.temperature_2m_min?.[0];
  const sunrise = d?.sunrise?.[0];
  const sunset = d?.sunset?.[0];
  if (
    temp === undefined ||
    high === undefined ||
    low === undefined ||
    !sunrise ||
    !sunset
  ) {
    return null;
  }
  return {
    temp: Math.round(temp),
    high: Math.round(high),
    low: Math.round(low),
    precip: Math.round(d?.precipitation_probability_max?.[0] ?? 0),
    sunrise: hhmm(sunrise),
    sunset: hhmm(sunset),
  };
}

/** Current weather, refreshed every 15 minutes and on window focus. */
export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let active = true;
    let loc: { lat: number; lon: number } | null = null;

    const load = async () => {
      try {
        loc ??= await coords();
        const w = await fetchWeather(loc.lat, loc.lon);
        if (active && w) setWeather(w);
      } catch {
        /* silent: weather never shows an error */
      }
    };

    void load();
    const interval = setInterval(() => void load(), 15 * 60 * 1000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return weather;
}

export function formatWeather(w: Weather): string {
  return `${w.temp}° · ${w.high}/${w.low} · rain ${w.precip}% · ${w.sunrise}–${w.sunset}`;
}
