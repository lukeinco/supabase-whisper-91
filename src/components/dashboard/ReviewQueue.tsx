import { useEffect, useRef, useState } from "react";
import type { ReminderHub } from "./useReminderHub";
import type { ReviewCard } from "@/lib/reminders";

type Dir = "left" | "right" | "up" | "down" | null;

const THRESHOLD = 60;

export function ReviewQueue({
  hub,
  open,
  onClose,
}: {
  hub: ReminderHub;
  open: boolean;
  onClose: () => void;
}) {
  const card = hub.cards[0] ?? null;
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [exit, setExit] = useState<Dir>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) {
      setShowDismissed(false);
      setDrag({ x: 0, y: 0 });
      setExit(null);
    }
  }, [open]);

  if (!open) return null;

  function fly(dir: Exclude<Dir, null>, action: (() => void) | null) {
    setExit(dir);
    pending.current = action;
    window.setTimeout(() => {
      setExit(null);
      setDrag({ x: 0, y: 0 });
      const run = pending.current;
      pending.current = null;
      if (run) run();
      else onClose();
    }, 200);
  }

  function act(dir: Exclude<Dir, null>, c: ReviewCard) {
    if (dir === "left") fly("left", () => hub.clear(c));
    else if (dir === "up") fly("up", () => hub.promote(c));
    else if (dir === "right") fly("right", () => hub.keep(c));
    else fly("down", null);
  }

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  }
  function onPointerUp() {
    if (!start.current || !card) {
      start.current = null;
      setDrag({ x: 0, y: 0 });
      return;
    }
    start.current = null;
    const { x, y } = drag;
    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > THRESHOLD) {
      act(x < 0 ? "left" : "right", card);
    } else if (Math.abs(y) > THRESHOLD) {
      act(y < 0 ? "up" : "down", card);
    } else {
      setDrag({ x: 0, y: 0 });
    }
  }

  const offset = exit
    ? {
        left: { x: -400, y: 0 },
        right: { x: 400, y: 0 },
        up: { x: 0, y: -500 },
        down: { x: 0, y: 500 },
      }[exit]
    : drag;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setShowDismissed((v) => !v)}
          className="font-mono text-[11px] text-muted"
        >
          dismissed today
        </button>
        <span className="font-mono text-[11px] text-muted">
          {hub.count > 0 ? `${hub.count} left` : ""}
        </span>
      </div>

      {showDismissed ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {hub.dismissed.length === 0 ? (
            <p className="font-mono text-[11px] text-muted">nothing dismissed</p>
          ) : (
            hub.dismissed.map((d) => (
              <div key={d.id} className="border-b border-border py-2">
                <p className="font-mono text-[11px] text-muted">{d.kind}</p>
                <p className="font-sans text-[15px] text-foreground">{d.title}</p>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setShowDismissed(false)}
            className="mt-4 font-mono text-[11px] text-muted"
          >
            back
          </button>
        </div>
      ) : card ? (
        <>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              opacity: exit ? 0 : 1,
              transition: exit || (!drag.x && !drag.y) ? "transform 200ms linear, opacity 200ms linear" : "none",
              touchAction: "none",
            }}
            className="flex min-h-0 flex-1 select-none flex-col items-center justify-center px-6 text-center"
          >
            <p className="font-mono text-[11px] text-muted">{card.kind}</p>
            <h2 className="mt-4 font-display text-[28px] leading-tight text-foreground">
              {card.title}
            </h2>
            {card.body ? (
              <p className="mt-3 max-w-[36ch] font-sans text-[15px] text-muted">{card.body}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between px-6 pb-6 pt-2">
            <button type="button" onClick={() => act("left", card)} className="font-mono text-[11px] text-muted">
              clear
            </button>
            <button type="button" onClick={() => act("up", card)} className="font-mono text-[11px] text-muted">
              make task
            </button>
            <button type="button" onClick={() => act("right", card)} className="font-mono text-[11px] text-muted">
              keep
            </button>
            <button type="button" onClick={() => act("down", card)} className="font-mono text-[11px] text-muted">
              exit
            </button>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <p className="font-mono text-[11px] text-muted">nothing to review</p>
          <button type="button" onClick={onClose} className="font-mono text-[11px] text-foreground">
            done
          </button>
        </div>
      )}
    </div>
  );
}
