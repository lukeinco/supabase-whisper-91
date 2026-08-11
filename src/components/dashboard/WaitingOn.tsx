import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Square } from "lucide-react";
import { mutate, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { useVisitCompleted } from "@/lib/visit-completed";
import { EmptyAction } from "./primitives";
import { useDenverToday } from "@/lib/denver";
import { daysElapsed, normalizeWaiting, type WaitingItem } from "@/lib/modules";

type Props = {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
};

export function WaitingOn({ secret, dense = false, onUnauthorized }: Props) {
  const today = useDenverToday();
  const [items, setItems] = useState<WaitingItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [what, setWhat] = useState("");
  const [who, setWho] = useState("");

  const done = useVisitCompleted<WaitingItem>();

  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => setItems(normalizeWaiting(state)), []),
    onUnauthorized,
  );

  const send = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "waiting_on", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  function resolve(w: WaitingItem) {
    if (done.has(w.id)) {
      done.unmark(w.id);
      send("edited", { id: w.id, completed_at: null });
      return;
    }
    done.mark(w, (items ?? []).findIndex((x) => x.id === w.id));
    send("completed", { id: w.id });
    toast("resolved", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          done.unmark(w.id);
          send("edited", { id: w.id, completed_at: null });
        },
      },
    });
  }

  function remove(w: WaitingItem) {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== w.id));
    send("deleted", { id: w.id });
    toast("deleted", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setItems((prev) => [...(prev ?? []), w]);
          send("edited", { id: w.id, deleted_at: null });
        },
      },
    });
  }

  function commitAdd() {
    const title = what.trim();
    const person = who.trim();
    setAdding(false);
    setWhat("");
    setWho("");
    if (!title) return;
    setItems((prev) => [
      ...(prev ?? []),
      { id: `tmp-${Date.now()}`, title, person, since_ymd: today },
    ]);
    send("created", { title, person });
  }

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  const visible = done.merge(items ?? []);

  if (items === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  return (
    <div className="w-full min-w-0 pb-2">
      {visible.length === 0 && !adding ? (
        <EmptyAction onClick={() => setAdding(true)}>nothing pending — add one</EmptyAction>
      ) : (
        visible.map((w) => (
          <div
            key={w.id}
            className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
          >
            <button
              type="button"
              aria-label="resolve"
              onClick={() => resolve(w)}
              className="shrink-0 text-muted"
            >
              <Square size={19} strokeWidth={1.5} />
            </button>
            <span
              className={`min-w-0 flex-1 truncate font-sans ${textSize} ${
                done.has(w.id) ? "text-muted line-through" : "text-foreground"
              }`}
            >
              {w.title}
            </span>
            {w.person ? (
              <span className={`shrink-0 truncate font-sans ${textSize} text-muted`}>
                {w.person}
              </span>
            ) : null}
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {daysElapsed(w.since_ymd, today)}
            </span>
            <button
              type="button"
              aria-label="delete"
              onClick={() => remove(w)}
              className="shrink-0 font-mono text-[13px] text-muted opacity-40"
            >
              ×
            </button>
          </div>
        ))
      )}

      {adding ? (
        <div
          className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
        >
          <input
            autoFocus
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            placeholder="what"
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground placeholder:text-muted outline-none`}
          />
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="who"
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            className={`w-[90px] min-w-0 shrink-0 bg-transparent font-sans ${textSize} text-muted placeholder:text-muted outline-none`}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commitAdd}
            className="shrink-0 font-mono text-[11px] text-foreground"
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
          + add
        </button>
      )}
    </div>
  );
}
