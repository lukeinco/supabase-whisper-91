import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Explicit edit mode.
 *
 * Enter with double-click (desktop) or a 500ms long-press (mobile, cancelled by
 * a 10px move so scrolling never triggers it). Single tap never edits.
 * Only one element across the app may be editing at a time.
 */

let activeCancel: (() => void) | null = null;

export function useEditing<T extends string = string>() {
  const [editing, setEditing] = useState<T | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const nodeRef = useRef<HTMLElement | null>(null);

  const end = useCallback(() => {
    setEditing(null);
    if (activeCancel === cancelRef.current) activeCancel = null;
  }, []);
  cancelRef.current = end;

  const begin = useCallback((id: T) => {
    if (activeCancel && activeCancel !== cancelRef.current) activeCancel();
    activeCancel = cancelRef.current;
    setEditing(id);
  }, []);

  // Tapping outside cancels — never save on blur.
  useEffect(() => {
    if (editing == null) return;
    const onDown = (e: PointerEvent) => {
      const node = nodeRef.current;
      if (node && e.target instanceof Node && node.contains(e.target)) return;
      end();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [editing, end]);

  const editRef = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el;
  }, []);

  return { editing, begin, end, editRef };
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/** Props for an element that can be put into edit mode. */
export function useEditGesture(onEnter: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEnter();
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      start.current = { x: t.clientX, y: t.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onEnter();
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      const s = start.current;
      if (!t || !s) return;
      if (Math.abs(t.clientX - s.x) > MOVE_TOLERANCE || Math.abs(t.clientY - s.y) > MOVE_TOLERANCE)
        clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

/** The 1px --muted underline every edit field wears. */
export const editFieldClass =
  "min-w-0 flex-1 border-0 border-b border-muted bg-transparent outline-none focus:outline-none";

export function EditControls({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSave}
        className="shrink-0 font-mono text-[11px] text-foreground"
      >
        save
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="shrink-0 font-mono text-[11px] text-muted"
      >
        cancel
      </button>
    </>
  );
}
