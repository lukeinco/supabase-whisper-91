import { useCallback, useEffect, useState } from "react";

/**
 * Items completed during this visit stay on screen, in place, until the view
 * changes. The set is cleared on tab switch, pull-to-refresh, and page load —
 * only then do completed rows actually leave.
 */
export const VIEW_RESET = "view-reset";

export function resetVisit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(VIEW_RESET));
}

export function useVisitCompleted<T extends { id: string }>() {
  const [entries, setEntries] = useState<Map<string, { item: T; index: number }>>(
    () => new Map(),
  );

  useEffect(() => {
    const clear = () => setEntries((m) => (m.size ? new Map() : m));
    window.addEventListener(VIEW_RESET, clear);
    return () => window.removeEventListener(VIEW_RESET, clear);
  }, []);

  const mark = useCallback((item: T, index: number) => {
    setEntries((m) => new Map(m).set(item.id, { item, index }));
  }, []);

  const unmark = useCallback((id: string) => {
    setEntries((m) => {
      if (!m.has(id)) return m;
      const next = new Map(m);
      next.delete(id);
      return next;
    });
  }, []);

  const has = useCallback((id: string) => entries.has(id), [entries]);

  /** Re-insert retained items the server no longer returns, at their old spot. */
  const merge = useCallback(
    (list: T[]): T[] => {
      if (entries.size === 0) return list;
      const present = new Set(list.map((i) => i.id));
      const out = [...list];
      for (const { item, index } of entries.values()) {
        if (present.has(item.id)) continue;
        out.splice(Math.min(Math.max(index, 0), out.length), 0, item);
      }
      return out;
    },
    [entries],
  );

  return { mark, unmark, has, merge };
}
