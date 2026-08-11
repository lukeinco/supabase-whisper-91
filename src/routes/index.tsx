import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSecret } from "@/lib/app-secret";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileShell } from "@/components/dashboard/MobileShell";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CaptureBar } from "@/components/dashboard/CaptureBar";
import { DesktopGrid } from "@/components/dashboard/DesktopGrid";
import { WeatherLine } from "@/components/dashboard/WeatherLine";
import { AskClaude } from "@/components/dashboard/AskClaude";
import { CommandOverlay, type OverlayMode } from "@/components/dashboard/CommandOverlay";
import { useShortcuts } from "@/components/dashboard/useShortcuts";
import { getState, isUnauthorized, refreshState, UnauthorizedError } from "@/lib/api";
import { useOffline, useStateVersion } from "@/lib/state-cache";
import { usePwa } from "@/lib/pwa";
import { useDenverToday } from "@/lib/denver";
import { AppErrorBoundary } from "@/components/dashboard/AppErrorBoundary";

/** One mono line, only when the network failed and cached data is on screen. */
function OfflineLine() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p className="px-4 pt-1 font-mono text-[11px] text-muted">offline — showing last known</p>
  );
}

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Life Dashboard" },
      {
        name: "description",
        content:
          "A private single-user life dashboard: today, to-do, to-buy, budget, waiting on, and scratchpad in one dense view.",
      },
      { property: "og:title", content: "Life Dashboard" },
      {
        property: "og:description",
        content:
          "A private single-user life dashboard: today, to-do, to-buy, budget, waiting on, and scratchpad in one dense view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function NoKey() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <p className="font-mono text-[13px] text-muted">No key.</p>
    </div>
  );
}

function Index() {
  const { secret, ready } = useAppSecret();
  const [denied, setDenied] = useState(false);
  const isMobile = useIsMobile();
  const onUnauthorized = useCallback(() => setDenied(true), []);
  const version = useStateVersion();
  usePwa(secret);

  useEffect(() => {
    if (!secret) return;
    let cancelled = false;
    getState(secret).catch((e) => {
      if (!cancelled && e instanceof UnauthorizedError) setDenied(true);
    });
    return () => {
      cancelled = true;
    };
  }, [secret]);

  // A background refresh that 401s is the only thing that revokes access;
  // a plain network failure keeps cached data on screen instead.
  useEffect(() => {
    if (isUnauthorized()) setDenied(true);
  }, [version]);

  // Denver midnight: the day rolled over, so pull fresh state once.
  const today = useDenverToday();
  const firstDay = useRef(today);
  useEffect(() => {
    if (!secret) return;
    if (firstDay.current === today) return;
    firstDay.current = today;
    void refreshState(secret);
  }, [today, secret]);

  if (!ready) return <div className="min-h-[100dvh] bg-background" />;
  if (!secret || denied) return <NoKey />;

  return (
    <AppErrorBoundary>
      {isMobile ? (
        <MobileShell secret={secret} />
      ) : (
        <DesktopShell secret={secret} onUnauthorized={onUnauthorized} />
      )}
    </AppErrorBoundary>
  );
}

function DesktopShell({ secret, onUnauthorized }: { secret: string; onUnauthorized: () => void }) {
  const [overlay, setOverlay] = useState<OverlayMode>(null);



  useEffect(() => {
    const onFocus = () => void refreshState(secret, { force: false });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [secret]);

  useShortcuts({
    onSearch: useCallback(() => setOverlay("search"), []),
    onHelp: useCallback(() => setOverlay("help"), []),
    onQueue: useCallback(() => window.dispatchEvent(new Event("open-review-queue")), []),
    onEscape: useCallback(() => setOverlay(null), []),
  });

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <DashboardHeader
        center={<WeatherLine />}
        right={<AskClaude secret={secret} />}
      />
      <CaptureBar secret={secret} />
      <OfflineLine />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        <DesktopGrid secret={secret} onUnauthorized={onUnauthorized} />
      </main>

      <CommandOverlay secret={secret} mode={overlay} onClose={() => setOverlay(null)} />
    </div>
  );
}
