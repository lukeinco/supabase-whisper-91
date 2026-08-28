import { useSyncExternalStore } from "react";
import type { DashboardState } from "./api";

/**
 * Local cache of dashboard DATA only. The #k= secret is never stored here —
 * it lives in React memory for the session and nowhere else.
 * Bump the version suffix whenever the state shape changes.
 */
const KEY = "lifedash:state:v3";
const LEGACY_KEYS = ["lifedash:state:v2", "lifedash:state:v1"];

/** Keys we know how to render. A cached object with none of them is junk. */
const ENTITY_KEYS = [
  "todos",
  "folders",
  "buy_items",
  "buyItems",
  "buyCategories",
  "budgetCategories",
  "budgetLines",
  "reminders",
  "routines",
  "waiting_on",
  "queueCards",
  "notes",
  "layout",
] as const;

let memory: DashboardState | null = null;
let loaded = false;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isKnownShape(state: unknown): boolean {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const o = state as Record<string, unknown>;
  return ENTITY_KEYS.some((k) => k in o);
}

/** Optimistic rows must never survive a reload. */
function stripTempRows(state: DashboardState): DashboardState {
  if (!state) return state;
  const o = { ...(state as Record<string, unknown>) };
  for (const [k, v] of Object.entries(o)) {
    if (!Array.isArray(v)) continue;
    o[k] = v.filter((r) => {
      const id = (r as Record<string, unknown> | null)?.["id"];
      return !(typeof id === "string" && id.startsWith("tmp-"));
    });
  }
  return o as DashboardState;
}

export function readCache(): DashboardState | null {
  if (loaded) return memory;
  loaded = true;
  const store = storage();
  // Shape changed: never render a stale layout from an older key.
  for (const old of LEGACY_KEYS) {
    try {
      store?.removeItem(old);
    } catch {
      /* ignore */
    }
  }
  const raw = store?.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DashboardState;
    memory = isKnownShape(parsed) ? stripTempRows(parsed) : null;
    if (memory === null) store?.removeItem(KEY);
  } catch {
    memory = null;
  }
  return memory;
}

export function writeCache(state: DashboardState) {
  memory = state;
  loaded = true;
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode — cache is best-effort */
  }
}

export function clearCache() {
  memory = null;
  loaded = true;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/* ---- tiny store: data version + offline flag ---- */

let version = 0;
let offline = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function bumpVersion() {
  version += 1;
  emit();
}

/**
 * THE committer. React state and localStorage move together, always: the cache
 * is written first, then the version bump makes every module re-read it.
 */
export function commitState(state: DashboardState, source: "cache" | "fetch" | "mutate") {
  writeCache(state);
  logState(state, source);
  bumpVersion();
}

let appliedSeq = 0;

export function logState(state: DashboardState, source: "cache" | "fetch" | "mutate") {
  appliedSeq += 1;
  const o = (state ?? {}) as Record<string, unknown>;
  const n = (...keys: string[]) => {
    for (const k of keys) if (Array.isArray(o[k])) return (o[k] as unknown[]).length;
    return 0;
  };
  console.debug(
    `[state] ${source} seq=${appliedSeq}`,
    `todos=${n("todos", "items")}`,
    `buy=${n("buy_items", "buyItems", "to_buy")}`,
    `reminders=${n("reminders")}`,
    `budget_lines=${n("budgetLines", "budget_lines")}`,
    `routines=${n("routines")}`,
    `waiting_on=${n("waiting_on", "waitingOn")}`,
  );
}

export function setOffline(value: boolean) {
  if (offline === value) return;
  offline = value;
  emit();
}

/** Remount key: changes whenever fresh cloud data replaces what is rendered. */
export function useStateVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => offline,
    () => false,
  );
}
