import { useRef, useState } from "react";
import { formatToastDate, parseDate } from "@/lib/capture-parse";

type Props = {
  rowH: string;
  textSize: string;
  /** placeholder shown on the closed row, e.g. "+ add to this folder" */
  label: string;
  /** run the capture-bar date parse on the typed text */
  parseDates?: boolean;
  onSubmit: (value: { title: string; due: Date | null }) => void;
};

/**
 * The last row inside a group box. Closed it reads as muted placeholder text;
 * tapping turns the same row into an input without changing height or layout.
 * Enter commits and keeps the field open so several items can be typed in a row.
 */
export function GroupAddRow({ rowH, textSize, label, parseDates = false, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const hit = parseDates && value.trim() ? parseDate(value) : null;

  function commit() {
    const raw = value.trim();
    if (!raw) return;
    const title = hit ? raw.replace(hit.match, " ").replace(/\s+/g, " ").trim() || raw : raw;
    onSubmit({ title, due: hit?.date ?? null });
    setValue("");
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex ${rowH} w-full min-w-0 items-center px-4 text-left font-sans ${textSize} text-muted`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`flex ${rowH} w-full min-w-0 items-center gap-2 px-4`}>
      <input
        ref={inputRef}
        autoFocus
        value={value}
        placeholder={label}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground placeholder:text-muted outline-none`}
      />
      {hit ? (
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {formatToastDate(hit.date)}
        </span>
      ) : null}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="shrink-0 font-mono text-[11px] text-muted"
      >
        save
      </button>
    </div>
  );
}
