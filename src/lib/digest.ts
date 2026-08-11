import { dueLabel, isDueNow } from "./denver";
import { normalizeFolders, normalizeTodos, UNFILED } from "./todos";
import {
  daysElapsed,
  normalizeNotes,
  normalizeRoutines,
  normalizeRoutineTicks,
  normalizeWaiting,
} from "./modules";
import {
  monthInfo,
  money,
  normalizeBudgetCats,
  normalizeBudgetLines,
  pct,
  spendByCategory,
} from "./budget";
import { eventTimeLabel, type CalendarEvent } from "./calendar";

export type DigestInput = {
  state: unknown;
  today: string;
  dateLine: string;
  weather: string | null;
  events: CalendarEvent[];
};

/** A plain-prose snapshot of the day, for pasting into Claude. */
export function buildDigest({ state, today, dateLine, weather, events }: DigestInput): string {
  const out: string[] = [];
  out.push(dateLine);
  if (weather) out.push(weather);
  out.push("");

  const folders = normalizeFolders(state);
  const folderName = (id: string | null) =>
    folders.find((f) => f.id === (id ?? UNFILED.id))?.name ?? UNFILED.name;
  const due = normalizeTodos(state).filter((t) => isDueNow(t.due_ymd, today));
  out.push("Due now:");
  if (due.length === 0) out.push("  nothing due");
  else
    due.forEach((t) =>
      out.push(`  ${t.title} — ${folderName(t.folder_id)} — due ${dueLabel(t.due_ymd!, today)}`),
    );
  out.push("");

  out.push("Today's events:");
  if (events.length === 0) out.push("  none");
  else events.forEach((e) => out.push(`  ${eventTimeLabel(e)} ${e.title}`));
  out.push("");

  const ticks = normalizeRoutineTicks(state);
  const undone = normalizeRoutines(state).filter((r) => ticks[r.id] !== today);
  out.push("Routine still unchecked:");
  if (undone.length === 0) out.push("  all done");
  else undone.forEach((r) => out.push(`  ${r.title}`));
  out.push("");

  const waiting = normalizeWaiting(state);
  out.push("Waiting on:");
  if (waiting.length === 0) out.push("  nobody");
  else
    waiting.forEach((w) =>
      out.push(`  ${w.title} — ${w.person || "someone"} — ${daysElapsed(w.since_ymd, today)}`),
    );
  out.push("");

  const month = monthInfo(today);
  const cats = normalizeBudgetCats(state);
  const spent = spendByCategory(normalizeBudgetLines(state), month.prefix);
  const flagged = cats
    .map((c) => {
      const s = spent[c.id] ?? 0;
      const ratio = c.monthly_budget > 0 ? s / c.monthly_budget : 0;
      const over = s > c.monthly_budget;
      const offPace = c.spread && ratio > month.elapsedRatio;
      return { c, s, ratio, over, offPace };
    })
    .filter((r) => r.over || r.offPace);
  out.push(`Budget (day ${month.day} of ${month.days}):`);
  if (flagged.length === 0) out.push("  everything on track");
  else
    flagged.forEach(({ c, s, ratio, over }) =>
      out.push(
        `  ${c.name} — ${money(s)} of ${money(c.monthly_budget)} — ${
          over ? `over by ${money(s - c.monthly_budget)}` : "ahead of pace"
        } (${pct(ratio)} spent, ${pct(month.elapsedRatio)} elapsed)`,
      ),
    );
  out.push("");

  const notes = normalizeNotes(state).trim();
  out.push("Scratchpad:");
  out.push(
    notes
      ? notes
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n")
      : "  empty",
  );

  return out.join("\n");
}
