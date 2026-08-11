import { useCallback, useRef, useState } from "react";
import { refreshState } from "@/lib/api";
import { useStateVersion } from "@/lib/state-cache";
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
import { ReminderList } from "./ReminderList";
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

const TAB_ORDER: TabId[] = ["today", "do", "buy", "budget", "notes"];

const PULL_THRESHOLD = 70;

export function MobileShell({ secret }: { secret: string }) {
  const [tab, setTab] = useState<TabId>("today");
  const [queueOpen, setQueueOpen] = useState(false);
  const hub = useReminderHub(secret);
  const ids = TAB_WIDGETS[tab];
  const swipeStart = useRef<number | null>(null);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [overlay, setOverlay] = useState<OverlayMode>(null);
  const version = useStateVersion();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);


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
        ref={mainRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
        onTouchStart={(e) => {
          swipeStart.current = tab === "do" ? (e.touches[0]?.clientY ?? null) : null;
          const t = e.touches[0];
          panStart.current = t ? { x: t.clientX, y: t.clientY } : null;
          pulling.current = (mainRef.current?.scrollTop ?? 0) <= 0 && !queueOpen;
        }}
        onTouchMove={(e) => {
          if (!pulling.current || refreshing) return;
          const start = panStart.current;
          const t = e.touches[0];
          if (!start || !t) return;
          const dy = t.clientY - start.y;
          const dx = t.clientX - start.x;
          if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
            if (pull !== 0) setPull(0);
            return;
          }
          if ((mainRef.current?.scrollTop ?? 0) > 0) return;
          setPull(Math.min(dy * 0.5, 110));
        }}
        onTouchEnd={(e) => {
          const armed = pull >= PULL_THRESHOLD;
          pulling.current = false;
          setPull(0);
          if (armed && !refreshing) {
            setRefreshing(true);
            void refreshState(secret).finally(() => setRefreshing(false));
            swipeStart.current = null;
            panStart.current = null;
            return;
          }
          const from = swipeStart.current;
          swipeStart.current = null;
          const start = panStart.current;
          panStart.current = null;
          const to = e.changedTouches[0]?.clientY;
          const el = mainRef.current;
          const atBottom = el ? el.scrollTop + el.clientHeight >= el.scrollHeight - 8 : false;
          if (from != null && to != null && from - to > 60 && atBottom) {
            setQueueOpen(true);
            return;
          }
          const end = e.changedTouches[0];
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          const order = TAB_ORDER;
          const i = order.indexOf(tab);
          const next = dx < 0 ? order[i + 1] : order[i - 1];
          if (next) setTab(next);
        }}
      >
        {pull > 0 || refreshing ? (
          <p
            className="flex items-end justify-center overflow-hidden font-mono text-[11px] text-muted"
            style={{ height: refreshing ? 24 : Math.min(pull, 24) }}
          >
            {refreshing ? "refreshing" : pull >= PULL_THRESHOLD ? "release to refresh" : ""}
          </p>
        ) : null}
        <div
          style={{ transform: `translateY(${pull}px)` }}
          className={pull === 0 ? "transition-transform duration-200" : undefined}
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
          {[...WIDGETS]
            .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
            .filter((w) => ids.includes(w.id))
            .map((w) => (
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
          <div className="mt-4 flex flex-col gap-4">
            <Widget label="reminders">
              <ReminderList hub={hub} />
            </Widget>
            <p className="pb-2 text-center font-mono text-[11px] text-muted">
              swipe up for review queue · {hub.count}
            </p>
          </div>
        ) : null}
        </div>
      </main>

      <div className="shrink-0">
        <CaptureBar secret={secret} />
        <TabBar active={tab} onChange={setTab} badges={{ do: hub.count > 0, budget: false }} />
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
