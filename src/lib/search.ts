import { normalizeTodos } from "./todos";
import { normalizeBuyCategories, normalizeBuyItems } from "./buy";
import { normalizeNotes, normalizeWaiting } from "./modules";
import type { CalendarEvent } from "./calendar";
import { eventTimeLabel } from "./calendar";
import type { TabId } from "@/components/dashboard/TabBar";

export type SearchGroup = "to-do" | "to-buy" | "waiting on" | "notes" | "events";

export type SearchHit = {
  id: string;
  group: SearchGroup;
  title: string;
  meta: string | null;
  tab: TabId;
};

const MAX_PER_GROUP = 8;

export const GROUP_ORDER: SearchGroup[] = ["to-do", "to-buy", "waiting on", "notes", "events"];

function match(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

/** Case-insensitive substring search across everything in state. */
export function searchState(state: unknown, events: CalendarEvent[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];

  const push = (group: SearchGroup, list: SearchHit[]) => {
    hits.push(...list.slice(0, MAX_PER_GROUP));
  };

  push(
    "to-do",
    normalizeTodos(state)
      .filter((t) => match(t.title, q))
      .map((t) => ({
        id: t.id,
        group: "to-do" as const,
        title: t.title,
        meta: t.due_ymd,
        tab: "do" as TabId,
      })),
  );

  const buyCats = normalizeBuyCategories(state);
  push(
    "to-buy",
    normalizeBuyItems(state)
      .filter((b) => match(b.title, q))
      .map((b) => ({
        id: b.id,
        group: "to-buy" as const,
        title: b.title,
        meta: buyCats.find((c) => c.id === b.category_id)?.name ?? null,
        tab: "buy" as TabId,
      })),
  );

  push(
    "waiting on",
    normalizeWaiting(state)
      .filter((w) => match(w.title, q) || match(w.person, q))
      .map((w) => ({
        id: w.id,
        group: "waiting on" as const,
        title: w.title,
        meta: w.person || null,
        tab: "notes" as TabId,
      })),
  );

  push(
    "notes",
    normalizeNotes(state)
      .split("\n")
      .map((line, i) => ({ line: line.trim(), i }))
      .filter(({ line }) => line.length > 0 && match(line, q))
      .map(({ line, i }) => ({
        id: `note-${i}`,
        group: "notes" as const,
        title: line,
        meta: null,
        tab: "notes" as TabId,
      })),
  );

  push(
    "events",
    events
      .filter((e) => match(e.title, q))
      .map((e, i) => ({
        id: `event-${i}`,
        group: "events" as const,
        title: e.title,
        meta: eventTimeLabel(e),
        tab: "today" as TabId,
      })),
  );

  return hits;
}

/** Flash a row for one second after jumping to it. */
export function highlightItem(hit: SearchHit) {
  window.setTimeout(() => {
    const byId = document.querySelector<HTMLElement>(
      `[data-todo-id="${hit.id}"], [data-buy-id="${hit.id}"], [data-item-id="${hit.id}"]`,
    );
    let el: HTMLElement | null = byId;
    if (!el) {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("main *")).filter(
        (n) => n.children.length === 0 && n.textContent?.trim() === hit.title,
      );
      el = candidates[0]?.closest("div, li") ?? candidates[0] ?? null;
    }
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("search-flash");
    window.setTimeout(() => el?.classList.remove("search-flash"), 1000);
  }, 60);
}
