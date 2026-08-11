import { useEffect, useState } from "react";

export const TZ = "America/Denver";

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
});

/** yyyy-mm-dd for the given instant, in America/Denver. */
export function denverYMD(d: Date = new Date()): string {
  return ymdFmt.format(d);
}

/** yyyy-mm-dd for a stored value (ISO timestamptz or plain date string). */
export function toDenverYMD(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return denverYMD(d);
}

/** "today" / "tomorrow" / "aug 8" — always lowercase mono text. */
export function dueLabel(ymd: string, today: string): string {
  if (ymd === today) return "today";
  const [y, m, d] = ymd.split("-").map(Number);
  const asUTC = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12);
  const [ty, tm, td] = today.split("-").map(Number);
  const todayUTC = Date.UTC(ty!, (tm ?? 1) - 1, td ?? 1, 12);
  const diff = Math.round((asUTC - todayUTC) / 86400000);
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return monthDayFmt.format(new Date(asUTC)).toLowerCase();
}

/** true when the item has hopped: due today or earlier. */
export function isDueNow(ymd: string | null, today: string): boolean {
  return !!ymd && ymd <= today;
}

/** Denver-local date at noon UTC-safe midnight, as an ISO string for the API. */
export function ymdToISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toISOString();
}

function denverOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p["year"]),
    Number(p["month"]) - 1,
    Number(p["day"]),
    Number(p["hour"]) % 24,
    Number(p["minute"]),
    Number(p["second"]),
  );
  return asUTC - at.getTime();
}

/** Full ISO timestamp for a Denver-local wall clock date + time. */
export function denverISO(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, hour, minute);
  let off = denverOffsetMs(new Date(wall));
  off = denverOffsetMs(new Date(wall - off));
  return new Date(wall - off).toISOString();
}

function msUntilDenverMidnight(): number {
  const now = new Date();
  const today = denverYMD(now);
  // Probe forward in 30-minute steps until the Denver date rolls over.
  for (let m = 1; m <= 60 * 26 * 2; m += 1) {
    const t = new Date(now.getTime() + m * 30_000 * 2);
    if (denverYMD(t) !== today) return Math.max(1000, t.getTime() - now.getTime());
  }
  return 60_000;
}

/** Current Denver date, recomputed at local midnight without a page reload. */
export function useDenverToday(): string {
  const [today, setToday] = useState(() => denverYMD());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setToday(denverYMD());
        schedule();
      }, msUntilDenverMidnight() + 500);
    };
    schedule();
    const onFocus = () => setToday(denverYMD());
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return today;
}
