import { useRef, useState } from "react";

type Opts = {
  /** called continuously while dragging over another row in the same group */
  onOver: (dragId: string, overId: string) => void;
  /** called once on release, after the final order is settled */
  onDrop: (dragId: string) => void;
  /** manual ordering is only possible when no automatic sort is applied */
  enabled?: boolean;
};

type Live = { id: string; group: string; started: boolean; timer?: number };

/**
 * Pointer-based reordering shared by to-dos, folders, buy items and buy
 * categories. Desktop drags immediately; touch waits 400ms so the list can
 * still be scrolled. Rows are matched through data-drag-id / data-drag-group,
 * so a row can only be dropped inside its own group.
 */
export function useDragSort({ onOver, onDrop, enabled = true }: Opts) {
  const [dragId, setDragId] = useState<string | null>(null);
  const live = useRef<Live | null>(null);

  function stop() {
    const d = live.current;
    live.current = null;
    if (d?.timer) clearTimeout(d.timer);
    setDragId(null);
    return d;
  }

  function bind(id: string, group: string) {
    return {
      "data-drag-id": id,
      "data-drag-group": group,
      onPointerDown: (e: React.PointerEvent) => {
        if (!enabled) return;
        const state: Live = { id, group, started: false };
        live.current = state;
        if (e.pointerType === "touch") {
          state.timer = window.setTimeout(() => {
            state.started = true;
            setDragId(id);
          }, 400);
        }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const d = live.current;
        if (!d) return;
        if (!d.started) {
          if (e.pointerType === "touch") return;
          d.started = true;
          setDragId(d.id);
        }
        e.preventDefault();
        const el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-drag-id]") as HTMLElement | null;
        const overId = el?.dataset["dragId"];
        if (!overId || overId === d.id || el?.dataset["dragGroup"] !== d.group) return;
        onOver(d.id, overId);
      },
      onPointerUp: () => {
        const d = stop();
        if (d?.started) onDrop(d.id);
      },
      onPointerCancel: () => {
        stop();
      },
    };
  }

  return { dragId, bind };
}

/** Move `id` to the slot currently held by `overId`, keeping everything else. */
export function moveBefore<T extends { id: string }>(list: T[], id: string, overId: string): T[] {
  const next = [...list];
  const from = next.findIndex((x) => x.id === id);
  const to = next.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0) return list;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
