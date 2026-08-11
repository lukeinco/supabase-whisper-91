import { Home, ListChecks, ShoppingCart, DollarSign, StickyNote } from "lucide-react";

export type TabId = "today" | "do" | "buy" | "budget" | "notes";

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: "today", label: "today", Icon: Home },
  { id: "do", label: "do", Icon: ListChecks },
  { id: "buy", label: "buy", Icon: ShoppingCart },
  { id: "budget", label: "budget", Icon: DollarSign },
  { id: "notes", label: "notes", Icon: StickyNote },
];

export function TabBar({
  active,
  onChange,
  badges,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  badges?: Partial<Record<TabId, boolean>>;
}) {
  return (
    <nav className="w-full border-t border-border bg-background">
      <ul className="flex w-full items-stretch">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <li key={id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 pb-5 pt-2 ${
                  isActive ? "text-foreground" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={1.5} />
                  {badges?.[id] ? (
                    <span className="absolute -right-1 -top-0.5 block h-1.5 w-1.5 rounded-full bg-accent" />
                  ) : null}
                </span>
                <span className="font-mono text-[11px] leading-none">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
