import type { ReactNode } from "react";

export function Widget({
  label,
  children,
  dragHandle = false,
}: {
  label: string;
  children: ReactNode;
  dragHandle?: boolean;
}) {
  return (
    <section className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[6px] bg-card">
      <div
        className={`flex shrink-0 items-center justify-between border-b border-border px-4 py-2 ${
          dragHandle ? "widget-drag-handle cursor-move" : ""
        }`}
      >
        <span className="label-mono">{label}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
