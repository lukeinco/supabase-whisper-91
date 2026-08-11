import { useEffect, useState } from "react";
import { getCalendar, UnauthorizedError } from "@/lib/api";
import { normalizeEvents, eventTimeLabel, type CalendarEvent } from "@/lib/calendar";
import { useDenverToday } from "@/lib/denver";

export function CalendarToday({
  secret,
  dense = false,
  showLabel = true,
  onUnauthorized,
}: {
  secret: string;
  dense?: boolean;
  showLabel?: boolean;
  onUnauthorized?: () => void;
}) {
  const today = useDenverToday();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    getCalendar(secret)
      .then((res) => {
        if (!alive) return;
        setEvents(res ? normalizeEvents(res) : null);
      })
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        if (alive) setEvents(null);
      });
    return () => {
      alive = false;
    };
  }, [secret, today, onUnauthorized]);

  if (!events || events.length === 0) return null;

  return (
    <div className="w-full max-w-full">
      {showLabel ? (
        <div className="px-4 pt-3 pb-1">
          <span className="label-mono">today</span>
        </div>
      ) : null}
      <ul className="w-full">
        {events.map((e, i) => (
          <li
            key={`${e.title}-${e.start ?? i}`}
            className={`flex w-full items-center gap-3 border-t border-border px-4 ${
              dense ? "h-[34px]" : "h-[44px]"
            }`}
          >
            <span className="w-[54px] shrink-0 font-mono text-[11px] text-muted">
              {eventTimeLabel(e)}
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
              {e.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
