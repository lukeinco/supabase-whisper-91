import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { mutate, UnauthorizedError, type DashboardState } from "@/lib/api";
import { useDashboardSync } from "@/lib/use-dashboard-sync";
import { useVisitCompleted } from "@/lib/visit-completed";
import { EmptyAction, focusCapture } from "./primitives";
import { GroupAddRow } from "./GroupAddRow";
import { EditControls, editFieldClass, useEditGesture, useEditing } from "./edit-mode";
import { moveBefore, useDragSort } from "./drag-sort";
import { applySort, SortControl, useSort } from "./sort-control";
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
  const edit = useEditing();
  const catEdit = useEditing();
  const [addingCat, setAddingCat] = useState(false);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const { sort, toggle } = useSort();
  const timers = useRef<Record<string, number>>({});

  const done = useVisitCompleted<BuyItem>();

  useDashboardSync(
    secret,
    useCallback((state: DashboardState) => {
      setBudgetCategories(normalizeBudgetCategories(state));
      setCategories(normalizeBuyCategories(state));
      setItems(normalizeBuyItems(state));
    }, []),
    onUnauthorized,
  );

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
        items: applySort(
          done
            .merge(items ?? [])
            .filter((b) => b.category_id === category.id)
            .sort((a, b) => a.position - b.position),
          sort,
          { price: (b) => b.price, date: (b) => b.created_at },
        ),
      })),
    [items, categories, done, sort],
  );

  /* ---- manual ordering: rows inside a category, and the categories themselves ---- */
  const itemDrag = useDragSort({
    enabled: sort.key === "manual",
    onOver: (id, overId) =>
      setItems((prev) =>
        prev ? moveBefore(prev, id, overId).map((x, i) => ({ ...x, position: i })) : prev,
      ),
    onDrop: () =>
      send("edited", { reorder: (items ?? []).map((x, i) => ({ id: x.id, position: i })) }),
  });

  const catDrag = useDragSort({
    onOver: (id, overId) =>
      setCategories((prev) => moveBefore(prev, id, overId).map((c, i) => ({ ...c, sort_order: i }))),
    onDrop: () =>
      sendCat("edited", {
        reorder: categories.map((c, i) => ({ id: c.id, sort_order: i, position: i })),
      }),
  });

  /** Close the amount row. The item itself stays put, struck through. */
  function drop(id: string) {
    const timer = timers.current[id];
    if (timer) clearTimeout(timer);
    delete timers.current[id];
    setPending((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  /** Checking off never blocks: cross out now, ask for the amount after. */
  function check(b: BuyItem) {
    if (pending[b.id]) return;
    if (done.has(b.id)) {
      done.unmark(b.id);
      send("edited", { id: b.id, purchased_at: null });
      return;
    }
    done.mark(b, (items ?? []).findIndex((x) => x.id === b.id));
    const cat = categories.find((c) => c.id === b.category_id);
    setPending((p) => ({
      ...p,
      [b.id]: {
        amount: b.price != null ? String(b.price) : "",
        budgetCategoryId: matchBudgetCategory(cat, budgetCategories),
        fading: false,
      },
    }));
    timers.current[b.id] = window.setTimeout(() => {
      send("purchased", { id: b.id });
      drop(b.id);
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

  function saveItem(b: BuyItem, title: string, priceText: string) {
    const clean = title.trim();
    const raw = priceText.trim();
    const price = raw === "" ? null : Number(raw.replace(/[^0-9.]/g, ""));
    const nextPrice = price !== null && Number.isFinite(price) ? price : null;
    edit.end();
    if (!clean) return;
    if (clean === b.title && nextPrice === b.price) return;
    setItems((prev) =>
      (prev ?? []).map((x) => (x.id === b.id ? { ...x, title: clean, price: nextPrice } : x)),
    );
    send("edited", { id: b.id, title: clean, estimated_amount: nextPrice });
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
    catEdit.end();
    if (!clean || clean === c.name) return;
    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: clean } : x)));
    sendCat("edited", { id: c.id, name: clean });
  }

  /** Deliberate path: create straight into a category. */
  function addTo(categoryId: string, title: string) {
    setItems((prev) => [
      ...(prev ?? []),
      {
        id: `tmp-${Date.now()}`,
        title,
        category_id: categoryId,
        position: prev?.length ?? 0,
      } as BuyItem,
    ]);
    send("created", { title, category_id: categoryId });
  }

  function removeCategory(c: BuyCategory) {
    setCategories((prev) => prev.filter((x) => x.id !== c.id));
    sendCat("deleted", { id: c.id });
    toast("category archived", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setCategories((prev) => [...prev, c].sort((a, b) => a.sort_order - b.sort_order));
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
    <div className="flex w-full items-center gap-2 px-4 pt-2">
      <input
        autoFocus
        placeholder="category"
        onKeyDown={(e) => {
          if (e.key === "Enter") addCategory(e.currentTarget.value);
          if (e.key === "Escape") setAddingCat(false);
        }}
        className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted outline-none"
      />
      <button
        type="button"
        onClick={(e) => {
          const input = e.currentTarget.parentElement?.querySelector("input");
          if (input) addCategory(input.value);
        }}
        className="shrink-0 font-mono text-[11px] text-muted"
      >
        save
      </button>
    </div>
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
          <EmptyAction onClick={() => setAddingCat(true)}>no categories — add one</EmptyAction>
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
      <div className="flex items-center justify-end px-4 pb-1">
        <SortControl sort={sort} toggle={toggle} />
      </div>
      <div className="flex flex-col gap-3 px-4">
        {grouped.map(({ category, items: list }) => (
          <div key={category.id} className="rounded-[6px] border border-muted/25">
            <div
              className={`flex touch-none items-center gap-2 px-3 pt-2 ${
                catDrag.dragId === category.id ? "opacity-60" : ""
              }`}
              ref={catEdit.editing === category.id ? catEdit.editRef : undefined}
              {...(catEdit.editing === category.id ? {} : catDrag.bind(category.id, "buy-category"))}
            >
              {catEdit.editing === category.id ? (
                <NameEdit
                  name={category.name}
                  onSave={(v) => renameCategory(category, v)}
                  onCancel={catEdit.end}
                />
              ) : (
                <>
                  <CategoryName
                    name={category.name}
                    onEnterEdit={() => catEdit.begin(category.id)}
                  />
                  <button
                    type="button"
                    aria-label="archive category"
                    onClick={() => removeCategory(category)}
                    className="shrink-0 font-mono text-[13px] text-muted opacity-40"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
            <div className="mt-1">
              {list.map((b) => {
                  const p = pending[b.id];
                  return (
                    <div key={b.id}>
                      <BuyRow
                        b={b}
                        rowH={rowH}
                        textSize={textSize}
                        struck={!!p || done.has(b.id)}
                        editing={edit.editing === b.id}
                        editRef={edit.editing === b.id ? edit.editRef : undefined}
                        onEnterEdit={() => edit.begin(b.id)}
                        onCancelEdit={edit.end}
                        onSave={(title, price) => saveItem(b, title, price)}
                        onCheck={() => check(b)}
                        onRemove={() => remove(b)}
                        dragging={itemDrag.dragId === b.id}
                        dragProps={
                          edit.editing === b.id ? {} : itemDrag.bind(b.id, `buy-${category.id}`)
                        }
                      />

                      {p ? (
                        <div className="flex h-[30px] w-full min-w-0 items-center gap-2 border-b border-border px-4">
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
                                [b.id]: {
                                  ...prev[b.id]!,
                                  budgetCategoryId: e.target.value || null,
                                },
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
                          <button
                            type="button"
                            onClick={() => confirmAmount(b)}
                            className="shrink-0 font-mono text-[11px] text-muted"
                          >
                            save
                          </button>
                        </div>

                      ) : null}
                    </div>
                  );
              })}
              <GroupAddRow
                rowH={rowH}
                textSize={textSize}
                label="+ add to this list"
                onSubmit={({ title }) => addTo(category.id, title)}
              />
            </div>
          </div>
        ))}
      </div>
      {addLink}
    </div>
  );
}

function CategoryName({ name, onEnterEdit }: { name: string; onEnterEdit: () => void }) {
  const gesture = useEditGesture(onEnterEdit);
  return (
    <span {...gesture} className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
      {name}
    </span>
  );
}

function NameEdit({
  name,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value);
          if (e.key === "Escape") onCancel();
        }}
        className={`${editFieldClass} font-mono text-[11px] text-foreground`}
      />
      <EditControls onSave={() => onSave(value)} onCancel={onCancel} />
    </>
  );
}

function BuyRow({
  b,
  rowH,
  textSize,
  struck,
  editing,
  editRef,
  onEnterEdit,
  onCancelEdit,
  onSave,
  onCheck,
  onRemove,
  dragging,
  dragProps,
}: {
  b: BuyItem;
  rowH: string;
  textSize: string;
  struck: boolean;
  editing: boolean;
  editRef: ((el: HTMLElement | null) => void) | undefined;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onSave: (title: string, price: string) => void;
  onCheck: () => void;
  onRemove: () => void;
  dragging: boolean;
  dragProps: Record<string, unknown>;
}) {
  const gesture = useEditGesture(onEnterEdit);
  const [value, setValue] = useState(b.title);
  const [price, setPrice] = useState(b.price != null ? String(b.price) : "");
  useEffect(() => {
    if (editing) {
      setValue(b.title);
      setPrice(b.price != null ? String(b.price) : "");
    }
  }, [editing, b.title, b.price]);

  return (
    <div
      ref={editing ? editRef : undefined}
      {...dragProps}
      className={`flex ${rowH} w-full min-w-0 touch-none items-center gap-2 border-b border-border px-4 ${
        dragging ? "opacity-60" : ""
      }`}
    >
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(value, price);
              if (e.key === "Escape") onCancelEdit();
            }}
            className={`${editFieldClass} font-sans ${textSize} text-foreground`}
          />
          <span className="shrink-0 font-mono text-[11px] text-muted">$</span>
          <input
            value={price}
            inputMode="decimal"
            placeholder="price"
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(value, price);
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-[56px] shrink-0 border-0 border-b border-muted bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted outline-none focus:outline-none"
          />
          <EditControls onSave={() => onSave(value, price)} onCancel={onCancelEdit} />
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label="purchased"
            onClick={onCheck}
            className="size-[13px] shrink-0 rounded-[2px] border border-muted/50"
          />
          <span
            {...gesture}
            className={`min-w-0 flex-1 truncate font-sans ${textSize} ${
              struck ? "text-muted line-through" : "text-foreground"
            }`}
          >
            {b.title}
          </span>
          {b.price != null ? (
            <span className="shrink-0 font-mono text-[11px] text-muted">
              ${b.price.toFixed(2).replace(/\.00$/, "")}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="delete"
            onClick={onRemove}
            className="shrink-0 font-mono text-[13px] text-muted opacity-40"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
