export type BuyCategory = {
  id: string;
  name: string;
  sort_order: number;
  default_budget_category_id: string | null;
};

export type BuyItem = {
  id: string;
  title: string;
  category_id: string | null;
  position: number;
  /** Optional expected price, shown on the row and prefilled when checked off. */
  price: number | null;
  /** When the item was captured — the "date" sort key for buy rows. */
  created_at: string | null;
};

export type BudgetCategory = {
  id: string;
  name: string;
};

type Raw = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function normalizeBuyCategories(state: unknown): BuyCategory[] {
  const s = state as Raw | null;
  const raw = s?.["buyCategories"] ?? s?.["buy_categories"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((c, i) => {
      const r = c as Raw;
      const id = str(r["id"]);
      if (!id) return null;
      if (r["deleted_at"] || r["archived_at"]) return null;
      return {
        id,
        name: str(r["name"]) ?? "category",
        sort_order: typeof r["sort_order"] === "number" ? (r["sort_order"] as number) : i,
        default_budget_category_id: str(r["default_budget_category_id"]),
      } satisfies BuyCategory;
    })
    .filter((c): c is BuyCategory => c !== null)
    .sort((a, b) => a.sort_order - b.sort_order);
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
        category_id: str(r["category_id"]) ?? str(r["buy_category_id"]),
        position: typeof r["position"] === "number" ? (r["position"] as number) : i,
        price: num(r["estimated_amount"] ?? r["price"] ?? r["amount"]),
        created_at: str(r["created_at"] ?? r["inserted_at"]),
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

/** Budget category for a buy category: explicit default, else name match. */
export function matchBudgetCategory(
  category: BuyCategory | undefined,
  budgetCategories: BudgetCategory[],
): string | null {
  if (!category) return budgetCategories[0]?.id ?? null;
  if (category.default_budget_category_id) return category.default_budget_category_id;
  const name = category.name.trim().toLowerCase();
  const hit = budgetCategories.find((c) => c.name.trim().toLowerCase() === name);
  return hit?.id ?? budgetCategories[0]?.id ?? null;
}
