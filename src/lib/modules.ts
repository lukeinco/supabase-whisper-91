import { toDenverYMD } from "./denver";

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* ---------------------------------- routine --------------------------------- */

export type Routine = {
  id: string;
  title: string;
  position: number;
};

/** routine_id -> the Denver ymd it was ticked on. */
export type RoutineTicks = Record<string, string>;

export function normalizeRoutines(state: unknown): Routine[] {
  const s = state as Raw | null;
  const raw = s?.["routines"] ?? s?.["routine"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((r, i) => {
      const o = r as Raw;
      const id = str(o["id"]);
      if (!id || o["deleted_at"]) return null;
      return {
        id,
        title: str(o["title"]) ?? str(o["name"]) ?? "",
        position: typeof o["position"] === "number" ? (o["position"] as number) : i,
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
