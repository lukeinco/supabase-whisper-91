// Supabase Edge Function source — COPY THIS FILE to supabase/functions/app-state/index.ts
// in your own Supabase repo/CLI checkout, then:
//   supabase functions deploy app-state --project-ref druggbmhwfqwomyjvpgc --no-verify-jwt
//
// Required secret (Supabase → Edge Functions → Secrets): APP_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// The x-app-secret gate lives here so the backend does not depend on where the
// frontend is hosted. public.app_state has RLS on with zero policies and no
// grants to anon/authenticated, so only this function's service-role client
// can read or write it.

import { createClient } from "jsr:@supabase/supabase-js@2";

const STATE_KEY = "dashboard.layout";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-app-secret",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const expected = Deno.env.get("APP_SECRET");
  const provided = req.headers.get("x-app-secret");
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const db = admin();

  if (req.method === "GET") {
    const { data, error } = await db
      .from("app_state")
      .select("value")
      .eq("key", STATE_KEY)
      .maybeSingle();
    if (error) {
      console.error("layout read failed:", error.message);
      return json({ layout: null });
    }
    return json({ layout: data?.value ?? null });
  }

  if (req.method === "PUT") {
    const body = (await req.json().catch(() => ({}))) as { layout?: unknown };
    if (!Array.isArray(body.layout)) {
      return new Response("Invalid layout", { status: 400, headers: cors });
    }
    const { error } = await db.from("app_state").upsert(
      {
        key: STATE_KEY,
        value: body.layout,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      console.error("layout write failed:", error.message);
      return json({ ok: true, persisted: false });
    }
    return json({ ok: true, persisted: true });
  }

  return new Response("Method not allowed", { status: 405, headers: cors });
});
