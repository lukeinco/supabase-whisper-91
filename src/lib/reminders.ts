import { TZ } from "./denver";

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export type Reminder = {
  id: string;
  title: string;
  body: string | null;
  fire_at: string; // ISO
  fireMs: number;
};

export type ReviewCard = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
};

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** "2:30 pm" — mono machine text, always lowercase. */
export function reminderTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return timeFmt.format(d).toLowerCase().replace(/\s+/g, " ");
}

function cleared(r: Raw): boolean {
  return Boolean(r["deleted_at"] || r["cleared_at"] || r["dismissed_at"] || r["cleared"]);
}

export function normalizeReminders(state: unknown): Reminder[] {
  const s = state as Raw | null;
  const raw = s?.["reminders"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c) => {
      const r = c as Raw;
      const id = str(r["id"]);
      const fire = str(r["fire_at"]) ?? str(r["fireAt"]);
      if (!id || !fire || cleared(r)) return null;
      const ms = new Date(fire).getTime();
      if (Number.isNaN(ms)) return null;
      return {
        id,
        title: str(r["title"]) ?? "",
        body: str(r["body"]) ?? str(r["notes"]),
        fire_at: fire,
        fireMs: ms,
      } satisfies Reminder;
    })
    .filter((r): r is Reminder => r !== null)
    .sort((a, b) => a.fireMs - b.fireMs);
}

/** The soonest uncleared reminder still in the future, or null. */
export function nextReminder(list: Reminder[], now = Date.now()): Reminder | null {
  return list.find((r) => r.fireMs > now) ?? null;
}

/** Every queue_card, any kind — the review stack triages all of them. */
export function normalizeReviewCards(state: unknown): ReviewCard[] {
  const s = state as Raw | null;
  const raw = s?.["queueCards"] ?? s?.["queue_cards"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c) => {
      const r = c as Raw;
      const id = str(r["id"]);
      if (!id || cleared(r)) return null;
      const payload = (r["payload"] ?? {}) as Raw;
      return {
        id,
        kind: str(r["kind"]) ?? "card",
        title: str(r["title"]) ?? str(payload["title"]) ?? "",
        body: str(r["body"]) ?? str(payload["body"]) ?? str(r["detail"]),
      } satisfies ReviewCard;
    })
    .filter((c): c is ReviewCard => c !== null);
}

/** Reminders whose fire_at has already passed still need triaging. */
export function dueReminderCards(list: Reminder[], now = Date.now()): ReviewCard[] {
  return list
    .filter((r) => r.fireMs <= now)
    .map((r) => ({ id: r.id, kind: "reminder", title: r.title, body: r.body }));
}
