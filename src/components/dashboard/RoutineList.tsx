import { useCallback, useEffect, useState } from "react";
import { Square, SquareCheck, X } from "lucide-react";
import { mutate, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { EmptyAction } from "./primitives";
import { EditControls, editFieldClass, useEditGesture, useEditing } from "./edit-mode";
import { useDenverToday } from "@/lib/denver";
import {
  normalizeRoutineTicks,
  normalizeRoutines,
  scheduleLabel,
  weekdayOf,
  TIME_OF_DAY,
  WEEKDAYS,
  type RepeatKind,
  type Routine,
  type RoutineTicks,
  type TimeOfDay,
} from "@/lib/modules";

type Props = {
  secret: string;
  dense?: boolean;
  /** Today tab: only routines the server marked due_today. */
  dueTodayOnly?: boolean;
  onUnauthorized?: () => void;
};

type Draft = {
  title: string;
  start_date: string;
  time_of_day: TimeOfDay;
  repeat: RepeatOption;
  repeat_interval: number;
};

type RepeatOption =
  | "daily"
  | "n_days"
  | "weekly"
  | "n_weeks"
  | "nth1"
  | "nth2"
  | "nth3"
  | "nth4"
  | "nth_last";

const NTH: Record<string, number> = { nth1: 1, nth2: 2, nth3: 3, nth4: 4, nth_last: -1 };

function repeatOptionOf(r: Routine): RepeatOption {
  if (r.repeat_kind === "every_n_days") return "n_days";
  if (r.repeat_kind === "weekly") return r.repeat_interval > 1 ? "n_weeks" : "weekly";
  if (r.repeat_kind === "nth_weekday_of_month") {
    if (r.repeat_nth === -1) return "nth_last";
    return `nth${r.repeat_nth}` as RepeatOption;
  }
  return "daily";
}

function draftToFields(d: Draft) {
  const weekday = weekdayOf(d.start_date);
  let repeat_kind: RepeatKind = "daily";
  let repeat_interval = 1;
  let repeat_nth = 1;
  if (d.repeat === "n_days") {
    repeat_kind = "every_n_days";
    repeat_interval = Math.max(1, d.repeat_interval);
  } else if (d.repeat === "weekly") {
    repeat_kind = "weekly";
  } else if (d.repeat === "n_weeks") {
    repeat_kind = "weekly";
    repeat_interval = Math.max(1, d.repeat_interval);
  } else if (d.repeat.startsWith("nth")) {
    repeat_kind = "nth_weekday_of_month";
    repeat_nth = NTH[d.repeat] ?? 1;
  }
  return {
    title: d.title.trim(),
    start_date: d.start_date,
    time_of_day: d.time_of_day,
    repeat_kind,
    repeat_interval,
    repeat_weekday: weekday,
    repeat_nth,
  };
}

export function RoutineList({ secret, dense = false, dueTodayOnly = false, onUnauthorized }: Props) {
  const today = useDenverToday();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [ticks, setTicks] = useState<RoutineTicks>({});
  const [adding, setAdding] = useState(false);
  const edit = useEditing();

  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => {
      setRoutines(normalizeRoutines(state));
      setTicks(normalizeRoutineTicks(state));
    }, []),
    onUnauthorized,
  );

  const send = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "routine", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  function toggle(r: Routine) {
    const ticked = ticks[r.id] === today;
    setTicks((prev) => {
      const next = { ...prev };
      if (ticked) delete next[r.id];
      else next[r.id] = today;
      return next;
    });
    send(ticked ? "unticked" : "ticked", { routine_id: r.id });
  }

  function create(d: Draft) {
    const fields = draftToFields(d);
    setAdding(false);
    if (!fields.title) return;
    const id = `tmp-${Date.now()}`;
    setRoutines((prev) => [
      ...(prev ?? []),
      { id, position: prev?.length ?? 0, due_today: true, ...fields },
    ]);
    send("created", fields);
  }

  function saveEdit(r: Routine, d: Draft) {
    const fields = draftToFields(d);
    edit.end();
    if (!fields.title) return;
    setRoutines((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, ...fields } : x)));
    send("edited", { id: r.id, ...fields });
  }

  function remove(r: Routine) {
    setRoutines((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    send("deleted", { id: r.id });
  }

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  if (routines === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  const visible = dueTodayOnly ? routines.filter((r) => r.due_today) : routines;
  const groups = TIME_OF_DAY.map((tod) => ({
    tod,
    items: visible.filter((r) => r.time_of_day === tod),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="w-full min-w-0 pb-2">
      {visible.length === 0 && !adding ? (
        <EmptyAction onClick={() => setAdding(true)}>no routine — add one</EmptyAction>
      ) : (
        groups.map((g) => (
          <div key={g.tod} className="w-full min-w-0">
            <p className="px-4 pt-3 pb-1 font-mono text-[11px] text-muted">{g.tod}</p>
            {g.items.map((r) => (
              <RoutineRow
                key={r.id}
                r={r}
                done={ticks[r.id] === today}
                rowH={rowH}
                textSize={textSize}
                editing={edit.editing === r.id}
                editRef={edit.editing === r.id ? edit.editRef : undefined}
                onEnterEdit={() => edit.begin(r.id)}
                onCancelEdit={edit.end}
                onSave={(d) => saveEdit(r, d)}
                onDelete={() => remove(r)}
                onToggle={() => toggle(r)}
              />
            ))}
          </div>
        ))
      )}

      {adding ? (
        <div className="w-full min-w-0 border-b border-border px-4 py-2">
          <RoutineEditor
            initial={{
              title: "",
              start_date: today,
              time_of_day: "morning",
              repeat: "daily",
              repeat_interval: 2,
            }}
            textSize={textSize}
            onSave={create}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-4 pt-2 font-mono text-[11px] text-muted"
        >
          + add routine
        </button>
      )}
    </div>
  );
}

function RoutineRow({
  r,
  done,
  rowH,
  textSize,
  editing,
  editRef,
  onEnterEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onToggle,
}: {
  r: Routine;
  done: boolean;
  rowH: string;
  textSize: string;
  editing: boolean;
  editRef: ((el: HTMLElement | null) => void) | undefined;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: Draft) => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const gesture = useEditGesture(onEnterEdit);
  const Icon = done ? SquareCheck : Square;

  if (editing) {
    return (
      <div ref={editRef} className="w-full min-w-0 border-b border-border px-4 py-2">
        <RoutineEditor
          initial={{
            title: r.title,
            start_date: r.start_date ?? new Date().toISOString().slice(0, 10),
            time_of_day: r.time_of_day,
            repeat: repeatOptionOf(r),
            repeat_interval: r.repeat_interval > 1 ? r.repeat_interval : 2,
          }}
          textSize={textSize}
          onSave={onSave}
          onCancel={onCancelEdit}
          onDelete={onDelete}
        />
      </div>
    );
  }

  return (
    <div className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}>
      <button
        type="button"
        aria-label={done ? "untick" : "tick"}
        onClick={onToggle}
        className="shrink-0 text-muted"
      >
        <Icon size={19} strokeWidth={1.5} />
      </button>
      <span
        {...gesture}
        className={`min-w-0 flex-1 truncate font-sans ${textSize} ${
          done ? "text-muted line-through" : "text-foreground"
        }`}
      >
        {r.title}{" "}
        <span className="font-mono text-[11px] text-muted">{scheduleLabel(r)}</span>
      </span>
      <button
        type="button"
        aria-label="delete routine"
        onClick={onDelete}
        className="shrink-0 text-muted opacity-40"
      >
        <X size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function RoutineEditor({
  initial,
  textSize,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  textSize: string;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  useEffect(() => setD(initial), [initial.title, initial.start_date]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekday = WEEKDAYS[weekdayOf(d.start_date)];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const showInterval = d.repeat === "n_days" || d.repeat === "n_weeks";

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <input
        autoFocus
        value={d.title}
        placeholder="routine"
        onChange={(e) => set("title", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(d);
          if (e.key === "Escape") onCancel();
        }}
        className={`${editFieldClass} font-sans ${textSize} text-foreground`}
      />

      <label className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 font-mono text-[11px] text-muted">starting</span>
        <input
          type="date"
          value={d.start_date}
          onChange={(e) => set("start_date", e.target.value)}
          className={`${editFieldClass} font-mono text-[12px] text-foreground`}
        />
      </label>

      <div className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 font-mono text-[11px] text-muted">when</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-3">
          {TIME_OF_DAY.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("time_of_day", t)}
              className={`font-mono text-[11px] ${
                d.time_of_day === t ? "text-foreground" : "text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 font-mono text-[11px] text-muted">repeat</span>
        <select
          value={d.repeat}
          onChange={(e) => set("repeat", e.target.value as RepeatOption)}
          className={`${editFieldClass} min-w-0 flex-1 font-mono text-[12px] text-foreground`}
        >
          <option value="daily">every day</option>
          <option value="n_days">every N days</option>
          <option value="weekly">every {weekday}</option>
          <option value="n_weeks">every N weeks on {weekday}</option>
          <option value="nth1">first {weekday} of the month</option>
          <option value="nth2">second {weekday} of the month</option>
          <option value="nth3">third {weekday} of the month</option>
          <option value="nth4">fourth {weekday} of the month</option>
          <option value="nth_last">last {weekday} of the month</option>
        </select>
        {showInterval ? (
          <input
            type="number"
            min={1}
            value={d.repeat_interval}
            onChange={(e) => set("repeat_interval", Math.max(1, Number(e.target.value) || 1))}
            className={`${editFieldClass} w-[52px] shrink-0 font-mono text-[12px] text-foreground`}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <EditControls onSave={() => onSave(d)} onCancel={onCancel} />
        {onDelete ? (
          <button type="button" onClick={onDelete} className="font-mono text-[11px] text-muted">
            delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
