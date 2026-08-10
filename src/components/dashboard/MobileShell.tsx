import { useState } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { CaptureBar } from "./CaptureBar";
import { TabBar, type TabId } from "./TabBar";
import { Widget } from "./Widget";
import { EmptyLine } from "./primitives";
import { WIDGETS } from "./widgets";
import { TodoList } from "./TodoList";
import { BuyList } from "./BuyList";
import { RoutineList } from "./RoutineList";
import { WaitingOn } from "./WaitingOn";
import { Scratchpad } from "./Scratchpad";

const TAB_WIDGETS: Record<TabId, string[]> = {
  today: ["today", "routine"],
  do: ["to-do"],
  buy: ["to-buy"],
  budget: ["budget"],
  notes: ["scratchpad", "waiting-on"],
};

export function MobileShell({ secret }: { secret: string }) {
  const [tab, setTab] = useState<TabId>("today");
  const ids = TAB_WIDGETS[tab];

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <DashboardHeader weather="— · —" />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        <div className="flex flex-col gap-4">
          {[...WIDGETS].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).filter((w) => ids.includes(w.id)).map((w) => (
            <Widget key={w.id} label={w.label}>
              {w.id === "to-do" ? (
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
      </main>
      <div className="shrink-0">
        <CaptureBar secret={secret} />
        <TabBar active={tab} onChange={setTab} badges={{ do: false, budget: false }} />
      </div>
    </div>
  );
}
