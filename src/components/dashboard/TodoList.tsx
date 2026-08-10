import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
import { dueLabel, isDueNow, useDenverToday, ymdToISO } from "@/lib/denver";
import {
  nextOccurrence,
  normalizeFolders,
  normalizeTodos,
  UNFILED,
  type Folder,
  type Todo,
} from "@/lib/todos";

type Props = {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
};

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function dateToYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function TodoList({ secret, dense = false, onUnauthorized }: Props) {
  const today = useDenverToday();
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([UNFILED]);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hoppedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    getState(secret)
      .then((state) => {
        if (!active) return;
        setFolders(normalizeFolders(state));
        setTodos(normalizeTodos(state));
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        setTodos([]);
      });
    return () => {
      active = false;
    };
  }, [secret, onUnauthorized]);

  const send = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "todo", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  const dueNow = useMemo(
    () =>
      (todos ?? [])
        .filter((t) => isDueNow(t.due_ymd, today))
        .sort((a, b) => (a.due_ymd ?? "").localeCompare(b.due_ymd ?? "")),
    [todos, today],
  );

  const byFolder = useMemo(() => {
    const rest = (todos ?? []).filter((t) => !isDueNow(t.due_ymd, today));
    return folders.map((f) => ({
      folder: f,
      items: rest
        .filter((t) => (t.folder_id ?? UNFILED.id) === f.id)
        .sort((a, b) => a.position - b.position),
    }));
  }, [todos, folders, today]);

  // Track which items have newly hopped so only those animate.
  const hopIds = useMemo(() => {
    const ids = new Set(dueNow.map((t) => t.id));
    const fresh = new Set<string>();
    ids.forEach((id) => {
      if (!hoppedRef.current.has(id)) fresh.add(id);
    });
    hoppedRef.current = ids;
    return fresh;
  }, [dueNow]);

  function withUndo(message: string, undo: () => void) {
    toast(message, {
      duration: 5000,
      action: { label: "undo", onClick: undo },
    });
  }

  function remove(t: Todo) {
    setTodos((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    send("deleted", { id: t.id });
    withUndo("deleted", () => {
      setTodos((prev) => [...(prev ?? []), t]);
      send("edited", { id: t.id, deleted_at: null });
    });
  }

  function complete(t: Todo) {
    setTodos((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    send("completed", { id: t.id });
    if (t.recur_rule) {
      const base = t.due_ymd ?? today;
      const next = nextOccurrence(t.recur_rule, base);
      if (next) {
        send("created", {
          title: t.title,
          folder_id: t.folder_id,
          due_at: ymdToISO(next),
          recur_rule: t.recur_rule,
        });
      }
    }
    withUndo("completed", () => {
      setTodos((prev) => [...(prev ?? []), t]);
      send("edited", { id: t.id, completed_at: null });
    });
  }

  function rename(t: Todo, title: string) {
    const clean = title.trim();
    setEditing(null);
    if (!clean || clean === t.title) return;
    setTodos((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, title: clean } : x)));
    send("edited", { id: t.id, title: clean });
  }

  function setDue(t: Todo, ymd: string | null) {
    const forward = !!ymd && !!t.due_ymd && ymd > t.due_ymd;
    setTodos((prev) =>
      (prev ?? []).map((x) =>
        x.id === t.id
          ? {
              ...x,
              due_ymd: ymd,
              deferred_count: forward ? x.deferred_count + 1 : x.deferred_count,
            }
          : x,
      ),
    );
    if (forward) {
      send("deferred", {
        id: t.id,
        due_at: ymd ? ymdToISO(ymd) : null,
        deferred_count: t.deferred_count + 1,
        deferral_history: [
          ...t.deferral_history,
          { from: t.due_ymd, to: ymd, at: new Date().toISOString() },
        ],
      });
    } else {
      send("edited", { id: t.id, due_at: ymd ? ymdToISO(ymd) : null });
    }
  }

  /* ---- reorder within a folder: drag on desktop, long-press on mobile ---- */
  const drag = useRef<{ id: string; folder: string; started: boolean; timer?: number } | null>(
    null,
  );

  function onPointerDown(e: React.PointerEvent, t: Todo) {
    if (editing) return;
    const folder = t.folder_id ?? UNFILED.id;
    if (isDueNow(t.due_ymd, today)) return; // pinned block is date-ordered
    const state = { id: t.id, folder, started: false } as {
      id: string;
      folder: string;
      started: boolean;
      timer?: number;
    };
    drag.current = state;
    if (e.pointerType === "touch") {
      state.timer = window.setTimeout(() => {
        state.started = true;
        setDragId(t.id);
      }, 400);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (e.pointerType === "touch") return;
      d.started = true;
      setDragId(d.id);
    }
    e.preventDefault();
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-todo-id]") as HTMLElement | null;
    const overId = el?.dataset["todoId"];
    const overFolder = el?.dataset["folderId"];
    if (!overId || overId === d.id || overFolder !== d.folder) return;
    setTodos((prev) => {
      const list = [...(prev ?? [])];
      const from = list.findIndex((x) => x.id === d.id);
      const to = list.findIndex((x) => x.id === overId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return list.map((x, i) => ({ ...x, position: i }));
    });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.timer) clearTimeout(d.timer);
    if (!d?.started) return;
    setDragId(null);
    const order = (todos ?? [])
      .filter((t) => (t.folder_id ?? UNFILED.id) === d.folder)
      .map((t, i) => ({ id: t.id, position: i }));
    send("edited", { reorder: order });
  }

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  const row = (t: Todo, pinned: boolean) => (
    <TodoRow
      key={t.id}
      t={t}
      pinned={pinned}
      today={today}
      rowH={rowH}
      textSize={textSize}
      dragging={dragId === t.id}
      editing={editing === t.id}
      onEdit={() => setEditing(t.id)}
      onCancelEdit={() => setEditing(null)}
      onRename={(v) => rename(t, v)}
      onComplete={() => complete(t)}
      onRemove={() => remove(t)}
      onDue={(ymd) => setDue(t, ymd)}
      onPointerDown={(e) => !pinned && onPointerDown(e, t)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      hop={pinned && hopIds.has(t.id)}
    />
  );


  if (todos === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  if (todos.length === 0) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">nothing due</p>;
  }

  return (
    <div ref={listRef} className="w-full min-w-0 pb-2">
      {dueNow.length > 0 ? (
        <div className="mb-3">
          <p className="px-4 py-2 font-mono text-[11px] text-accent">due now</p>
          {dueNow.map((t) => row(t, true))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-4">
        {byFolder.map(({ folder, items }) => (
          <div key={folder.id} className="rounded-[6px] border border-muted/25">
            <p className="px-3 pt-2 font-mono text-[11px] text-muted">{folder.name}</p>
            <div className="mt-1">
              {items.length === 0 ? (
                <p className="px-3 pb-2 font-mono text-[11px] text-muted">empty</p>
              ) : (
                items.map((t) => row(t, false))
              )}

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type RowProps = {
  t: Todo;
  pinned: boolean;
  today: string;
  rowH: string;
  textSize: string;
  dragging: boolean;
  editing: boolean;
  hop: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRename: (value: string) => void;
  onComplete: () => void;
  onRemove: () => void;
  onDue: (ymd: string | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
};

function TodoRow({
  t,
  pinned,
  today,
  rowH,
  textSize,
  dragging,
  editing,
  hop,
  onEdit,
  onCancelEdit,
  onRename,
  onComplete,
  onRemove,
  onDue,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: RowProps) {
  const label = t.due_ymd ? dueLabel(t.due_ymd, today) : null;
  return (
    <div
      data-todo-id={t.id}
      data-folder-id={t.folder_id ?? UNFILED.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4 ${
        dragging ? "opacity-60" : ""
      } ${hop ? "hop-in" : ""}`}
      style={{ touchAction: dragging ? "none" : undefined }}
    >
      <button
        type="button"
        aria-label="complete"
        onClick={onComplete}
        className="size-[13px] shrink-0 rounded-[2px] border border-muted/50"
      />
      {editing ? (
        <input
          autoFocus
          defaultValue={t.title}
          onBlur={(e) => onRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename(e.currentTarget.value);
            if (e.key === "Escape") onCancelEdit();
          }}
          className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground outline-none`}
        />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className={`min-w-0 flex-1 truncate text-left font-sans ${textSize} text-foreground`}
        >
          {t.title}
        </button>
      )}
      {label ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`shrink-0 font-mono text-[11px] ${pinned ? "text-accent" : "text-muted"}`}
            >
              {label}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={t.due_ymd ? ymdToDate(t.due_ymd) : undefined}
              onSelect={(d) => onDue(d ? dateToYMD(d) : null)}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      <button
        type="button"
        aria-label="delete"
        onClick={onRemove}
        className="shrink-0 font-mono text-[13px] text-muted opacity-40"
      >
        ×
      </button>
    </div>
  );
}
