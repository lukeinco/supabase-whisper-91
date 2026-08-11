import { useCallback, useState } from "react";
import { getCalendar, getState } from "@/lib/api";
import { normalizeEvents } from "@/lib/calendar";
import { buildDigest } from "@/lib/digest";
import { useDenverToday } from "@/lib/denver";
import { formatWeather, useWeather } from "@/lib/weather";
import { formatDate } from "./DashboardHeader";

/** Copies a plain-prose digest of the day. No API call, no toast. */
export function AskClaude({ secret, className = "" }: { secret: string; className?: string }) {
  const today = useDenverToday();
  const weather = useWeather();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      const [state, cal] = await Promise.all([
        getState(secret).catch(() => null),
        getCalendar(secret).catch(() => null),
      ]);
      const text = buildDigest({
        state,
        today,
        dateLine: formatDate(new Date()),
        weather: weather ? formatWeather(weather) : null,
        events: cal ? normalizeEvents(cal) : [],
      });
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard refusal stays silent */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [secret, today, weather]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`font-mono text-[11px] text-muted ${className}`}
    >
      {copied ? "copied" : "current state for claude"}
    </button>
  );
}
