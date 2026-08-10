import { reminderTimeLabel, type Reminder } from "@/lib/reminders";

export function NextReminder({ reminder }: { reminder: Reminder | null }) {
  if (!reminder) return null;
  return (
    <div className="mx-4 mb-3 rounded-[6px] border border-muted/25 px-3 py-2">
      <p className="font-mono text-[11px] text-muted">
        next reminder · {reminderTimeLabel(reminder.fire_at)}
      </p>
      <p className="mt-1 font-sans text-[15px] text-foreground">{reminder.title}</p>
    </div>
  );
}
