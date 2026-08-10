import { Mic, Plus } from "lucide-react";

export function CaptureBar() {
  return (
    <div className="w-full border-t border-border bg-background px-4 py-2">
      <div className="flex w-full items-center gap-2 rounded-[6px] border border-border bg-card px-3 py-2">
        <input
          type="text"
          placeholder="Add anything…"
          className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-foreground placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          aria-label="Voice capture"
          className="shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <Mic size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Add"
          className="shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <Plus size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
