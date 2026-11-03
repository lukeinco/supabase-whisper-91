// The single write-through committer. Every successful mutation is merged into
// the ONE cached state object here, which persists it to localStorage and wakes
// every module. Pending scalar edits and deletes also update this cache in api.ts.

import { commitState, readCache } from "./state-cache";
import type { DashboardState } from "./api";

type Row = Record<string, unknown>;

/** entity name -> the state key it lives under, plus accepted aliases. */
export const ENTITY_KEYS: Record<string, string[]> = {
  todo: ["todos", "items"],
  folder: ["folders"],
  buy_item: ["buy_items", "buyItems", "to_buy"],
  buy_category: ["buyCategories", "buy_categories"],
  budget_category: ["budgetCategories", "budget_categories"],
  budget_line: ["budgetLines", "budget_lines"],
  expense: ["budgetLines", "budget_lines"],
  reminder: ["reminders"],
  routine: ["routines", "routine"],
  routine_tick: ["routineTicks", "routine_ticks"],
  waiting_on: ["waiting_on", "waitingOn"],
  queue_card: ["queueCards", "queue_cards"],
};

export function resolveKey(state: Row, entity: string): string | null {
  const aliases = ENTITY_KEYS[entity];
  if (!aliases) return null;
  for (const a of aliases) if (Array.isArray(state[a])) return a;
  return aliases[0] ?? null;
}

export function isGoneRow(row: Row): boolean {
  return ["deleted_at", "archived_at", "completed_at", "cleared_at", "resolved_at", "purchased_at"]
    .some((key) => Boolean(row[key])) || row["active"] === false;
}

export function cleanMutationPayload(payload: Row): Row {
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
    key !== "reorder" && !(key === "deleted_at" && value === null),
  ));
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
  if (Array.isArray(payloadRow["reorder"])) {
    const order = payloadRow["reorder"] as Row[];
    next[key] = list.map((item) => {
      const entry = order.find((candidate) => candidate["id"] === item["id"]);
      const position = entry?.["position"] ?? entry?.["sort_order"];
      return typeof position === "number" ? { ...item, position, sort_order: position } : item;
    });
    commitState(next as DashboardState, "mutate");
    return;
  }
  const id =
    (typeof row?.["id"] === "string" ? (row["id"] as string) : null) ??
    (typeof payloadRow["id"] === "string" ? (payloadRow["id"] as string) : null);

  const matchId = tempId ?? id;
  const at = matchId ? list.findIndex((r) => r["id"] === matchId) : -1;

  const merged = { ...(at >= 0 ? list[at] : {}), ...cleanMutationPayload(payloadRow), ...(row ?? {}) };
  if (action === "deleted" || isGoneRow(merged)) {
    next[key] = list.filter((item) => item["id"] !== id && item["id"] !== matchId);
  } else {
    if (at >= 0) list[at] = merged;
    else if (row && typeof row["id"] === "string") list.push(merged);
    next[key] = list;
  }
  commitState(next as DashboardState, "mutate");
}
