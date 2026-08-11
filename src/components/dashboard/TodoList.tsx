import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { mutate, UnauthorizedError } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { useVisitCompleted } from "@/lib/visit-completed";
import { EmptyAction } from "./primitives";
import { GroupAddRow } from "./GroupAddRow";
import { EditControls, editFieldClass, useEditGesture, useEditing } from "./edit-mode";
import { dueLabel, isDueNow, useDenverToday, ymdToISO } from "@/lib/denver";
import type { DashboardState } from "@/lib/api";
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
  const edit = useEditing();
  const [dragId, setDragId] = useState<string | null>(null);
  const folderEdit = useEditing();
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingTodo, setAddingTodo] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hoppedRef = useRef<Set<string>>(new Set());

  const done = useVisitCompleted<Todo>();

  // Fresh cloud state is merged in place — existing rows keep their DOM nodes.
  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => {
      setFolders(normalizeFolders(state));
      setTodos(normalizeTodos(state));
    }, []),
    onUnauthorized,
  );

  const send = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "todo", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  const sendFolder = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "folder", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  const visible = useMemo(() => done.merge(todos ?? []), [todos, done]);

  const dueNow = useMemo(
    () =>
      visible
        .filter((t) => isDueNow(t.due_ymd, today))
        .sort((a, b) => (a.due_ymd ?? "").localeCompare(b.due_ymd ?? "")),
    [visible, today],
  );

  const byFolder = useMemo(() => {
    const rest = visible.filter((t) => !isDueNow(t.due_ymd, today));
    return folders.map((f) => ({
      folder: f,
      items: rest
        .filter((t) => (t.folder_id ?? UNFILED.id) === f.id)
        .sort((a, b) => a.position - b.position),
    }));
  }, [visible, folders, today]);

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

  /** Completed rows stay in place, muted and struck through, until the view changes. */
  function complete(t: Todo) {
    if (done.has(t.id)) {
      done.unmark(t.id);
      send("uncompleted", { id: t.id });
      return;
    }
    done.mark(t, (todos ?? []).findIndex((x) => x.id === t.id));
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
      done.unmark(t.id);
      send("uncompleted", { id: t.id });
    });
  }

  function rename(t: Todo, title: string) {
    const clean = title.trim();
    edit.end();
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
    if (edit.editing) return;
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

  function file(t: Todo, folderId: string | null) {
    setTodos((prev) =>
      (prev ?? []).map((x) => (x.id === t.id ? { ...x, folder_id: folderId } : x)),
    );
    send("edited", { id: t.id, folder_id: folderId });
  }

  function addFolder(name: string) {
    const clean = name.trim();
    setAddingFolder(false);
    if (!clean) return;
    const sort_order = folders.length - 1;
    const id = `tmp-${Date.now()}`;
    setFolders((prev) => [
      ...prev.filter((f) => f.id !== UNFILED.id),
      { id, name: clean },
      UNFILED,
    ]);
    sendFolder("created", { name: clean, sort_order });
  }

  function renameFolder(f: Folder, name: string) {
    const clean = name.trim();
    folderEdit.end();
    if (!clean || clean === f.name) return;
    setFolders((prev) => prev.map((x) => (x.id === f.id ? { ...x, name: clean } : x)));
    sendFolder("edited", { id: f.id, name: clean });
  }

  function removeFolder(f: Folder) {
    setFolders((prev) => prev.filter((x) => x.id !== f.id));
    setTodos((prev) =>
      (prev ?? []).map((x) => (x.folder_id === f.id ? { ...x, folder_id: null } : x)),
    );
    sendFolder("deleted", { id: f.id });
    withUndo("folder deleted", () => {
      setFolders((prev) => [...prev.filter((x) => x.id !== UNFILED.id), f, UNFILED]);
      sendFolder("edited", { id: f.id, deleted_at: null });
    });
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
      editing={edit.editing === t.id}
      editRef={edit.editing === t.id ? edit.editRef : undefined}
      onEdit={() => edit.begin(t.id)}
      onCancelEdit={edit.end}
      onRename={(v) => rename(t, v)}
      onComplete={() => complete(t)}
      onRemove={() => remove(t)}
      onDue={(ymd) => setDue(t, ymd)}
      onPointerDown={(e) => !pinned && onPointerDown(e, t)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      completed={done.has(t.id)}
      hop={pinned && hopIds.has(t.id)}
      folders={folders}
      onFile={(folderId) => file(t, folderId)}
    />
  );

  if (todos === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  function addTodo(title: string) {
    const clean = title.trim();
    setAddingTodo(false);
    if (!clean) return;
    setTodos((prev) => [
      ...(prev ?? []),
      {
        id: `tmp-${Date.now()}`,
        title: clean,
        folder_id: null,
        due_ymd: null,
        position: prev?.length ?? 0,
        recur_rule: null,
        deferred_count: 0,
        deferral_history: [],
      },
    ]);
    send("created", { title: clean, due_at: null });
  }

  /** Deliberate path: create straight into a folder, optionally with a parsed due date. */
  function addTo(folderId: string, title: string, due: Date | null) {
    const ymd = due ? dateToYMD(due) : null;
    setTodos((prev) => [
      ...(prev ?? []),
      {
        id: `tmp-${Date.now()}`,
        title,
        folder_id: folderId,
        due_ymd: ymd,
        position: prev?.length ?? 0,
        recur_rule: null,
        deferred_count: 0,
        deferral_history: [],
      },
    ]);
    send("created", { title, folder_id: folderId, due_at: ymd ? ymdToISO(ymd) : null });
  }

  return (
    <div ref={listRef} className="w-full min-w-0 pb-2">
      {todos.length === 0 && !addingTodo ? (
        <EmptyAction onClick={() => setAddingTodo(true)}>nothing due — add one</EmptyAction>
      ) : null}
      {addingTodo ? (
        <div
          className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
        >
          <input
            autoFocus
            placeholder="to-do"
            onKeyDown={(e) => {
              if (e.key === "Enter") addTodo(e.currentTarget.value);
              if (e.key === "Escape") setAddingTodo(false);
            }}
            className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground placeholder:text-muted outline-none`}
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector("input");
              if (input) addTodo(input.value);
            }}
            className="shrink-0 font-mono text-[11px] text-muted"
          >
            save
          </button>
        </div>
      ) : null}

      {dueNow.length > 0 ? (
        <div className="mb-3">
          <p className="px-4 py-2 font-mono text-[11px] text-accent">due now</p>
          {dueNow.map((t) => row(t, true))}
        </div>
      ) : null}

      {byFolder
        .filter((g) => g.folder.id === UNFILED.id && g.items.length > 0)
        .flatMap(({ items }) => items.map((t) => row(t, false)))}

      <div className="flex flex-col gap-3 px-4">
        {byFolder
          .filter((g) => g.folder.id !== UNFILED.id)
          .map(({ folder, items }) => (
          <div key={folder.id} className="rounded-[6px] border border-muted/25">
            <div
              className="flex items-center gap-2 px-3 pt-2"
              ref={folderEdit.editing === folder.id ? folderEdit.editRef : undefined}
            >
              {folderEdit.editing === folder.id ? (
                <FolderNameEdit
                  name={folder.name}
                  onSave={(v) => renameFolder(folder, v)}
                  onCancel={folderEdit.end}
                />
              ) : (
                <>
                  <FolderName
                    name={folder.name}
                    onEnterEdit={() =>
                      folder.id === UNFILED.id ? undefined : folderEdit.begin(folder.id)
                    }
                  />
                  {folder.id === UNFILED.id ? null : (
                    <button
                      type="button"
                      aria-label="delete folder"
                      onClick={() => removeFolder(folder)}
                      className="shrink-0 font-mono text-[13px] text-muted opacity-40"
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="mt-1">
              {items.map((t) => row(t, false))}
              <GroupAddRow
                rowH={rowH}
                textSize={textSize}
                label="+ add to this folder"
                parseDates
                onSubmit={({ title, due }) => addTo(folder.id, title, due)}
              />
            </div>
          </div>
        ))}
      </div>

      {addingFolder ? (
        <div className="flex w-full items-center gap-2 px-4 pt-3">
          <input
            autoFocus
            placeholder="folder"
            onKeyDown={(e) => {
              if (e.key === "Enter") addFolder(e.currentTarget.value);
              if (e.key === "Escape") setAddingFolder(false);
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted outline-none"
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector("input");
              if (input) addFolder(input.value);
            }}
            className="shrink-0 font-mono text-[11px] text-muted"
          >
            save
          </button>
        </div>
      ) : folders.length <= 1 ? (

        <EmptyAction onClick={() => setAddingFolder(true)}>no folders — add one</EmptyAction>
      ) : (
        <span
          role="link"
          tabIndex={0}
          onClick={() => setAddingFolder(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setAddingFolder(true);
          }}
          className="block cursor-pointer px-4 pt-3 font-mono text-[11px] text-muted"
        >
          + add folder
        </span>
      )}
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
  editRef: ((el: HTMLElement | null) => void) | undefined;
  completed: boolean;
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
  folders: Folder[];
  onFile: (folderId: string | null) => void;
};

function TodoRow({
  t,
  pinned,
  today,
  rowH,
  textSize,
  dragging,
  editing,
  editRef,
  completed,
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
  folders,
  onFile,
}: RowProps) {
  const label = t.due_ymd ? dueLabel(t.due_ymd, today) : null;
  const gesture = useEditGesture(onEdit);
  const [value, setValue] = useState(t.title);
  useEffect(() => {
    if (editing) setValue(t.title);
  }, [editing, t.title]);

  if (editing) {
    return (
      <div
        ref={editRef}
        className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename(value);
            if (e.key === "Escape") onCancelEdit();
          }}
          className={`${editFieldClass} font-sans ${textSize} text-foreground`}
        />
        <EditControls onSave={() => onRename(value)} onCancel={onCancelEdit} />
      </div>
    );
  }

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
      <span
        {...gesture}
        className={`min-w-0 flex-1 truncate text-left font-sans ${textSize} ${
          completed ? "text-muted line-through" : "text-foreground"
        }`}
      >
        {t.title}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-[4px] border border-muted/30 px-[5px] py-px font-mono text-[10px] text-muted"
          >
            {folders.find((f) => f.id === (t.folder_id ?? UNFILED.id))?.name ?? "file"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto min-w-[120px] p-1">
          <div className="flex flex-col">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFile(f.id === UNFILED.id ? null : f.id)}
                className="px-2 py-1 text-left font-mono text-[11px] text-muted hover:text-foreground"
              >
                {f.name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
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

function FolderName({ name, onEnterEdit }: { name: string; onEnterEdit: () => void }) {
  const gesture = useEditGesture(onEnterEdit);
  return (
    <span {...gesture} className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
      {name}
    </span>
  );
}

function FolderNameEdit({
  name,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value);
          if (e.key === "Escape") onCancel();
        }}
        className={`${editFieldClass} font-mono text-[11px] text-foreground`}
      />
      <EditControls onSave={() => onSave(value)} onCancel={onCancel} />
    </>
  );
}
