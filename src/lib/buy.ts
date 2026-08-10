export const BUY_CATEGORIES = ["grocery", "hardware", "household"] as const;
export type BuyCategory = (typeof BUY_CATEGORIES)[number];

export type BuyItem = {
  id: string;
  title: string;
  category: BuyCategory;
  position: number;
};

export type BudgetCategory = {
  id: string;
  name: string;
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function toCategory(v: unknown): BuyCategory {
  const s = (str(v) ?? "").toLowerCase();
  return (BUY_CATEGORIES as readonly string[]).includes(s) ? (s as BuyCategory) : "grocery";
}

export function normalizeBuyItems(state: unknown): BuyItem[] {
  const s = state as Raw | null;
  const raw = s?.["buy_items"] ?? s?.["buyItems"] ?? s?.["to_buy"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((b, i) => {
      const r = b as Raw;
      const id = str(r["id"]);
      if (!id) return null;
      if (r["deleted_at"] || r["purchased_at"]) return null;
      return {
        id,
        title: str(r["title"]) ?? str(r["text"]) ?? "",
        category: toCategory(r["category"] ?? r["buy_category"]),
        position: typeof r["position"] === "number" ? (r["position"] as number) : i,
      } satisfies BuyItem;
    })
    .filter((b): b is BuyItem => b !== null)
    .sort((a, b) => a.position - b.position);
}

export function normalizeBudgetCategories(state: unknown): BudgetCategory[] {
  const s = state as Raw | null;
  const raw = s?.["budgetCategories"] ?? s?.["budget_categories"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c) => {
      const r = c as Raw;
      const id = str(r["id"]);
      if (!id) return null;
      return { id, name: str(r["name"]) ?? "" } satisfies BudgetCategory;
    })
    .filter((c): c is BudgetCategory => c !== null);
}

/** Match a buy category to a budget category by name. */
export function matchBudgetCategory(
  category: BuyCategory,
  budgetCategories: BudgetCategory[],
): string | null {
  const hit = budgetCategories.find((c) => c.name.trim().toLowerCase() === category);
  return hit?.id ?? budgetCategories[0]?.id ?? null;
}
