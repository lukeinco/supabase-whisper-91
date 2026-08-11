import { TZ } from "./denver";

export type CalendarEvent = {
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
};

export function normalizeEvents(raw: unknown): CalendarEvent[] {
  const list = Array.isArray((raw as { events?: unknown })?.events)
    ? ((raw as { events: unknown[] }).events as Record<string, unknown>[])
    : [];
  return list.map((e) => ({
    title: String(e["title"] ?? "").trim() || "untitled",
    start: (e["start"] as string) ?? null,
    end: (e["end"] as string) ?? null,
    allDay: Boolean(e["allDay"] ?? e["all_day"]),
    location: (e["location"] as string) ?? null,
  }));
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "9:00a" / "1:00p" / "all day" */
export function eventTimeLabel(e: CalendarEvent): string {
  if (e.allDay || !e.start) return "all day";
  const d = new Date(e.start);
  if (Number.isNaN(d.getTime())) return "all day";
  const parts = timeFmt.format(d).toLowerCase().replace(/\s/g, "");
  return parts.replace("am", "a").replace("pm", "p");
}

/* ---------- composer helpers ---------- */

export type EventDraft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  guests: string;
  repeat: string;
  notes: string;
};

export const EMPTY_DRAFT: EventDraft = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  guests: "",
  repeat: "",
  notes: "",
};

/** Offset of America/Denver from UTC, in minutes, for the given instant. */
function denverOffsetMinutes(utcGuess: Date): number {
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
  const p = Object.fromEntries(dtf.formatToParts(utcGuess).map((x) => [x.type, x.value])) as Record<
    string,
    string
  >;
  const asUTC = Date.UTC(
    Number(p["year"]),
    Number(p["month"]) - 1,
    Number(p["day"]),
    Number(p["hour"]) === 24 ? 0 : Number(p["hour"]),
    Number(p["minute"]),
    Number(p["second"]),
  );
  return (asUTC - utcGuess.getTime()) / 60000;
}

/** Denver wall time (yyyy-mm-dd, HH:MM) → UTC Date. */
export function denverToUTC(ymd: string, hm: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const hour = t ? Number(t[1]) : 0;
  const min = t ? Number(t[2]) : 0;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, min);
  let offset = denverOffsetMinutes(new Date(naive));
  let utc = naive - offset * 60000;
  offset = denverOffsetMinutes(new Date(utc));
  utc = naive - offset * 60000;
  return new Date(utc);
}

/** Accepts "3pm", "15:00", "3:30 pm" → "HH:MM" or "". */
export function normalizeTime(input: string): string {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const ap = m[3];
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23) return "";
  return `${String(h).padStart(2, "0")}:${min}`;
}

export function utcStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

const DAY_CODES: Record<string, string> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sun: "SU",
  mon: "MO",
  tue: "TU",
  tues: "TU",
  wed: "WE",
  thu: "TH",
  thur: "TH",
  thurs: "TH",
  fri: "FR",
  sat: "SA",
};

/** "weekly", "every monday", "every 2 weeks", "monthly" → "FREQ=..." or null. */
export function repeatToRRule(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (/^(daily|every ?day)$/.test(s)) return "FREQ=DAILY";
  if (/^(weekdays|every weekday)$/.test(s)) return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  if (/^(weekly|every ?week)$/.test(s)) return "FREQ=WEEKLY";
  if (/^(biweekly|every other week)$/.test(s)) return "FREQ=WEEKLY;INTERVAL=2";
  if (/^(monthly|every ?month)$/.test(s)) return "FREQ=MONTHLY";
  if (/^(yearly|annually|every ?year)$/.test(s)) return "FREQ=YEARLY";

  const interval = /^every (\d+) (day|week|month|year)s?$/.exec(s);
  if (interval) {
    const unit = interval[2]!.toUpperCase();
    return `FREQ=${unit === "DAY" ? "DAILY" : unit === "WEEK" ? "WEEKLY" : unit === "MONTH" ? "MONTHLY" : "YEARLY"};INTERVAL=${interval[1]}`;
  }

  const days = s
    .replace(/^every\s+/, "")
    .split(/[,/ ]+and[,/ ]+|[,/ ]+/)
    .map((d) => DAY_CODES[d.replace(/s$/, "")] ?? DAY_CODES[d])
    .filter(Boolean);
  if (days.length && /^every\b/.test(s)) {
    return `FREQ=WEEKLY;BYDAY=${[...new Set(days)].join(",")}`;
  }

  if (/^rrule:/i.test(s)) return s.slice(6).toUpperCase();
  return null;
}

function draftRange(draft: EventDraft): { start: Date; end: Date } | null {
  const date = draft.date.trim();
  if (!date) return null;
  const st = normalizeTime(draft.startTime);
  const et = normalizeTime(draft.endTime);
  const start = denverToUTC(date, st || "00:00");
  if (!start) return null;
  let end = et ? denverToUTC(date, et) : null;
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + (st ? 3600000 : 86400000));
  }
  return { start, end };
}

export function googleCalendarUrl(draft: EventDraft): string {
  const params: [string, string][] = [["action", "TEMPLATE"]];
  if (draft.title.trim()) params.push(["text", draft.title.trim()]);

  const range = draftRange(draft);
  if (range) params.push(["dates", `${utcStamp(range.start)}/${utcStamp(range.end)}`]);

  if (draft.notes.trim()) params.push(["details", draft.notes.trim()]);
  if (draft.location.trim()) params.push(["location", draft.location.trim()]);

  const guests = draft.guests
    .split(/[,\s]+/)
    .map((g) => g.trim())
    .filter(Boolean);
  for (const g of guests) params.push(["add", g]);

  const rrule = repeatToRRule(draft.repeat);
  if (rrule) params.push(["recur", `RRULE:${rrule}`]);

  params.push(["ctz", TZ]);

  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `https://calendar.google.com/calendar/render?${qs}`;
}

function escapeICS(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildICS(draft: EventDraft): string {
  const range = draftRange(draft);
  const now = utcStamp(new Date());
  const uid = `${now}-${Math.random().toString(36).slice(2, 10)}@life-dashboard`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//life-dashboard//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${escapeICS(draft.title.trim() || "untitled")}`,
  ];
  if (range) {
    lines.push(`DTSTART:${utcStamp(range.start)}`);
    lines.push(`DTEND:${utcStamp(range.end)}`);
  }
  if (draft.location.trim()) lines.push(`LOCATION:${escapeICS(draft.location.trim())}`);
  if (draft.notes.trim()) lines.push(`DESCRIPTION:${escapeICS(draft.notes.trim())}`);
  for (const g of draft.guests
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    lines.push(`ATTENDEE;CN=${escapeICS(g)}:mailto:${g}`);
  }
  const rrule = repeatToRRule(draft.repeat);
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

export function downloadICS(draft: EventDraft) {
  const blob = new Blob([buildICS(draft)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(draft.title.trim() || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
