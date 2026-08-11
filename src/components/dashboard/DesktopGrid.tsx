import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import { Widget } from "./Widget";
import { EmptyLine, LoadingLine } from "./primitives";
import { TodoList } from "./TodoList";
import { CalendarToday } from "./CalendarToday";
import { DueNowToday } from "./DueNowToday";
import { BudgetView } from "./BudgetView";
import { BuyList } from "./BuyList";
import { RoutineList } from "./RoutineList";
import { WaitingOn } from "./WaitingOn";
import { Scratchpad } from "./Scratchpad";
import { DEFAULT_LAYOUT, ROW_HEIGHT, WIDGETS } from "./widgets";
import { getLayout, saveLayout, UnauthorizedError, type WidgetLayout } from "@/lib/api";
import { NextReminder } from "./NextReminder";
import { ReviewQueue } from "./ReviewQueue";
import { useReminderHub } from "./useReminderHub";

export function DesktopGrid({
  secret,
  onUnauthorized,
}: {
  secret: string;
  onUnauthorized: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [layout, setLayout] = useState<WidgetLayout[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const hub = useReminderHub(secret, onUnauthorized);

  useEffect(() => {
    const open = () => setQueueOpen(true);
    window.addEventListener("open-review-queue", open);
    return () => window.removeEventListener("open-review-queue", open);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    getLayout(secret)
      .then(({ layout: saved }) => {
        if (!active) return;
        setLayout(saved && saved.length ? saved : DEFAULT_LAYOUT);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setLayout(DEFAULT_LAYOUT);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [secret, onUnauthorized]);

  const children = useMemo(
    () =>
      WIDGETS.map((w) => (
        <div key={w.id}>
          <Widget
            label={w.label}
            dragHandle
            headerRight={
              w.id === "today" ? (
                <button
                  type="button"
                  onClick={() => setQueueOpen(true)}
                  className="font-mono text-[11px] text-muted"
                >
                  review · {hub.count}
                </button>
              ) : undefined
            }
          >
            {loading ? (
              <LoadingLine />
            ) : w.id === "budget" ? (
              <BudgetView secret={secret} dense onUnauthorized={onUnauthorized} />
            ) : w.id === "today" ? (
              <>
                {hub.next ? (
                  <div className="pt-3">
                    <NextReminder reminder={hub.next} />
                  </div>
                ) : null}
                <DueNowToday secret={secret} dense onUnauthorized={onUnauthorized} />
                <CalendarToday secret={secret} dense showLabel={false} onUnauthorized={onUnauthorized} />
              </>
            ) : w.id === "to-do" ? (
              <TodoList secret={secret} dense onUnauthorized={onUnauthorized} />
            ) : w.id === "to-buy" ? (
              <BuyList secret={secret} dense onUnauthorized={onUnauthorized} />
            ) : w.id === "routine" ? (
              <RoutineList secret={secret} dense onUnauthorized={onUnauthorized} />
            ) : w.id === "waiting-on" ? (
              <WaitingOn secret={secret} dense onUnauthorized={onUnauthorized} />
            ) : w.id === "scratchpad" ? (
              <Scratchpad secret={secret} onUnauthorized={onUnauthorized} />
            ) : (
              <EmptyLine>{w.empty}</EmptyLine>
            )}
          </Widget>
        </div>
      )),
    [loading, secret, onUnauthorized, hub.next, hub.count],
  );

  function persist(next: readonly { i: string; x: number; y: number; w: number; h: number }[]) {
    const clean: WidgetLayout[] = next.map((l) => {
      const def = DEFAULT_LAYOUT.find((d) => d.i === l.i);
      return {
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: def?.minW ?? 3,
        minH: def?.minH ?? 4,
      };
    });
    setLayout(clean);
    saveLayout(secret, clean).catch((e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
    });
  }


  return (
    <div ref={containerRef} className="w-full">
      {layout ? (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={ROW_HEIGHT}
          width={width}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          draggableHandle=".widget-drag-handle"
          resizeHandles={["se"]}
          onDragStop={(l) => persist(l as WidgetLayout[])}
          onResizeStop={(l) => persist(l as WidgetLayout[])}
        >
          {children}
        </GridLayout>
      ) : (
        <p className="font-mono text-[12px] text-muted">loading…</p>
      )}
      <ReviewQueue hub={hub} open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
