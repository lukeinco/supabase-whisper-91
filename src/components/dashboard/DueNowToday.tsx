import { useCallback, useState } from "react";
import { toast } from "sonner";
import { mutate, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { useVisitCompleted } from "@/lib/visit-completed";
import { dueLabel, isDueNow, useDenverToday } from "@/lib/denver";
import { normalizeTodos, type Todo } from "@/lib/todos";

type Props = {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
};

/**
 * The due-now block on Today: read-only except for the checkbox.
 * No ×, no folder chip, no inline editing.
 */
export function DueNowToday({ secret, dense = false, onUnauthorized }: Props) {
  const today = useDenverToday();
  const [todos, setTodos] = useState<Todo[] | null>(null);

  const done = useVisitCompleted<Todo>();

  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => setTodos(normalizeTodos(state)), []),
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

  const due = done
    .merge(todos ?? [])
    .filter((t) => isDueNow(t.due_ymd, today))
    .sort((a, b) => (a.due_ymd ?? "").localeCompare(b.due_ymd ?? ""));

  if (!todos || due.length === 0) return null;

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  function complete(t: Todo) {
    if (done.has(t.id)) {
      done.unmark(t.id);
      send("uncompleted", { id: t.id });
      return;
    }
    done.mark(t, (todos ?? []).findIndex((x) => x.id === t.id));
    send("completed", { id: t.id });
    toast("completed", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          done.unmark(t.id);
          send("uncompleted", { id: t.id });
        },
      },
    });
  }

  return (
    <div className="w-full min-w-0 pb-2">
      <p className="px-4 py-2 font-mono text-[11px] text-accent">due now</p>
      {due.map((t) => (
        <div
          key={t.id}
          className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
        >
          <button
            type="button"
            aria-label="complete"
            onClick={() => complete(t)}
            className="size-[13px] shrink-0 rounded-[2px] border border-muted/50"
          />
          <span
            className={`min-w-0 flex-1 truncate font-sans ${textSize} ${
              done.has(t.id) ? "text-muted line-through" : "text-foreground"
            }`}
          >
            {t.title}
          </span>
          {t.due_ymd ? (
            <span className="shrink-0 font-mono text-[11px] text-accent">
              {dueLabel(t.due_ymd, today)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
