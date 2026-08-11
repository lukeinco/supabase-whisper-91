import { useState } from "react";
import { denverISO, denverYMD } from "@/lib/denver";
import { reminderTimeLabel } from "@/lib/reminders";
import { TZ } from "@/lib/denver";

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });

/** "2:30 pm" today, otherwise "aug 12". */
function fireLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  return ymd === denverYMD() ? reminderTimeLabel(iso) : dayFmt.format(d).toLowerCase();
}
import { EmptyAction } from "./primitives";
import type { ReminderHub } from "./useReminderHub";

function defaultTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** Upcoming reminders, newest first. Same row grammar as the to-do list. */
export function ReminderList({ hub, dense = false }: { hub: ReminderHub; dense?: boolean }) {
  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";
  const list = hub.reminders;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(defaultTime);

  function save() {
    if (!title.trim()) return;
    const [h, m] = time.split(":");
    hub.addReminder(title, denverISO(denverYMD(), Number(h), Number(m)));
    setTitle("");
    setTime(defaultTime());
    setAdding(false);
  }

  const addRow = (
    <div className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}>
      <input
        autoFocus
        value={title}
        placeholder="reminder"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setAdding(false);
        }}
        className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground placeholder:text-muted outline-none`}
      />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-[84px] shrink-0 bg-transparent font-mono text-[11px] text-muted outline-none"
      />
      <button
        type="button"
        onClick={save}
        className="shrink-0 font-mono text-[11px] text-muted"
      >
        save
      </button>
    </div>
  );

  if (list.length === 0) {
    return adding ? (
      <div className="w-full min-w-0 pb-2">{addRow}</div>
    ) : (
      <EmptyAction onClick={() => setAdding(true)}>no reminders — add one</EmptyAction>
    );
  }


  return (
    <div className="w-full min-w-0 pb-2">
      {list.map((r) => {
        const passed = new Date(r.fire_at).getTime() <= Date.now();
        return (
          <div
            key={r.id}
            className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
          >
            <button
              type="button"
              aria-label="clear reminder"
              onClick={() => hub.clearReminder(r.id)}
              className="size-[14px] shrink-0 rounded-[3px] border border-border"
            />
            <span
              className="w-[54px] shrink-0 font-mono text-[11px]"
              style={{ color: passed ? "var(--accent)" : "var(--muted)" }}
            >
              {fireLabel(r.fire_at)}
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[14px] text-foreground">
              {r.title || "reminder"}
            </span>
            <button
              type="button"
              aria-label="delete reminder"
              onClick={() => hub.deleteReminder(r.id)}
              className="shrink-0 font-mono text-[13px] text-muted opacity-40"
            >
              ×
            </button>
          </div>
        );
      })}
      {adding ? (
        addRow
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-4 py-2 font-mono text-[11px] text-muted"
        >
          + reminder
        </button>
      )}
    </div>

  );
}
