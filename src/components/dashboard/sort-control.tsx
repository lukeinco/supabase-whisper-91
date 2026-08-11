import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, DollarSign } from "lucide-react";

export type SortKey = "manual" | "date" | "price";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const MANUAL: Sort = { key: "manual", dir: "asc" };

/** Cycle: off → ascending → descending → off. Manual order is always the fallback. */
export function useSort() {
  const [sort, setSort] = useState<Sort>(MANUAL);
  function toggle(key: Exclude<SortKey, "manual">) {
    setSort((s) =>
      s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : MANUAL,
    );
  }
  return { sort, toggle };
}

/**
 * Two flat icons, no chrome. Active is full-brightness --text against --muted,
 * with a small arrow for direction. Never accent — the accent is alarms only.
 */
export function SortControl({
  sort,
  toggle,
  keys = ["date", "price"],
}: {
  sort: Sort;
  toggle: (key: Exclude<SortKey, "manual">) => void;
  keys?: Exclude<SortKey, "manual">[];
}) {
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {keys.map((k) => {
        const active = sort.key === k;
        const Icon = k === "price" ? DollarSign : CalendarDays;
        return (
          <button
            key={k}
            type="button"
            aria-label={`sort by ${k}`}
            aria-pressed={active}
            onClick={() => toggle(k)}
            className={`flex items-center ${active ? "text-foreground" : "text-muted"}`}
          >
            <Icon size={13} strokeWidth={1.5} />
            {active ? <Arrow size={9} strokeWidth={2} /> : null}
          </button>
        );
      })}
    </span>
  );
}

type Get<T> = {
  date?: (item: T) => string | number | null;
  price?: (item: T) => number | null;
};

/** Sorted copy. Missing values always sink to the bottom, in either direction. */
export function applySort<T>(items: T[], sort: Sort, get: Get<T>): T[] {
  if (sort.key === "manual") return items;
  const read = sort.key === "price" ? get.price : get.date;
  if (!read) return items;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -sign : av > bv ? sign : 0;
  });
}
