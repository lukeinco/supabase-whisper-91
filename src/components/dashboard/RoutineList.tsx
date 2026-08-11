import { useCallback, useState, type ComponentType } from "react";
import { Square, SquareCheck } from "lucide-react";
import { mutate, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { EmptyAction } from "./primitives";
import { EditControls, editFieldClass, useEditGesture, useEditing } from "./edit-mode";
import { useDenverToday } from "@/lib/denver";
import {
  normalizeRoutineTicks,
  normalizeRoutines,
  type Routine,
  type RoutineTicks,
} from "@/lib/modules";


type Props = {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
};

export function RoutineList({ secret, dense = false, onUnauthorized }: Props) {
  const today = useDenverToday();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [ticks, setTicks] = useState<RoutineTicks>({});
  const [adding, setAdding] = useState(false);

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

  function add(title: string) {
    const clean = title.trim();
    setAdding(false);
    if (!clean) return;
    const id = `tmp-${Date.now()}`;
    setRoutines((prev) => [...(prev ?? []), { id, title: clean, position: prev?.length ?? 0 }]);
    send("created", { title: clean });
  }

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  if (routines === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  return (
    <div className="w-full min-w-0 pb-2">
      {routines.length === 0 && !adding ? (
        <EmptyAction onClick={() => setAdding(true)}>no routine — add one</EmptyAction>
      ) : (
        routines.map((r) => {
          const done = ticks[r.id] === today;
          const Icon = done ? SquareCheck : Square;
          return (
            <RoutineRow
              key={r.id}
              r={r}
              done={done}
              Icon={Icon}
              rowH={rowH}
              textSize={textSize}
              editing={edit.editing === r.id}
              editRef={edit.editing === r.id ? edit.editRef : undefined}
              onEnterEdit={() => edit.begin(r.id)}
              onCancelEdit={edit.end}
              onSave={(v) => rename(r, v)}
              onToggle={() => toggle(r)}
            />
          );
        })
      )}


      {adding ? (
        <div
          className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
        >
          <Square size={19} strokeWidth={1.5} className="shrink-0 text-muted" />
          <input
            autoFocus
            placeholder="routine"
            onKeyDown={(e) => {
              if (e.key === "Enter") add(e.currentTarget.value);
              if (e.key === "Escape") setAdding(false);
            }}
            className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground placeholder:text-muted outline-none`}
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector("input");
              if (input) add(input.value);
            }}
            className="shrink-0 font-mono text-[11px] text-muted"
          >
            save
          </button>
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
