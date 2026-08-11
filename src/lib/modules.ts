import { toDenverYMD } from "./denver";

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* ---------------------------------- routine --------------------------------- */

export const TIME_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const REPEAT_KINDS = ["daily", "every_n_days", "weekly", "nth_weekday_of_month"] as const;
export type RepeatKind = (typeof REPEAT_KINDS)[number];

export type Routine = {
  id: string;
  title: string;
  position: number;
  start_date: string | null;
  time_of_day: TimeOfDay;
  repeat_kind: RepeatKind;
  repeat_interval: number;
  repeat_weekday: number;
  repeat_nth: number;
  due_today: boolean;
};

/** routine_id -> the Denver ymd it was ticked on. */
export type RoutineTicks = Record<string, string>;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Weekday index (Sun=0) of a "yyyy-mm-dd" string. */
export function weekdayOf(ymd: string | null): number {
  if (!ymd) return new Date().getDay();
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date().getDay();
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const ORDINALS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "last" };

/** "every day", "every 3 days", "every Thursday", "2nd Thursday" */
export function scheduleLabel(r: Routine): string {
  const day = WEEKDAYS[r.repeat_weekday] ?? WEEKDAYS[0];
  switch (r.repeat_kind) {
    case "every_n_days":
      return r.repeat_interval > 1 ? `every ${r.repeat_interval} days` : "every day";
    case "weekly":
      return r.repeat_interval > 1 ? `every ${r.repeat_interval} weeks on ${day}` : `every ${day}`;
    case "nth_weekday_of_month":
      return `${ORDINALS[r.repeat_nth] ?? `${r.repeat_nth}th`} ${day}`;
    default:
      return "every day";
  }
}

function int(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRoutines(state: unknown): Routine[] {
  const s = state as Raw | null;
  const raw = s?.["routines"] ?? s?.["routine"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((r, i) => {
      const o = r as Raw;
      const id = str(o["id"]);
      if (!id || o["deleted_at"]) return null;
      const start = (str(o["start_date"]) ?? "").slice(0, 10) || null;
      const tod = str(o["time_of_day"]) as TimeOfDay | null;
      const kind = str(o["repeat_kind"]) as RepeatKind | null;
      return {
        id,
        title: str(o["title"]) ?? str(o["name"]) ?? "",
        position: typeof o["position"] === "number" ? (o["position"] as number) : i,
        start_date: start,
        time_of_day: tod && TIME_OF_DAY.includes(tod) ? tod : "morning",
        repeat_kind: kind && REPEAT_KINDS.includes(kind) ? kind : "daily",
        repeat_interval: int(o["repeat_interval"], 1),
        repeat_weekday: int(o["repeat_weekday"], weekdayOf(start)),
        repeat_nth: int(o["repeat_nth"], 1),
        due_today: o["due_today"] !== false,
      } satisfies Routine;
    })
    .filter((r): r is Routine => r !== null)
    .sort((a, b) => a.position - b.position);
}


export function normalizeRoutineTicks(state: unknown): RoutineTicks {
  const s = state as Raw | null;
  const raw = s?.["routineTicks"] ?? s?.["routine_ticks"];
  const list = Array.isArray(raw) ? raw : [];
  const ticks: RoutineTicks = {};
  list.forEach((t) => {
    const o = t as Raw;
    const id = str(o["routine_id"]) ?? str(o["id"]);
    const ymd = toDenverYMD(str(o["ticked_at"]) ?? str(o["date"]) ?? str(o["created_at"]));
    if (id && ymd) ticks[id] = ymd;
  });
  return ticks;
}

/* -------------------------------- waiting on -------------------------------- */

export type WaitingItem = {
  id: string;
  title: string;
  person: string;
  since_ymd: string | null;
};

export function normalizeWaiting(state: unknown): WaitingItem[] {
  const s = state as Raw | null;
  const raw = s?.["waiting_on"] ?? s?.["waitingOn"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((w) => {
      const o = w as Raw;
      const id = str(o["id"]);
      if (!id || o["deleted_at"] || o["completed_at"]) return null;
      return {
        id,
        title: str(o["title"]) ?? str(o["what"]) ?? "",
        person: str(o["person"]) ?? str(o["who"]) ?? "",
        since_ymd: toDenverYMD(str(o["since"]) ?? str(o["since_at"]) ?? str(o["created_at"])),
      } satisfies WaitingItem;
    })
    .filter((w): w is WaitingItem => w !== null);
}

/** whole days elapsed between two Denver ymd values, as "6d". */
export function daysElapsed(sinceYMD: string | null, today: string): string {
  if (!sinceYMD) return "—";
  const at = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12);
  };
  const diff = Math.max(0, Math.round((at(today) - at(sinceYMD)) / 86400000));
  return `${diff}d`;
}

/* -------------------------------- scratchpad -------------------------------- */

export function normalizeNotes(state: unknown): string {
  const s = state as Raw | null;
  const raw = s?.["notes"];
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    return str((raw as Raw)["body"]) ?? "";
  }
  if (Array.isArray(raw)) {
    return str((raw[0] as Raw | undefined)?.["body"]) ?? "";
  }
  return "";
}
