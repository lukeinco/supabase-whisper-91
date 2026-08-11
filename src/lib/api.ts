// All backend access goes through Supabase Edge Functions.
// The browser never touches PostgREST: every table has RLS on with zero
// policies and no grants to anon/authenticated. The #k= secret is sent as the
// x-app-secret header and the functions hold the service role key server-side.

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
export function getState(secret: string) {
  return call<DashboardState>("state", secret, { method: "GET" });
}

/** POST /functions/v1/mutate — every write. */
export function mutate<T = unknown>(
  secret: string,
  entity: string,
  action: string,
  payload: unknown = {},
) {
  return call<T>("mutate", secret, {
    method: "POST",
    body: JSON.stringify({ entity, action, payload }),
  });
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
