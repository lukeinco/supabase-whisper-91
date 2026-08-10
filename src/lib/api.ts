// Backend endpoint for the gated app_state store.
// Defaults to the Supabase Edge Function so the backend stays independent of
// where the frontend is hosted; falls back to the local server route until the
// function is deployed.
const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
export const LAYOUT_ENDPOINT =
  (import.meta.env["VITE_APP_STATE_URL"] as string | undefined) ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/app-state` : "/api/public/layout");

export class UnauthorizedError extends Error {

  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function request<T>(
  path: string,
  secret: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
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

export function getLayout(secret: string) {
  return request<{ layout: WidgetLayout[] | null }>("/api/public/layout", secret);
}

export function saveLayout(secret: string, layout: WidgetLayout[]) {
  return request<{ ok: true }>("/api/public/layout", secret, {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });
}
