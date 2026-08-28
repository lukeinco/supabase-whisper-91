// The single write-through committer. Every successful mutation is merged into
// the ONE cached state object here, which persists it to localStorage and wakes
// every module. No other code path may write dashboard data.

import { commitState, readCache } from "./state-cache";
import type { DashboardState } from "./api";

type Row = Record<string, unknown>;

/** entity name -> the state key it lives under, plus accepted aliases. */
const ENTITY_KEYS: Record<string, string[]> = {
  todo: ["todos", "items"],
  folder: ["folders"],
  buy_item: ["buy_items", "buyItems", "to_buy"],
  buy_category: ["buyCategories", "buy_categories"],
  budget_category: ["budgetCategories", "budget_categories"],
  budget_line: ["budgetLines", "budget_lines"],
  reminder: ["reminders"],
  routine: ["routines", "routine"],
  routine_tick: ["routineTicks", "routine_ticks"],
  waiting_on: ["waiting_on", "waitingOn"],
  queue_card: ["queueCards", "queue_cards"],
};

function resolveKey(state: Row, entity: string): string | null {
  const aliases = ENTITY_KEYS[entity];
  if (!aliases) return null;
  for (const a of aliases) if (Array.isArray(state[a])) return a;
  return aliases[0] ?? null;
}

/**
 * Merge a mutation result into the cached state and persist the whole object.
 * `row` is the server row when there is one; otherwise the payload is merged
 * onto the existing row so the cache still reflects what the user sees.
 */
export function commitMutation(
  entity: string,
  action: string,
  payload: unknown,
  row: Row | null,
  tempId?: string | null,
) {
  const base = (readCache() ?? {}) as Row;
  const next: Row = { ...base };

  if (entity === "layout") {
    const layout = (payload as Row | null)?.["layout"];
    if (Array.isArray(layout)) next["layout"] = layout;
    commitState(next as DashboardState, "mutate");
    return;
  }

  if (entity === "notes") {
    const body = (row?.["body"] ?? (payload as Row | null)?.["body"]) as unknown;
    if (typeof body === "string") next["notes"] = { body };
    commitState(next as DashboardState, "mutate");
    return;
  }

  const key = resolveKey(base, entity);
  if (!key) return;

  const list = Array.isArray(base[key]) ? ([...(base[key] as Row[])] as Row[]) : [];
  const payloadRow = (payload ?? {}) as Row;
  const id =
    (typeof row?.["id"] === "string" ? (row["id"] as string) : null) ??
    (typeof payloadRow["id"] === "string" ? (payloadRow["id"] as string) : null);

  const matchId = tempId ?? id;
  const at = matchId ? list.findIndex((r) => r["id"] === matchId) : -1;

  if (at >= 0) {
    // Replace in place — a temp row becomes the real row at the same position.
    list[at] = { ...list[at], ...payloadRow, ...(row ?? {}) };
  } else if (id) {
    list.push({ ...payloadRow, ...(row ?? {}) });
  } else if (action === "created") {
    // Nothing addressable came back; leave the cache alone rather than write junk.
    return;
  }

  next[key] = list;
  commitState(next as DashboardState, "mutate");
}
