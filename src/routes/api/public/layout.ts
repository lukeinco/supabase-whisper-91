import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const STATE_KEY = "dashboard.layout";

// Interim fallback while the Supabase Edge Function (edge/app-state) is not yet
// deployed. public.app_state has RLS on with zero policies and no grants to
// anon/authenticated, so only the service role key can reach it.
function supabaseServer() {
  const url =
    process.env["SUPABASE_URL"] ?? "https://druggbmhwfqwomyjvpgc.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}


function authorized(request: Request): boolean {
  const expected = process.env["APP_SECRET"];
  const provided = request.headers.get("x-app-secret");
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/public/layout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const { data, error } = await supabaseServer()
          .from("app_state")
          .select("value")
          .eq("key", STATE_KEY)
          .maybeSingle();
        if (error) {
          console.error("layout read failed:", error.message);
          return Response.json({ layout: null });
        }
        return Response.json({ layout: data?.value ?? null });
      },
      PUT: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as { layout?: unknown };
        if (!Array.isArray(body.layout)) {
          return new Response("Invalid layout", { status: 400 });
        }
        const { error } = await supabaseServer()
          .from("app_state")
          .upsert({ key: STATE_KEY, value: body.layout }, { onConflict: "key" });
        if (error) {
          console.error("layout write failed:", error.message);
          return Response.json({ ok: true, persisted: false });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
