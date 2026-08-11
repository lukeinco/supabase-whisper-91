import { toDenverYMD } from "./denver";

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type BudgetCat = {
  id: string;
  name: string;
  monthly_budget: number;
  spread: boolean;
  position: number;
};

export type BudgetLine = {
  id: string | null;
  category_id: string | null;
  amount: number;
  label: string;
  ymd: string | null;
};


export type QueueCard = {
  id: string;
  title: string;
  amount: number;
};

export function normalizeBudgetCats(state: unknown): BudgetCat[] {
  const s = state as Raw | null;
  const raw = s?.["budgetCategories"] ?? s?.["budget_categories"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c, i) => {
      const r = c as Raw;
      const id = str(r["id"]);
      if (!id || r["deleted_at"]) return null;
      return {
        id,
        name: str(r["name"]) ?? "",
        monthly_budget: num(r["monthly_budget"] ?? r["budget"] ?? r["amount"]),
        spread: r["spread"] !== false,
        position: typeof r["position"] === "number" ? (r["position"] as number) : i,
      } satisfies BudgetCat;
    })
    .filter((c): c is BudgetCat => c !== null)
    .sort((a, b) => a.position - b.position);
}

export function normalizeBudgetLines(state: unknown): BudgetLine[] {
  const s = state as Raw | null;
  const raw = s?.["budgetLines"] ?? s?.["budget_lines"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((l) => {
      const r = l as Raw;
      if (r["deleted_at"]) return null;
      return {
        id: str(r["id"]),
        category_id: str(r["budget_category_id"]) ?? str(r["category_id"]) ?? str(r["category"]),
        amount: num(r["amount"]),
        label: str(r["label"]) ?? str(r["title"]) ?? str(r["note"]) ?? "",
        ymd:
          (str(r["spent_on"]) ?? "").slice(0, 10) ||
          toDenverYMD(str(r["spent_at"]) ?? str(r["occurred_at"]) ?? str(r["created_at"])),

      } satisfies BudgetLine;

    })
    .filter((l): l is BudgetLine => l !== null);
}

export function normalizeQueueCards(state: unknown, kind = "budget"): QueueCard[] {
  const s = state as Raw | null;
  const raw = s?.["queueCards"] ?? s?.["queue_cards"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c) => {
      const r = c as Raw;
      const id = str(r["id"]);
      if (!id || r["deleted_at"] || r["dismissed_at"] || r["cleared_at"]) return null;
      if ((str(r["kind"]) ?? "").toLowerCase() !== kind) return null;
      const payload = (r["payload"] ?? {}) as Raw;
      return {
        id,
        title: str(r["title"]) ?? str(payload["title"]) ?? "",
        amount: num(r["amount"] ?? payload["overage"] ?? payload["amount"]),
      } satisfies QueueCard;
    })
    .filter((c): c is QueueCard => c !== null);
}

/* --------------------------------- month math -------------------------------- */

export type MonthInfo = {
  name: string;
  prefix: string; // "yyyy-mm"
  day: number;
  days: number;
  elapsedRatio: number;
};

const monthNameFmt = new Intl.DateTimeFormat("en-US", { month: "long" });

/** Everything derived from the current Denver date. */
export function monthInfo(todayYMD: string): MonthInfo {
  const [y, m, d] = todayYMD.split("-").map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  const day = d ?? 1;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    name: monthNameFmt.format(new Date(Date.UTC(year, month - 1, 1))),
    prefix: `${year}-${String(month).padStart(2, "0")}`,
    day,
    days,
    elapsedRatio: day / days,
  };
}

/** Month-to-date spend per category id. */
export function spendByCategory(lines: BudgetLine[], prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (!l.category_id || !l.ymd || !l.ymd.startsWith(prefix)) continue;
    out[l.category_id] = (out[l.category_id] ?? 0) + l.amount;
  }
  return out;
}

export function money(n: number): string {
  const rounded = Math.round(Math.abs(n));
  return `${n < 0 ? "−" : ""}$${rounded.toLocaleString("en-US")}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** This month's lines for one category, newest first. */
export function linesForCategory(
  lines: BudgetLine[],
  prefix: string,
  categoryId: string,
): BudgetLine[] {
  return lines
    .filter((l) => l.category_id === categoryId && l.ymd?.startsWith(prefix))
    .sort((a, b) => (b.ymd ?? "").localeCompare(a.ymd ?? ""));
}

const shortMonthFmt = new Intl.DateTimeFormat("en-US", { month: "short" });

/** "aug 8" */
export function shortDate(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${shortMonthFmt.format(new Date(Date.UTC(y, m - 1, 1))).toLowerCase()} ${d}`;
}

/** "yyyy-mm-dd" → an ISO timestamp at midday Denver, so the day never shifts. */
export function ymdToISO(ymd: string): string {
  return `${ymd}T18:00:00.000Z`;
}
