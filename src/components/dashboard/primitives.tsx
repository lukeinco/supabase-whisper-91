import type { ReactNode } from "react";

export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-3 font-mono text-[12px] text-muted">{children}</p>
  );
}

export function LoadingLine() {
  return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="label-mono">{children}</span>;
}
