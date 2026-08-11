import { reminderTimeLabel, type Reminder } from "@/lib/reminders";

/** The soonest reminder, with the same inverse row grammar: × left, ▢ right. */
export function NextReminder({
  reminder,
  onDismiss,
  onComplete,
}: {
  reminder: Reminder | null;
  onDismiss?: () => void;
  onComplete?: () => void;
}) {
  if (!reminder) return null;
  return (
    <div className="mx-4 mb-3 rounded-[6px] border border-muted/25 px-3 py-2">
      <p className="font-mono text-[11px] text-muted">
        next reminder · {reminderTimeLabel(reminder.fire_at)}
      </p>
      <div className="mt-1 flex w-full min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="dismiss reminder"
          onClick={onDismiss}
          className="shrink-0 font-mono text-[13px] text-muted opacity-40"
        >
          ×
        </button>
        <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
          {reminder.title}
        </span>
        <button
          type="button"
          aria-label="complete reminder"
          onClick={onComplete}
          className="size-[14px] shrink-0 rounded-[3px] border border-border"
        />
      </div>
    </div>
  );
}
