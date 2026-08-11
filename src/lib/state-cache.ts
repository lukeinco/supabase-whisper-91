import { useSyncExternalStore } from "react";
import type { DashboardState } from "./api";

/**
 * Local cache of dashboard DATA only. The #k= secret is never stored here —
 * it lives in React memory for the session and nowhere else.
 * Bump the version suffix whenever the state shape changes.
 */
const KEY = "lifedash:state:v2";

let memory: DashboardState | null = null;
let loaded = false;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCache(): DashboardState | null {
  if (loaded) return memory;
  loaded = true;
  const raw = storage()?.getItem(KEY);
  if (!raw) return null;
  try {
    memory = JSON.parse(raw) as DashboardState;
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
