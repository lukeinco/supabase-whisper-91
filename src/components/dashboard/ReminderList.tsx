import { reminderTimeLabel } from "@/lib/reminders";
import { EmptyAction, focusCapture } from "./primitives";
import type { ReminderHub } from "./useReminderHub";

/** Upcoming reminders, newest first. Same row grammar as the to-do list. */
export function ReminderList({ hub, dense = false }: { hub: ReminderHub; dense?: boolean }) {
  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";
  const list = hub.reminders;

  if (list.length === 0) {
    return (
      <EmptyAction onClick={() => focusCapture("remind me ")}>
        no reminders — add one
      </EmptyAction>
    );
  }

  return (
    <div className="w-full min-w-0 pb-2">
      {list.map((r) => (
        <div
          key={r.id}
          className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
        >
          <span className={`min-w-0 flex-1 truncate font-sans ${textSize} text-foreground`}>
            {r.title || "reminder"}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {reminderTimeLabel(r.fire_at)}
          </span>
          <button
            type="button"
            aria-label="clear reminder"
            onClick={() => hub.clearReminder(r.id)}
            className="shrink-0 font-mono text-[13px] text-muted opacity-40"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
