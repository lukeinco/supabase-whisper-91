import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  SUPABASE_URL,
  isSupabaseConfigured,
  supabase,
} from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Supabase Backend Console" },
      {
        name: "description",
        content:
          "Live connection status and health check for this app's Supabase backend project.",
      },
      { property: "og:title", content: "Supabase Backend Console" },
      {
        property: "og:description",
        content:
          "Live connection status and health check for this app's Supabase backend project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Status = "idle" | "checking" | "online" | "error";

function Index() {
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setStatus("checking");
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (!active) return;
        if (error) {
          setStatus("error");
          setDetail(error.message);
        } else {
          setStatus("online");
          setDetail("Auth endpoint reachable, session store initialized.");
        }
      })
      .catch((e: unknown) => {
        if (!active) return;
        setStatus("error");
        setDetail(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      active = false;
    };
  }, []);

  const dot =
    status === "online"
      ? "bg-accent"
      : status === "error"
        ? "bg-destructive"
        : "bg-muted-foreground";

  return (
    <main className="min-h-screen bg-background px-6 py-20">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Backend
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Supabase connection
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This app talks to an external Supabase project. Everything below reflects the
          live client configuration.
        </p>

        <section className="mt-10 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            <span className="text-sm font-medium text-card-foreground">
              {status === "online"
                ? "Connected"
                : status === "error"
                  ? "Connection failed"
                  : status === "checking"
                    ? "Checking…"
                    : "Not configured"}
            </span>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Project URL</dt>
              <dd className="mt-1 break-all font-mono text-xs text-card-foreground">
                {SUPABASE_URL}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Publishable key</dt>
              <dd className="mt-1 font-mono text-xs text-card-foreground">
                {isSupabaseConfigured ? "loaded" : "missing"}
              </dd>
            </div>
            {detail && (
              <div>
                <dt className="text-muted-foreground">Detail</dt>
                <dd className="mt-1 text-xs text-card-foreground">{detail}</dd>
              </div>
            )}
          </dl>
        </section>

        {!isSupabaseConfigured && (
          <section className="mt-6 rounded-xl border border-border bg-secondary p-6 text-sm text-secondary-foreground">
            <h2 className="font-medium">One step left</h2>
            <p className="mt-2 text-muted-foreground">
              Add your project&apos;s publishable (anon) key — Supabase dashboard →
              Project Settings → API Keys — as{" "}
              <code className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>, or
              paste it into{" "}
              <code className="font-mono text-xs">
                src/integrations/supabase/client.ts
              </code>
              . The key is publishable and safe in client code.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
