import type { ReactNode } from "react";

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 font-mono text-[12px] text-muted">{children}</p>;
}

/** Empty state that carries the action — a plain text link, never a button. */
export function EmptyAction({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`block cursor-pointer px-4 py-3 font-mono text-[12px] text-muted ${className}`}
    >
      {children}
    </span>
  );
}

/** Focus the capture bar, wherever it is rendered. */
export function focusCapture() {
  const el = document.querySelector<HTMLInputElement>("[data-capture-input]");
  el?.focus();
}

export function LoadingLine() {
  return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="label-mono">{children}</span>;
}
