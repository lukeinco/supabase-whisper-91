// All backend access goes through Supabase Edge Functions.
// The browser never touches PostgREST: every table has RLS on with zero
// policies and no grants to anon/authenticated. The #k= secret is sent as the
// x-app-secret header and the functions hold the service role key server-side.

import { toast } from "sonner";
import { bumpVersion, clearCache, readCache, setOffline, writeCache } from "./state-cache";



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
    throw new Error(`Request failed [${res.status}]: ${await res.text()}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
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

/** GET /functions/v1/state — everything the dashboard renders, in one call. */
export function getState(secret: string): Promise<DashboardState> {
  const cached = readCache();
  if (cached !== null) {
    void refreshState(secret);
    return Promise.resolve(cached);
  }
  return fetchState(secret);
}

let inflight: Promise<DashboardState> | null = null;

/** Cloud is the source of truth: overwrite memory + cache with what it returns. */
function fetchState(secret: string): Promise<DashboardState> {
  inflight ??= call<DashboardState>("state", secret, { method: "GET" })
    .then((state) => {
      writeCache(state);
      setOffline(false);
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

let refreshing: Promise<void> | null = null;

/**
 * Background refresh. Resolves fresh cloud state into the cache and bumps the
 * data version so mounted views re-read it. Never throws: a 401 clears the
 * cache and surfaces through the next foreground call; any other failure
 * flips the offline line on while cached data keeps rendering.
 */
export function refreshState(secret: string): Promise<void> {
  refreshing ??= (async () => {
    const before = JSON.stringify(readCache());
    try {
      const fresh = await call<DashboardState>("state", secret, { method: "GET" });
      writeCache(fresh);
      setOffline(false);
      if (JSON.stringify(fresh) !== before) bumpVersion();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        clearCache();
        unauthorized = true;
        bumpVersion();
        return;
      }
      setOffline(true);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let unauthorized = false;
export function isUnauthorized() {
  return unauthorized;
}

/** POST /functions/v1/mutate — every write. */
export async function mutate<T = unknown>(
  secret: string,
  entity: string,
  action: string,
  payload: unknown = {},
): Promise<T> {
  try {
    const res = await call<T>("mutate", secret, {
      method: "POST",
      body: JSON.stringify({ entity, action, payload }),
    });
    // Reconcile: pull the authoritative state back into the cache.
    void refreshState(secret);
    return res;
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      clearCache();
      throw e;
    }
    // Never silently drop a write: tell the user, then restore from cloud.
    toast("didn't save — try again");
    void refreshState(secret);
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
