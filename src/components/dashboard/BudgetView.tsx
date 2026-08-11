import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
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
  type BudgetCat,
  type BudgetLine,
  type QueueCard,
} from "@/lib/budget";
import { EmptyAction, EmptyLine, LoadingLine } from "./primitives";


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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", amount: "", spread: true });
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ amount: string; label: string }>({ amount: "", label: "" });
  const amountRef = useRef<HTMLInputElement | null>(null);

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
    setEditing(c.id);
    setDraft({ name: c.name, amount: String(c.monthly_budget || ""), spread: c.spread });
  }

  function toggleExpand(id: string) {
    setEditing(null);
    setEntry({ amount: "", label: "" });
    setExpanded((prev) => (prev === id ? null : id));
  }

  async function sendLine(action: string, payload: Record<string, unknown>) {
    try {
      await mutate(secret, "budget_line", action, payload);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized?.();
    }
    load();
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
    setEntry({ amount: "", label: "" });
    amountRef.current?.focus();
    setLines((prev) => [
      ...prev,
      { id: null, category_id: categoryId, amount, label, ymd: today },
    ]);
    void sendLine("created", { category_id: categoryId, amount, label });
  }


  async function save(id: string | null) {
    const payload = {
      ...(id ? { id } : {}),
      name: draft.name.trim(),
      monthly_budget: Number(draft.amount.replace(/[^0-9.]/g, "")) || 0,
      spread: draft.spread,
    };
    setEditing(null);
    setAdding(false);
    if (!payload.name) return;
    try {
      await mutate(secret, "budget_category", id ? "edited" : "created", payload);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized?.();
    }
    load();
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
            setEditing(null);
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
                <li key={c.id} className="border-t border-border">
                  {editor(c.id)}
                </li>
              );
            }
            return (
              <li
                key={c.id}
                className={`w-full border-t border-border px-4 ${dense ? "py-2" : "py-3"}`}
              >
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="flex w-full items-baseline justify-between gap-3 text-left"
                >
                  <span
                    className={`min-w-0 flex-1 truncate font-sans text-[15px] ${
                      over ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {c.name}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[12px] ${
                      over ? "text-accent" : "text-muted"
                    }`}
                  >
                    {money(sp)} of {money(c.monthly_budget)} · {money(remaining)}
                  </span>
                </button>
                <div className="pt-2">
                  <Bar ratio={ratio} over={over} tick={c.spread ? month.elapsedRatio : null} />
                </div>
                <p className="pt-1 font-mono text-[11px] text-muted">
                  {pct(ratio)} spent
                  {c.spread ? ` · ${pct(month.elapsedRatio)} elapsed` : ""}
                </p>
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
            setEditing(null);
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
