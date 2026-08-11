import { useCallback, useRef, useState } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { WeatherLine } from "./WeatherLine";
import { CaptureBar } from "./CaptureBar";
import { TabBar, type TabId } from "./TabBar";
import { Widget } from "./Widget";
import { EmptyLine } from "./primitives";
import { WIDGETS } from "./widgets";
import { TodoList } from "./TodoList";
import { CalendarToday } from "./CalendarToday";
import { DueNowToday } from "./DueNowToday";
import { BudgetView } from "./BudgetView";
import { BuyList } from "./BuyList";
import { RoutineList } from "./RoutineList";
import { WaitingOn } from "./WaitingOn";
import { Scratchpad } from "./Scratchpad";
import { NextReminder } from "./NextReminder";
import { ReviewQueue } from "./ReviewQueue";
import { useReminderHub } from "./useReminderHub";
import { AskClaude } from "./AskClaude";
import { CommandOverlay, type OverlayMode } from "./CommandOverlay";
import { useShortcuts } from "./useShortcuts";

const TAB_WIDGETS: Record<TabId, string[]> = {
  today: ["today", "routine"],
  do: ["to-do"],
  buy: ["to-buy"],
  budget: ["budget"],
  notes: ["scratchpad", "waiting-on"],
};

export function MobileShell({ secret }: { secret: string }) {
  const [tab, setTab] = useState<TabId>("today");
  const [queueOpen, setQueueOpen] = useState(false);
  const hub = useReminderHub(secret);
  const ids = TAB_WIDGETS[tab];
  const swipeStart = useRef<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>(null);

  useShortcuts({
    onSearch: useCallback(() => setOverlay("search"), []),
    onHelp: useCallback(() => setOverlay("help"), []),
    onQueue: useCallback(() => setQueueOpen(true), []),
    onEscape: useCallback(() => {
      setOverlay(null);
      setQueueOpen(false);
    }, []),
    onTab: useCallback((t: TabId) => setTab(t), []),
  });

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <DashboardHeader showWeather={false} />
      <main
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
        onTouchStart={(e) => {
          swipeStart.current = tab === "do" ? (e.touches[0]?.clientY ?? null) : null;
        }}
        onTouchEnd={(e) => {
          const from = swipeStart.current;
          swipeStart.current = null;
          const to = e.changedTouches[0]?.clientY;
          if (from != null && to != null && from - to > 80 && from > window.innerHeight * 0.6) {
            setQueueOpen(true);
          }
        }}
      >
        {tab === "today" ? (
          <>
            <WeatherLine className="mb-3" />
            <div className="-mx-4">
              <NextReminder reminder={hub.next} />
            </div>
          </>
        ) : null}
        <div className="flex flex-col gap-4">
          {[...WIDGETS].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).filter((w) => ids.includes(w.id)).map((w) => (
            <Widget key={w.id} label={w.label}>
              {w.id === "budget" ? (
                <BudgetView secret={secret} />
              ) : w.id === "today" ? (
                <>
                  <DueNowToday secret={secret} />
                  <CalendarToday secret={secret} showLabel={false} />
                </>
              ) : w.id === "to-do" ? (
                <TodoList secret={secret} />
              ) : w.id === "to-buy" ? (
                <BuyList secret={secret} />
              ) : w.id === "routine" ? (
                <RoutineList secret={secret} />
              ) : w.id === "waiting-on" ? (
                <WaitingOn secret={secret} />
              ) : w.id === "scratchpad" ? (
                <Scratchpad secret={secret} />
              ) : (
                <EmptyLine>{w.empty}</EmptyLine>
              )}
            </Widget>
          ))}
        </div>
        {tab === "notes" ? (
          <div className="pt-4">
            <AskClaude secret={secret} />
          </div>
        ) : null}
        {tab === "do" ? (
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="mt-4 w-full rounded-[6px] border border-muted/25 py-2 font-mono text-[11px] text-muted"
          >
            review queue · {hub.count}
          </button>
        ) : null}
      </main>
      <div className="shrink-0">
        <CaptureBar secret={secret} />
        <TabBar
          active={tab}
          onChange={setTab}
          badges={{ do: hub.count > 0, budget: false }}
        />
      </div>
      <CommandOverlay
        secret={secret}
        mode={overlay}
        onClose={() => setOverlay(null)}
        onJump={(t) => setTab(t)}
      />
      <ReviewQueue hub={hub} open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
