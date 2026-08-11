import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
import { useStateVersion } from "@/lib/state-cache";
import { useDenverToday } from "@/lib/denver";
import {
  linesForCategory,
  money,
  monthInfo,
  normalizeBudgetCats,
  normalizeBudgetLines,
  normalizeQueueCards,
  pct,
  shortDate,
  spendByCategory,
  ymdToISO,
  type BudgetCat,
  type BudgetLine,
  type QueueCard,
} from "@/lib/budget";
import { EmptyAction, EmptyLine, LoadingLine } from "./primitives";
import { EditControls, editFieldClass, useEditGesture, useEditing } from "./edit-mode";


type Draft = { name: string; amount: string; spread: boolean };

function Bar({ ratio, over, tick }: { ratio: number; over: boolean; tick: number | null }) {
  return (
    <div className="relative h-[6px] w-full max-w-full rounded-[3px] bg-muted/20">
      <div
        className={`h-full rounded-[3px] ${over ? "bg-accent" : "bg-muted"}`}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
      {tick !== null ? (
        <span
          className="absolute top-0 h-full w-px bg-foreground"
          style={{ left: `${Math.min(100, Math.max(0, tick * 100))}%` }}
        />
      ) : null}
    </div>
  );
}

export function BudgetView({
  secret,
  dense = false,
  onUnauthorized,
}: {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
}) {
  const today = useDenverToday();
  const month = monthInfo(today);

  const [cats, setCats] = useState<BudgetCat[] | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [cards, setCards] = useState<QueueCard[]>([]);
  const edit = useEditing();
  const editing = edit.editing;
  const [draft, setDraft] = useState<Draft>({ name: "", amount: "", spread: true });
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ amount: string; label: string; ymd: string }>({
    amount: "",
    label: "",
    ymd: "",
  });
  const amountRef = useRef<HTMLInputElement | null>(null);
  const lineEdit = useEditing();
  const [lineDraft, setLineDraft] = useState<{ amount: string; label: string; ymd: string }>({
    amount: "",
    label: "",
    ymd: "",
  });

  const load = useCallback(() => {
    getState(secret)
      .then((state) => {
        setCats(normalizeBudgetCats(state));
        setLines(normalizeBudgetLines(state));
        setCards(normalizeQueueCards(state, "budget"));
      })
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        setCats([]);
      });
  }, [secret, onUnauthorized]);

  useEffect(load, [load]);
  const dataVersion = useStateVersion();
  useEffect(() => {
    if (dataVersion > 0) load();
  }, [dataVersion, load]);

  const spend = spendByCategory(lines, month.prefix);


  if (cats === null) return <LoadingLine />;

  const totalSpent = cats.reduce((s, c) => s + (spend[c.id] ?? 0), 0);
  const totalBudget = cats.reduce((s, c) => s + c.monthly_budget, 0);
  const overage = cats.reduce((s, c) => {
    const sp = spend[c.id] ?? 0;
    return s + (c.monthly_budget > 0 && sp > c.monthly_budget ? sp - c.monthly_budget : 0);
  }, 0);

  function startEdit(c: BudgetCat) {
    setAdding(false);
    edit.begin(c.id);
    setDraft({ name: c.name, amount: String(c.monthly_budget || ""), spread: c.spread });
  }

  function toggleExpand(id: string) {
    edit.end();
    lineEdit.end();
    setEntry({ amount: "", label: "", ymd: "" });
    setExpanded((prev) => (prev === id ? null : id));
  }

  async function sendLine(action: string, payload: Record<string, unknown>) {
    try {
      await mutate(secret, "budget_line", action, payload);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized?.();
    }
  }

  function removeLine(l: BudgetLine) {
    if (!l.id) return;
    const id = l.id;
    setLines((prev) => prev.filter((x) => x.id !== id));
    void sendLine("deleted", { id });
    toast("deleted", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setLines((prev) => [...prev, l]);
          void sendLine("edited", { id, deleted_at: null });
        },
      },
    });
  }

  function addLine(categoryId: string) {
    const amount = Number(entry.amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount === 0) return;
    const label = entry.label.trim();
    const ymd = entry.ymd || today;
    setEntry({ amount: "", label: "", ymd: "" });
    amountRef.current?.focus();
    setLines((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, category_id: categoryId, amount, label, ymd },
    ]);
    void sendLine("created", { category_id: categoryId, amount, label, spent_at: ymdToISO(ymd) });
  }

  function startLineEdit(l: BudgetLine) {
    if (!l.id) return;
    lineEdit.begin(l.id);
    setLineDraft({ amount: String(l.amount || ""), label: l.label, ymd: l.ymd ?? "" });
  }

  function saveLine(l: BudgetLine) {
    const id = l.id;
    if (!id) return;
    const amount = Number(lineDraft.amount.replace(/[^0-9.]/g, ""));
    const label = lineDraft.label.trim();
    const ymd = lineDraft.ymd || l.ymd;
    lineEdit.end();
    setLines((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, amount: Number.isFinite(amount) ? amount : x.amount, label, ymd }
          : x,
      ),
    );
    void sendLine("edited", {
      id,
      amount: Number.isFinite(amount) ? amount : l.amount,
      label,
      ...(ymd ? { spent_at: ymdToISO(ymd) } : {}),
    });
  }



  async function save(id: string | null) {
    const payload = {
      ...(id ? { id } : {}),
      name: draft.name.trim(),
      monthly_budget: Number(draft.amount.replace(/[^0-9.]/g, "")) || 0,
      spread: draft.spread,
    };
    edit.end();
    setAdding(false);
    if (!payload.name) return;
    // Update in place; no refetch, which would remount every row.
    setCats((prev) =>
      id
        ? (prev ?? []).map((c) =>
            c.id === id
              ? { ...c, name: payload.name, monthly_budget: payload.monthly_budget, spread: payload.spread }
              : c,
          )
        : [
            ...(prev ?? []),
            {
              id: `tmp-${Date.now()}`,
              name: payload.name,
              monthly_budget: payload.monthly_budget,
              spread: payload.spread,
            } as (typeof prev extends (infer U)[] | null ? U : never),
          ],
    );
    try {
      await mutate(secret, "budget_category", id ? "edited" : "created", payload);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized?.();
    }
  }

  const editor = (id: string | null) => (
    <div className="flex flex-col gap-2 px-4 py-3">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder="name"
        className="w-full border-0 border-b border-border bg-transparent pb-1 font-sans text-[15px] text-foreground placeholder:text-muted focus:outline-none"
      />
      <input
        value={draft.amount}
        onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
        placeholder="monthly amount"
        inputMode="decimal"
        className="w-full border-0 border-b border-border bg-transparent pb-1 font-mono text-[12px] text-foreground placeholder:text-muted focus:outline-none"
      />
      <div className="flex items-center gap-4">
        {[
          { v: true, label: "spread through month" },
          { v: false, label: "comes in chunks" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, spread: opt.v }))}
            className={`font-mono text-[11px] ${
              draft.spread === opt.v ? "text-foreground" : "text-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={() => void save(id)}
          className="font-mono text-[11px] text-foreground"
        >
          save
        </button>
        <button
          type="button"
          onClick={() => {
            edit.end();
            setAdding(false);
          }}
          className="font-mono text-[11px] text-muted"
        >
          cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full">
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-sans text-[16px] text-foreground">{month.name}</span>
          <span className="shrink-0 font-mono text-[12px] text-muted">
            {money(totalSpent)} / {money(totalBudget)}
            {overage > 0 ? <span className="text-accent"> · {money(-overage)}</span> : null}
          </span>
        </div>
        <p className="pt-1 font-mono text-[11px] text-muted">
          day {month.day} of {month.days}
        </p>
      </div>

      {cats.length === 0 && !adding ? (
        <EmptyAction onClick={() => setAdding(true)}>no categories — add one</EmptyAction>
      ) : (
        <ul className="w-full">
          {cats.map((c) => {
            const sp = spend[c.id] ?? 0;
            const over = c.monthly_budget > 0 && sp > c.monthly_budget;
            const remaining = c.monthly_budget - sp;
            const ratio = c.monthly_budget > 0 ? sp / c.monthly_budget : 0;
            if (editing === c.id) {
              return (
                <li key={c.id} ref={edit.editRef} className="border-t border-border">
                  {editor(c.id)}
                </li>
              );
            }
            const isOpen = expanded === c.id;
            const catLines = isOpen ? linesForCategory(lines, month.prefix, c.id) : [];
            return (
              <li key={c.id} className="w-full border-t border-border">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(c.id);
                    }
                  }}
                  className={`w-full cursor-pointer px-4 ${dense ? "py-2" : "py-3"}`}
                >
                  <div className="flex w-full items-baseline justify-between gap-3 text-left">
                    <CategoryName
                      name={c.name}
                      over={over}
                      onEnterEdit={() => startEdit(c)}
                    />
                    <span
                      className={`shrink-0 font-mono text-[12px] ${
                        over ? "text-accent" : "text-muted"
                      }`}
                    >
                      {money(sp)} of {money(c.monthly_budget)} · {money(remaining)}
                    </span>
                  </div>
                  <div className="pt-2">
                    <Bar ratio={ratio} over={over} tick={c.spread ? month.elapsedRatio : null} />
                  </div>
                  <p className="pt-1 font-mono text-[11px] text-muted">
                    {pct(ratio)} spent
                    {c.spread ? ` · ${pct(month.elapsedRatio)} elapsed` : ""}
                  </p>
                </div>

                {isOpen ? (
                  <div className="w-full">
                    {catLines.length === 0 ? (
                      <p className="px-4 pb-1 font-mono text-[11px] text-muted">
                        no spending this month
                      </p>
                    ) : (
                      <ul className="w-full">
                        {catLines.map((l) => {
                          const key = l.id ?? `${l.ymd}-${l.label}-${l.amount}`;
                          if (l.id && lineEdit.editing === l.id) {
                            return (
                              <li
                                key={key}
                                ref={lineEdit.editRef}
                                className="flex min-h-[34px] w-full items-center gap-2 border-t border-border px-4 py-1"
                              >
                                <input
                                  type="date"
                                  value={lineDraft.ymd}
                                  onChange={(e) =>
                                    setLineDraft((p) => ({ ...p, ymd: e.target.value }))
                                  }
                                  className="shrink-0 border-0 border-b border-muted bg-transparent font-mono text-[11px] text-foreground outline-none"
                                />
                                <input
                                  value={lineDraft.label}
                                  onChange={(e) =>
                                    setLineDraft((p) => ({ ...p, label: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveLine(l);
                                    if (e.key === "Escape") lineEdit.end();
                                  }}
                                  placeholder="what"
                                  className={`${editFieldClass} font-sans text-[14px] text-foreground placeholder:text-muted`}
                                />
                                <input
                                  autoFocus
                                  value={lineDraft.amount}
                                  onChange={(e) =>
                                    setLineDraft((p) => ({ ...p, amount: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveLine(l);
                                    if (e.key === "Escape") lineEdit.end();
                                  }}
                                  inputMode="decimal"
                                  className="w-14 shrink-0 border-0 border-b border-muted bg-transparent font-mono text-[12px] text-foreground outline-none"
                                />
                                <EditControls
                                  onSave={() => saveLine(l)}
                                  onCancel={() => lineEdit.end()}
                                />
                              </li>
                            );
                          }
                          return (
                            <LineRow
                              key={key}
                              line={l}
                              onEnterEdit={() => startLineEdit(l)}
                              onDelete={() => removeLine(l)}
                            />
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex h-[34px] w-full items-center gap-3 border-t border-border px-4">
                      <span className="font-mono text-[11px] text-muted">$</span>
                      <input
                        ref={amountRef}
                        value={entry.amount}
                        onChange={(e) => setEntry((p) => ({ ...p, amount: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addLine(c.id);
                        }}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-14 shrink-0 border-0 bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted focus:outline-none"
                      />
                      <input
                        value={entry.label}
                        onChange={(e) => setEntry((p) => ({ ...p, label: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addLine(c.id);
                        }}
                        placeholder="what"
                        className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[14px] text-foreground placeholder:text-muted focus:outline-none"
                      />
                      <input
                        type="date"
                        value={entry.ymd}
                        onChange={(e) => setEntry((p) => ({ ...p, ymd: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addLine(c.id);
                        }}
                        aria-label="date"
                        className="shrink-0 border-0 bg-transparent font-mono text-[11px] text-muted focus:outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => addLine(c.id)}
                        className="shrink-0 font-mono text-[11px] text-muted"
                      >
                        save
                      </button>
                    </div>

                  </div>
                ) : null}
              </li>
            );

          })}
        </ul>
      )}

      {adding ? (
        <div className="border-t border-border">{editor(null)}</div>
      ) : (
        <button
          type="button"
          onClick={() => {
            edit.end();
            setAdding(true);
            setDraft({ name: "", amount: "", spread: true });
          }}
          className="block w-full px-4 py-3 text-left font-mono text-[11px] text-muted transition-colors hover:text-foreground"
        >
          + add category
        </button>
      )}

      {cards.length > 0 ? (
        <ul className="w-full">
          {cards.map((card) => (
            <li key={card.id} className="w-full border-t border-border px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
                  {card.title}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-accent">
                  {money(-Math.abs(card.amount))}
                </span>
              </div>
              <p className="pt-1 font-mono text-[11px] text-muted">clears when back in budget</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CategoryName({
  name,
  over,
  onEnterEdit,
}: {
  name: string;
  over: boolean;
  onEnterEdit: () => void;
}) {
  const gesture = useEditGesture(onEnterEdit);
  return (
    <span
      {...gesture}
      className={`min-w-0 flex-1 truncate font-sans text-[15px] ${
        over ? "text-accent" : "text-foreground"
      }`}
    >
      {name}
    </span>
  );
}
