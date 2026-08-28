// All backend access goes through Supabase Edge Functions.
// The browser never touches PostgREST: every table has RLS on with zero
// policies and no grants to anon/authenticated. The #k= secret is sent as the
// x-app-secret header and the functions hold the service role key server-side.

import { toast } from "sonner";
import {
  bumpVersion,
  clearCache,
  commitState,
  logState,
  readCache,
  setOffline,
  writeCache,
} from "./state-cache";
import { commitMutation } from "./state-commit";


const SUPABASE_URL = (
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://druggbmhwfqwomyjvpgc.supabase.co"
).replace(/\/$/, "");

export const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/* --------------------------------------------------------------------------
 * Sequencing. localVersion increments on every optimistic mutation. A state
 * snapshot requested BEFORE a mutation may never overwrite the local data it
 * would clobber, so every fetch records the version it launched at and its
 * response is discarded if the version has moved on.
 * ----------------------------------------------------------------------- */

let localVersion = 0;

export function localStateVersion() {
  return localVersion;
}

/** Called by every optimistic write, before the request leaves. */
export function bumpLocalVersion() {
  localVersion += 1;
  return localVersion;
}

async function call<T>(path: string, secret: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-app-secret": secret,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/** Real server message when there is one, never a bare status code. */
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    const msg = body.error ?? body.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (msg && typeof msg === "object") return JSON.stringify(msg);
  } catch {
    /* not json */
  }
  return text.trim() || `request failed (${res.status})`;
}

export type WidgetLayout = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type DashboardState = {
  layout?: WidgetLayout[] | null;
  [key: string]: unknown;
} | null;

/* --------------------------------- fetching -------------------------------- */

let inflight: Promise<DashboardState> | null = null;
let lastFetchAt = 0;
let fetchedOnce = false;

/**
 * The ONE network read. Shared in-flight promise, so any number of concurrent
 * callers produce a single request. The response is only allowed to land if no
 * optimistic mutation happened while it was in the air.
 */
function fetchState(secret: string): Promise<DashboardState> {
  if (inflight) return inflight;
  const launchedAt = localVersion;
  lastFetchAt = Date.now();
  inflight = call<DashboardState>("state", secret, { method: "GET" })
    .then((state) => {
      fetchedOnce = true;
      setOffline(false);
      if (localVersion !== launchedAt) {
        // Stale: local data is newer than this snapshot. Discard it entirely.
        return readCache();
      }
      writeCache(state);
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Cache-first read. Hydrates instantly, refreshes in the background once. */
export function getState(secret: string): Promise<DashboardState> {
  const cached = readCache();
  if (cached !== null) {
    if (!fetchedOnce) void refreshState(secret);
    return Promise.resolve(cached);
  }
  return fetchState(secret);
}

/**
 * Background refresh. Never throws: a 401 clears the cache and flips access
 * off; any other failure flips the offline line on while cached data keeps
 * rendering. Throttled to one call per 30s unless forced.
 */
export function refreshState(secret: string, opts: { force?: boolean } = {}): Promise<void> {
  const force = opts.force ?? true;
  if (!force && Date.now() - lastFetchAt < 30_000) return Promise.resolve();
  const before = JSON.stringify(readCache());
  return fetchState(secret)
    .then((fresh) => {
      if (JSON.stringify(fresh) !== before) bumpVersion();
    })
    .catch((e: unknown) => {
      if (e instanceof UnauthorizedError) {
        clearCache();
        unauthorized = true;
        bumpVersion();
        return;
      }
      setOffline(true);
    });
}

let unauthorized = false;
export function isUnauthorized() {
  return unauthorized;
}

/* -------------------------------- mutations -------------------------------- */

/** Serialise writes per record so two rapid edits both land, in order. */
const chains = new Map<string, Promise<unknown>>();

function chainKey(entity: string, payload: unknown): string {
  const id = (payload as { id?: unknown } | null)?.id;
  return `${entity}:${typeof id === "string" ? id : "new"}`;
}

export function isTempId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("tmp-");
}

/** Pull the created/updated row out of whatever shape the function returns. */
export function resultRow(res: unknown): Record<string, unknown> | null {
  const r = res as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  for (const key of ["result", "row", "data", "record"]) {
    const v = r[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return typeof r["id"] === "string" ? r : null;
}

export function resultId(res: unknown): string | null {
  const row = resultRow(res);
  const id = row?.["id"];
  return typeof id === "string" && !isTempId(id) ? id : null;
}

/** POST /functions/v1/mutate — every write. */
export function mutate<T = unknown>(
  secret: string,
  entity: string,
  action: string,
  payload: unknown = {},
): Promise<T> {
  const key = chainKey(entity, payload);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(() => send<T>(secret, entity, action, payload));
  chains.set(
    key,
    run.catch(() => undefined),
  );
  void run.catch(() => undefined).finally(() => {
    if (chains.get(key) === undefined) chains.delete(key);
  });
  return run;
}

async function send<T>(
  secret: string,
  entity: string,
  action: string,
  payload: unknown,
): Promise<T> {
  const id = (payload as { id?: unknown } | null)?.id;
  if (isTempId(id)) {
    // Never let an optimistic id reach the database.
    throw new Error("still saving — try again in a moment");
  }
  bumpLocalVersion();
  try {
    const res = await call<T>("mutate", secret, {
      method: "POST",
      body: JSON.stringify({ entity, action, payload }),
    });
    // No refetch on success: callers apply the returned row in place.
    return res;
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      clearCache();
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    toast(`didn't save — ${message}`, {
      duration: 8000,
      action: {
        label: "retry",
        onClick: () => {
          void mutate(secret, entity, action, payload);
        },
      },
    });
    throw e;
  }
}

export async function getLayout(secret: string): Promise<{ layout: WidgetLayout[] | null }> {
  const state = await getState(secret);
  return { layout: state?.layout ?? null };
}

export function saveLayout(secret: string, layout: WidgetLayout[]) {
  return mutate(secret, "layout", "edited", { layout });
}

/**
 * GET /functions/v1/calendar — today's events in America/Denver.
 * Returns null when the function is not deployed or errors: the UI renders
 * nothing rather than an error state.
 */
export async function getCalendar(secret: string): Promise<{ events: unknown[] } | null> {
  try {
    return await call<{ events: unknown[] }>("calendar", secret, { method: "GET" });
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    return null;
  }
}
