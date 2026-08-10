import { useState } from "react";
import {
  EMPTY_DRAFT,
  downloadICS,
  googleCalendarUrl,
  type EventDraft,
} from "@/lib/calendar";

const FIELDS: { key: keyof EventDraft; label: string; placeholder: string }[] = [
  { key: "title", label: "title", placeholder: "" },
  { key: "date", label: "date", placeholder: "yyyy-mm-dd" },
  { key: "startTime", label: "start time", placeholder: "9:00a" },
  { key: "endTime", label: "end time", placeholder: "10:00a" },
  { key: "location", label: "location", placeholder: "" },
  { key: "guests", label: "guests", placeholder: "" },
  { key: "repeat", label: "repeat", placeholder: "weekly" },
  { key: "notes", label: "notes", placeholder: "" },
];

export function EventComposer({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);

  function set(key: keyof EventDraft, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/90 md:items-center md:bg-background/70"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-[85vh] md:w-[520px] md:rounded-[6px] md:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="label-mono">new event</span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] text-muted transition-colors hover:text-foreground"
          >
            close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex w-full flex-col gap-1">
                <span className="label-mono">{f.label}</span>
                <input
                  type="text"
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full max-w-full border-0 border-b border-border bg-transparent pb-1 font-sans text-[15px] text-foreground placeholder:text-muted focus:border-muted focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-4">
          <button
            type="button"
            onClick={() => {
              window.open(googleCalendarUrl(draft), "_blank", "noopener");
              onClose();
            }}
            className="w-full rounded-[6px] border border-border px-3 py-2 text-left font-mono text-[12px] text-foreground"
          >
            Add to Google Calendar
          </button>
          <button
            type="button"
            onClick={() => {
              downloadICS(draft);
              onClose();
            }}
            className="w-full rounded-[6px] border border-border px-3 py-2 text-left font-mono text-[12px] text-muted transition-colors hover:text-foreground"
          >
            Download .ics
          </button>
        </div>
      </div>
    </div>
  );
}
