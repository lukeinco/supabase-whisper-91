import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAppSecret } from "@/lib/app-secret";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileShell } from "@/components/dashboard/MobileShell";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CaptureBar } from "@/components/dashboard/CaptureBar";
import { DesktopGrid } from "@/components/dashboard/DesktopGrid";
import { getState, UnauthorizedError } from "@/lib/api";


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

  if (!ready) return <div className="min-h-[100dvh] bg-background" />;
  if (!secret || denied) return <NoKey />;

  if (isMobile) return <MobileShell secret={secret} />;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <DashboardHeader weather="— · —" />
      <CaptureBar secret={secret} />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        <DesktopGrid secret={secret} onUnauthorized={onUnauthorized} />
      </main>
    </div>
  );
}
