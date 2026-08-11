import { useCallback, useEffect, useState } from "react";
import { getCalendar, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { normalizeEvents, eventTimeLabel, type CalendarEvent } from "@/lib/calendar";
import { useDenverToday } from "@/lib/denver";

type EventPhase = "past" | "current" | "future";

/** Instant comparison — ISO stamps are absolute, so Denver is only a label. */
function eventPhase(e: CalendarEvent, now: number): EventPhase {
  if (e.allDay || !e.start) return "future";
  const start = new Date(e.start).getTime();
  if (Number.isNaN(start)) return "future";
  const end = e.end ? new Date(e.end).getTime() : NaN;
  const finish = Number.isNaN(end) ? start : end;
  if (now >= finish) return "past";
  if (now >= start) return "current";
  return "future";
}

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
  // null until state lands, so the notice never flashes before the flag is known.
  const [configured, setConfigured] = useState<boolean | null>(null);
  // Re-evaluate past/current/future every 60s so states change in place.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => {
      setConfigured(state ? state["calendarConfigured"] !== false : null);
    }, []),
    onUnauthorized,
  );

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

  if (!events || events.length === 0) {
    if (configured !== false) return null;
    return (
      <div className="w-full max-w-full">
        {showLabel ? (
          <div className="px-4 pt-3 pb-1">
            <span className="label-mono">today</span>
          </div>
        ) : null}
        <p className="px-4 py-2 font-mono text-[11px] text-muted">calendar not connected</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full">
      {showLabel ? (
        <div className="px-4 pt-3 pb-1">
          <span className="label-mono">today</span>
        </div>
      ) : null}
      <ul className="w-full">
        {events.map((e, i) => {
          const phase = eventPhase(e, now);
          return (
            <li
              key={`${e.title}-${e.start ?? i}`}
              className={`relative flex w-full items-center gap-3 border-t border-border px-4 ${
                dense ? "h-[34px]" : "h-[44px]"
              }`}
            >
              {/* 2px bar sits 8px before the text column; rows never shift. */}
              {phase === "current" ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-[6px] w-[2px]"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              ) : null}
              <span
                className="w-[54px] shrink-0 font-mono text-[11px]"
                style={{
                  color:
                    phase === "past"
                      ? "#5A5F68"
                      : phase === "current"
                        ? "var(--accent)"
                        : "var(--muted)",
                }}
              >
                {eventTimeLabel(e)}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-sans text-[15px]"
                style={{
                  color:
                    phase === "past"
                      ? "#5A5F68"
                      : phase === "current"
                        ? "#FFFFFF"
                        : "var(--foreground)",
                }}
              >
                {e.title}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
