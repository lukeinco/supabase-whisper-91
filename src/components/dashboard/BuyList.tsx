import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
import { EmptyAction, focusCapture } from "./primitives";
import {
  matchBudgetCategory,
  normalizeBudgetCategories,
  normalizeBuyCategories,
  normalizeBuyItems,
  type BudgetCategory,
  type BuyCategory,
  type BuyItem,
} from "@/lib/buy";

type Props = {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
};

type Pending = {
  amount: string;
  budgetCategoryId: string | null;
  fading: boolean;
};

export function BuyList({ secret, dense = false, onUnauthorized }: Props) {
  const [items, setItems] = useState<BuyItem[] | null>(null);
  const [categories, setCategories] = useState<BuyCategory[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    getState(secret)
      .then((state) => {
        if (!active) return;
        setBudgetCategories(normalizeBudgetCategories(state));
        setCategories(normalizeBuyCategories(state));
        setItems(normalizeBuyItems(state));
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        setItems([]);
      });
    return () => {
      active = false;
    };
  }, [secret, onUnauthorized]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach((id) => clearTimeout(id));
    };
  }, []);

  const send = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "buy_item", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  const sendCat = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      mutate(secret, "buy_category", action, payload).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: (items ?? [])
          .filter((b) => b.category_id === category.id)
          .sort((a, b) => a.position - b.position),
      })),
    [items, categories],
  );

  function drop(id: string) {
    const timer = timers.current[id];
    if (timer) clearTimeout(timer);
    delete timers.current[id];
    setPending((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
  }

  /** Checking off never blocks: cross out now, ask for the amount after. */
  function check(b: BuyItem) {
    if (pending[b.id]) return;
    const cat = categories.find((c) => c.id === b.category_id);
    setPending((p) => ({
      ...p,
      [b.id]: {
        amount: "",
        budgetCategoryId: matchBudgetCategory(cat, budgetCategories),
        fading: false,
      },
    }));
    timers.current[b.id] = window.setTimeout(() => {
      setPending((p) => (p[b.id] ? { ...p, [b.id]: { ...p[b.id]!, fading: true } } : p));
      send("purchased", { id: b.id });
      window.setTimeout(() => drop(b.id), 220);
    }, 5000);
  }

  function confirmAmount(b: BuyItem) {
    const p = pending[b.id];
    if (!p) return;
    const amount = Number.parseFloat(p.amount);
    send("purchased", {
      id: b.id,
      ...(Number.isFinite(amount) ? { amount } : {}),
      ...(p.budgetCategoryId ? { budget_category_id: p.budgetCategoryId } : {}),
    });
    drop(b.id);
  }

  function remove(b: BuyItem) {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== b.id));
    send("deleted", { id: b.id });
    toast("deleted", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setItems((prev) => [...(prev ?? []), b]);
          send("edited", { id: b.id, deleted_at: null });
        },
      },
    });
  }

  function rename(b: BuyItem, title: string) {
    const clean = title.trim();
    setEditing(null);
    if (!clean || clean === b.title) return;
    setItems((prev) => (prev ?? []).map((x) => (x.id === b.id ? { ...x, title: clean } : x)));
    send("edited", { id: b.id, title: clean });
  }

  function addCategory(name: string) {
    const clean = name.trim();
    setAddingCat(false);
    if (!clean) return;
    const sort_order = categories.length;
    const id = `tmp-${Date.now()}`;
    setCategories((prev) => [
      ...prev,
      { id, name: clean, sort_order, default_budget_category_id: null },
    ]);
    sendCat("created", { name: clean, sort_order });
  }

  function renameCategory(c: BuyCategory, name: string) {
    const clean = name.trim();
    setEditingCat(null);
    if (!clean || clean === c.name) return;
    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: clean } : x)));
    sendCat("edited", { id: c.id, name: clean });
  }

  function removeCategory(c: BuyCategory) {
    setCategories((prev) => prev.filter((x) => x.id !== c.id));
    sendCat("deleted", { id: c.id });
    toast("category archived", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setCategories((prev) =>
            [...prev, c].sort((a, b) => a.sort_order - b.sort_order),
          );
          sendCat("edited", { id: c.id, deleted_at: null });
        },
      },
    });
  }

  const rowH = dense ? "h-[34px]" : "h-[46px]";
  const textSize = dense ? "text-[14px]" : "text-[15px]";

  if (items === null) {
    return <p className="px-4 py-3 font-mono text-[12px] text-muted">loading…</p>;
  }

  const addLink = addingCat ? (
    <input
      autoFocus
      placeholder="category"
      onBlur={(e) => addCategory(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") addCategory(e.currentTarget.value);
        if (e.key === "Escape") setAddingCat(false);
      }}
      className="w-full bg-transparent px-4 pt-2 font-mono text-[11px] text-foreground placeholder:text-muted outline-none"
    />
  ) : (
    <span
      role="link"
      tabIndex={0}
      onClick={() => setAddingCat(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setAddingCat(true);
      }}
      className="block cursor-pointer px-4 pt-2 font-mono text-[11px] text-muted"
    >
      + add category
    </span>
  );

  if (categories.length === 0) {
    return (
      <div className="w-full min-w-0 pb-2">
        {addingCat ? (
          addLink
        ) : (
          <EmptyAction onClick={() => setAddingCat(true)}>
            no categories — add one
          </EmptyAction>
        )}
      </div>
    );
  }

  const nothingToBuy = (items ?? []).length === 0;

  return (
    <div className="w-full min-w-0 pb-2">
      {nothingToBuy ? (
        <EmptyAction onClick={focusCapture}>nothing to buy — add one</EmptyAction>
      ) : null}
      <div className="flex flex-col gap-3 px-4">
        {grouped.map(({ category, items: list }) => (
          <div key={category.id} className="rounded-[6px] border border-muted/25">
            <div className="flex items-center gap-2 px-3 pt-2">
              {editingCat === category.id ? (
                <input
                  autoFocus
                  defaultValue={category.name}
                  onBlur={(e) => renameCategory(category, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameCategory(category, e.currentTarget.value);
                    if (e.key === "Escape") setEditingCat(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingCat(category.id)}
                  className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-muted"
                >
                  {category.name}
                </button>
              )}
              <button
                type="button"
                aria-label="archive category"
                onClick={() => removeCategory(category)}
                className="shrink-0 font-mono text-[13px] text-muted opacity-40"
              >
                ×
              </button>
            </div>
            <div className="mt-1">
              {list.length === 0 ? (
                <p className="px-3 pb-2 font-mono text-[11px] text-muted">empty</p>
              ) : (
                list.map((b) => {
                  const p = pending[b.id];
                  return (
                    <div
                      key={b.id}
                      className={p?.fading ? "opacity-0 transition-opacity duration-200" : ""}
                    >
                      <div
                        className={`flex ${rowH} w-full min-w-0 items-center gap-2 border-b border-border px-4`}
                      >
                        <button
                          type="button"
                          aria-label="purchased"
                          onClick={() => check(b)}
                          className="size-[13px] shrink-0 rounded-[2px] border border-muted/50"
                        />
                        {editing === b.id ? (
                          <input
                            autoFocus
                            defaultValue={b.title}
                            onBlur={(e) => rename(b, e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") rename(b, e.currentTarget.value);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className={`min-w-0 flex-1 bg-transparent font-sans ${textSize} text-foreground outline-none`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing(b.id)}
                            className={`min-w-0 flex-1 truncate text-left font-sans ${textSize} text-foreground ${
                              p ? "text-muted line-through" : ""
                            }`}
                          >
                            {b.title}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="delete"
                          onClick={() => remove(b)}
                          className="shrink-0 font-mono text-[13px] text-muted opacity-40"
                        >
                          ×
                        </button>
                      </div>

                      {p ? (
                        <div className="slide-row flex h-[30px] w-full min-w-0 items-center gap-2 border-b border-border px-4">
                          <span className="font-mono text-[11px] text-muted">$</span>
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={p.amount}
                            onChange={(e) =>
                              setPending((prev) => ({
                                ...prev,
                                [b.id]: { ...prev[b.id]!, amount: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmAmount(b);
                            }}
                            className="w-[70px] min-w-0 bg-transparent font-mono text-[12px] text-foreground outline-none"
                          />
                          <select
                            value={p.budgetCategoryId ?? ""}
                            onChange={(e) =>
                              setPending((prev) => ({
                                ...prev,
                                [b.id]: { ...prev[b.id]!, budgetCategoryId: e.target.value || null },
                              }))
                            }
                            className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-muted outline-none"
                          >
                            {budgetCategories.length === 0 ? (
                              <option value="">{category.name}</option>
                            ) : (
                              budgetCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
      {addLink}
    </div>
  );
}
