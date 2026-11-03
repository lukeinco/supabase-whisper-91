import type { WidgetLayout } from "./api";

/** Keep budget first while preserving the size and relative order of other widgets. */
export function budgetFirstLayout(layout: WidgetLayout[]): WidgetLayout[] {
  const budget = layout.find((item) => item.i === "budget");
  if (!budget || (budget.x === 0 && budget.y === 0)) return layout;
  return layout.map((item) => item.i === "budget"
    ? { ...item, x: 0, y: 0 }
    : { ...item, y: item.y + budget.h });
}