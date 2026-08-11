import { useEffect, useMemo, useRef, useState } from "react";
import { getCalendar, getState, UnauthorizedError } from "@/lib/api";
import { normalizeEvents, type CalendarEvent } from "@/lib/calendar";
import { GROUP_ORDER, highlightItem, searchState, type SearchHit } from "@/lib/search";
import type { TabId } from "./TabBar";

const SHORTCUTS: [string, string][] = [
  ["ctrl+k / cmd+k", "search"],
  ["/", "focus capture bar"],
  ["1–5", "today / do / buy / budget / notes"],
  ["q", "review queue"],
  ["?", "this list"],
  ["esc", "close"],
];

export type OverlayMode = "search" | "help" | null;

export function CommandOverlay({
  secret,
  mode,
  onClose,
  onJump,
}: {
  secret: string;
  mode: OverlayMode;
  onClose: () => void;
  onJump?: (tab: TabId) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<unknown>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "search") return;
    setQuery("");
    setCursor(0);
    let alive = true;
    getState(secret)
      .then((s) => alive && setState(s))
      .catch((e: unknown) => {
        if (!(e instanceof UnauthorizedError)) return;
      });
    getCalendar(secret)
      .then((r) => alive && setEvents(r ? normalizeEvents(r) : []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode, secret]);

  const hits = useMemo(
    () => (mode === "search" ? searchState(state, events, query) : []),
    [mode, state, events, query],
  );

  const ordered = useMemo(
    () => GROUP_ORDER.flatMap((g) => hits.filter((h) => h.group === g)),
    [hits],
  );

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!mode) return null;

  function jump(hit: SearchHit) {
    onJump?.(hit.tab);
    onClose();
    highlightItem(hit);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(ordered.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      const hit = ordered[cursor];
      if (hit) {
        e.preventDefault();
        jump(hit);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[6px] bg-card"
        onKeyDown={onKeyDown}
      >
        {mode === "search" ? (
          <>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search"
              className="w-full shrink-0 border-b border-border bg-transparent px-4 py-3 font-sans text-[15px] text-foreground placeholder:text-muted outline-none"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {query.trim() === "" ? null : ordered.length === 0 ? (
                <p className="px-4 py-3 font-mono text-[11px] text-muted">no matches</p>
              ) : (
                GROUP_ORDER.map((group) => {
                  const rows = hits.filter((h) => h.group === group);
                  if (rows.length === 0) return null;
                  return (
                    <div key={group}>
                      <p className="px-4 pb-1 pt-3 font-mono text-[11px] text-muted">{group}</p>
                      {rows.map((h) => {
                        const active = ordered[cursor]?.id === h.id;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onMouseEnter={() => setCursor(ordered.findIndex((o) => o.id === h.id))}
                            onClick={() => jump(h)}
                            className={`flex h-[34px] w-full items-center gap-3 border-b border-border px-4 text-left ${
                              active ? "bg-muted/10" : ""
                            }`}
                          >
                            <span
                              className={`min-w-0 flex-1 truncate font-sans text-[14px] ${
                                active ? "text-foreground" : "text-foreground/80"
                              }`}
                            >
                              {h.title}
                            </span>
                            {h.meta ? (
                              <span className="shrink-0 font-mono text-[11px] text-muted">
                                {h.meta}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            <p className="px-4 pb-1 pt-2 font-mono text-[11px] text-muted">shortcuts</p>
            {SHORTCUTS.map(([key, what]) => (
              <div
                key={key}
                className="flex h-[34px] w-full items-center gap-3 border-b border-border px-4"
              >
                <span className="w-[130px] shrink-0 font-mono text-[11px] text-muted">{key}</span>
                <span className="min-w-0 flex-1 truncate font-sans text-[14px] text-foreground">
                  {what}
                </span>
              </div>
            ))}
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="px-4 pt-3 font-mono text-[11px] text-muted"
            >
              close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
