import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, resultId, UnauthorizedError } from "@/lib/api";
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
  type BudgetKind,
  type BudgetLine,
  type QueueCard,
} from "@/lib/budget";
import { EmptyAction, LoadingLine } from "./primitives";
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
  kind = "expense",
}: {
  secret: string;
  dense?: boolean;
  onUnauthorized?: () => void;
  kind?: BudgetKind;
}) {
  const income = kind === "income";
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
  const [potential, setPotential] = useState<{ cat: string; label: string; amount: string } | null>(
    null,
  );
  const [selling, setSelling] = useState<{ id: string; amount: string } | null>(null);

  const load = useCallback(() => {
    getState(secret)
      .then((state) => {
        setCats(normalizeBudgetCats(state, kind));
        // Merge, never clobber: rows created locally and not yet in the
        // snapshot survive until the snapshot actually contains them.
        setLines((prev) => {
          const fresh = normalizeBudgetLines(state);
          const known = new Set(fresh.map((l) => l.id));
          const localOnly = prev.filter((l) => l.id?.startsWith("tmp-") && !known.has(l.id));
          return [...fresh, ...localOnly];
        });
        setCards(income ? [] : normalizeQueueCards(state, "budget"));
      })
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        setCats([]);
      });
  }, [secret, onUnauthorized, kind, income]);

  useEffect(load, [load]);
  const dataVersion = useStateVersion();
  useEffect(() => {
    if (dataVersion > 0) load();
  }, [dataVersion, load]);

  // Month rollover: categories and their monthly budgets carry over untouched,
  // but the spend/received figures are month-scoped, so pull a fresh snapshot
  // the moment the Denver month changes — no reload needed.
  const firstMonth = useRef(month.prefix);
  useEffect(() => {
    if (firstMonth.current === month.prefix) return;
    firstMonth.current = month.prefix;
    setExpanded(null);
    setEntry({ amount: "", label: "", ymd: "" });
    void refreshState(secret).then(load).catch(() => undefined);
  }, [month.prefix, secret, load]);


  const earned = lines.filter((l) => !l.pending);
  const spend = spendByCategory(earned, month.prefix);

  if (cats === null) return <LoadingLine />;

  const totalSpent = cats.reduce((s, c) => s + (spend[c.id] ?? 0), 0);
  const totalBudget = cats.reduce((s, c) => s + c.monthly_budget, 0);
  const catIds = new Set(cats.map((c) => c.id));
  const pendingTotal = lines
    .filter((l) => l.pending && l.category_id && catIds.has(l.category_id))
    .reduce((s, l) => s + (l.potential_amount ?? 0), 0);
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
    setPotential(null);
    setSelling(null);
    setExpanded((prev) => (prev === id ? null : id));
  }

  async function sendLine(action: string, payload: Record<string, unknown>) {
    try {
      return await mutate(secret, "budget_line", action, payload);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized?.();
      throw e;
    }
  }

  function removeLine(l: BudgetLine) {
    if (!l.id || l.id.startsWith("tmp-")) return;
    const id = l.id;
    setLines((prev) => prev.filter((x) => x.id !== id));
    void sendLine("deleted", { id }).catch(() => setLines((prev) => [...prev, l]));
    toast("deleted", {
      duration: 5000,
      action: {
        label: "undo",
        onClick: () => {
          setLines((prev) => [...prev, l]);
          void sendLine("edited", { id, deleted_at: null }).catch(() => undefined);
        },
      },
    });
  }

  /** Swap an optimistic row for the real one the server returned. */
  function reconcile(tmpId: string, res: unknown) {
    const realId = resultId(res);
    setLines((prev) =>
      realId
        ? prev.map((x) => (x.id === tmpId ? { ...x, id: realId } : x))
        : prev.filter((x) => x.id !== tmpId),
    );
  }

  function addLine(categoryId: string) {
    const amount = Number(entry.amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount === 0) return;
    const label = entry.label.trim();
    const ymd = entry.ymd || today;
    setEntry({ amount: "", label: "", ymd: "" });
    amountRef.current?.focus();
    const tmpId = `tmp-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        id: tmpId,
        category_id: categoryId,
        amount,
        label,
        ymd,
        potential_amount: null,
        earned_at: income ? ymdToISO(ymd) : null,
        pending: false,
      },
    ]);
    void sendLine("created", {
      category_id: categoryId,
      amount,
      label,
      ...(income ? { earned_at: ymdToISO(ymd) } : { spent_on: ymd, spent_at: ymdToISO(ymd) }),
    })
      .then((res) => reconcile(tmpId, res))
      .catch(() => {
        setLines((prev) => prev.filter((x) => x.id !== tmpId));
        setEntry({ amount: String(amount), label, ymd });
      });
  }

  function addPotential(categoryId: string) {
    if (!potential) return;
    const amount = Number(potential.amount.replace(/[^0-9.]/g, ""));
    const label = potential.label.trim();
    if (!Number.isFinite(amount) || amount === 0 || !label) return;
    setPotential({ cat: categoryId, label: "", amount: "" });
    const tmpId = `tmp-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        id: tmpId,
        category_id: categoryId,
        amount: 0,
        label,
        ymd: today,
        potential_amount: amount,
        earned_at: null,
        pending: true,
      },
    ]);
    void sendLine("created", { category_id: categoryId, label, potential_amount: amount })
      .then((res) => reconcile(tmpId, res))
      .catch(() => {
        setLines((prev) => prev.filter((x) => x.id !== tmpId));
        setPotential({ cat: categoryId, label, amount: String(amount) });
      });
  }

  function confirmSold(l: BudgetLine) {
    if (!selling || !l.id) return;
    const amount = Number(selling.amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount === 0) return;
    const id = l.id;
    setSelling(null);
    setLines((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, amount, pending: false, earned_at: ymdToISO(today), ymd: today }
          : x,
      ),
    );
    void sendLine("earned", { id, amount }).catch(() => {
      setLines((prev) => prev.map((x) => (x.id === id ? l : x)));
    });
  }

  function startLineEdit(l: BudgetLine) {
    if (!l.id || l.id.startsWith("tmp-")) return;
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
      ...(ymd
        ? income
          ? { earned_at: ymdToISO(ymd) }
          : { spent_on: ymd, spent_at: ymdToISO(ymd) }
        : {}),
    }).catch(() => undefined);
  }

  async function save(id: string | null) {
    const payload = {
      ...(id ? { id } : {}),
      name: draft.name.trim(),
      monthly_budget: Number(draft.amount.replace(/[^0-9.]/g, "")) || 0,
      spread: draft.spread,
      kind,
    };
    edit.end();
    setAdding(false);
    if (!payload.name) return;
    const tmpId = `tmp-${Date.now()}`;
    setCats((prev) =>
      id
        ? (prev ?? []).map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: payload.name,
                  monthly_budget: payload.monthly_budget,
                  spread: payload.spread,
                }
              : c,
          )
        : [
            ...(prev ?? []),
            {
              id: tmpId,
              name: payload.name,
              monthly_budget: payload.monthly_budget,
              spread: payload.spread,
              position: (prev ?? []).length,
              kind,
            },
          ],
    );
    try {
      const res = await mutate(secret, "budget_category", id ? "edited" : "created", payload);
      if (!id) {
        const realId = resultId(res);
        setCats((prev) =>
          realId
            ? (prev ?? []).map((c) => (c.id === tmpId ? { ...c, id: realId } : c))
            : (prev ?? []).filter((c) => c.id !== tmpId),
        );
      }
    } catch (e) {
      if (!id) setCats((prev) => (prev ?? []).filter((c) => c.id !== tmpId));
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
        placeholder={income ? "monthly target" : "monthly amount"}
        inputMode="decimal"
        className="w-full border-0 border-b border-border bg-transparent pb-1 font-mono text-[12px] text-foreground placeholder:text-muted focus:outline-none"
      />
      <div className="flex items-center gap-4">
        {(income
          ? [
              { v: true, label: "arrives steadily" },
              { v: false, label: "arrives in chunks" },
            ]
          : [
              { v: true, label: "spread through month" },
              { v: false, label: "comes in chunks" },
            ]
        ).map((opt) => (
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
          <span className="font-sans text-[16px] text-foreground">
            {income ? `${month.name} — ${money(totalSpent)} received` : month.name}
          </span>
          {income ? null : (
            <span className="shrink-0 font-mono text-[12px] text-muted">
              {money(totalSpent)} / {money(totalBudget)}
              {overage > 0 ? <span className="text-accent"> · {money(-overage)}</span> : null}
            </span>
          )}
        </div>
        {income ? (
          pendingTotal > 0 ? (
            <p className="pt-1 font-mono text-[11px] text-[#5A5F68]">
              + {money(pendingTotal)} pending
            </p>
          ) : null
        ) : (
          <p className="pt-1 font-mono text-[11px] text-muted">
            day {month.day} of {month.days}
          </p>
        )}
      </div>

      {cats.length === 0 && !adding ? (
        <EmptyAction onClick={() => setAdding(true)}>
          {income ? "no income sources — add one" : "no categories — add one"}
        </EmptyAction>
      ) : (
        <ul className="w-full">
          {cats.map((c) => {
            const sp = spend[c.id] ?? 0;
            const over = !income && c.monthly_budget > 0 && sp > c.monthly_budget;
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
            const catLines = isOpen ? linesForCategory(earned, month.prefix, c.id) : [];
            const catPending = isOpen
              ? lines.filter((l) => l.pending && l.category_id === c.id)
              : [];
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
                    <CategoryName name={c.name} over={over} onEnterEdit={() => startEdit(c)} />
                    <span
                      className={`shrink-0 font-mono text-[12px] ${
                        over ? "text-accent" : "text-muted"
                      }`}
                    >
                      {money(sp)} of {money(c.monthly_budget)} ·{" "}
                      {income
                        ? remaining > 0
                          ? `${money(remaining)} to go`
                          : "met"
                        : money(remaining)}
                    </span>
                  </div>
                  <div className="pt-2">
                    <Bar ratio={ratio} over={over} tick={c.spread ? month.elapsedRatio : null} />
                  </div>
                  <p className="pt-1 font-mono text-[11px] text-muted">
                    {pct(ratio)} {income ? "received" : "spent"}
                    {c.spread ? ` · ${pct(month.elapsedRatio)} elapsed` : ""}
                  </p>
                </div>

                {isOpen ? (
                  <div className="w-full">
                    {catLines.length === 0 ? (
                      <p className="px-4 pb-1 font-mono text-[11px] text-muted">
                        {income ? "nothing received this month" : "no spending this month"}
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

                    {income && catPending.length > 0 ? (
                      <ul className="w-full border-t border-dashed border-[#3A3F48]">
                        {catPending.map((l) => (
                          <li
                            key={l.id ?? l.label}
                            className="flex min-h-[34px] w-full items-center gap-3 px-4"
                          >
                            <span className="size-[6px] shrink-0 rounded-full bg-[#5A5F68]" />
                            {selling && selling.id === l.id ? (
                              <>
                                <span className="shrink-0 font-mono text-[11px] text-muted">
                                  sold for $
                                </span>
                                <input
                                  autoFocus
                                  value={selling.amount}
                                  inputMode="decimal"
                                  onChange={(e) =>
                                    setSelling((p) => (p ? { ...p, amount: e.target.value } : p))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") confirmSold(l);
                                    if (e.key === "Escape") setSelling(null);
                                  }}
                                  className="w-16 shrink-0 border-0 border-b border-muted bg-transparent font-mono text-[12px] text-foreground outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => confirmSold(l)}
                                  className="shrink-0 font-mono text-[11px] text-foreground"
                                >
                                  confirm
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate font-sans text-[14px] text-[#8E949E]">
                                  {l.label}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-[#5A5F68]">
                                  pending {money(l.potential_amount ?? 0)}
                                </span>
                                <button
                                  type="button"
                                  disabled={!l.id || l.id.startsWith("tmp-")}
                                  onClick={() =>
                                    l.id &&
                                    setSelling({
                                      id: l.id,
                                      amount: String(l.potential_amount ?? ""),
                                    })
                                  }
                                  className="shrink-0 rounded-[3px] border border-border px-2 py-[2px] font-mono text-[11px] text-muted disabled:opacity-40"
                                >
                                  sold
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}

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

                    {income ? (
                      potential && potential.cat === c.id ? (
                        <div className="flex h-[34px] w-full items-center gap-3 border-t border-border px-4">
                          <input
                            autoFocus
                            value={potential.label}
                            onChange={(e) =>
                              setPotential((p) => (p ? { ...p, label: e.target.value } : p))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addPotential(c.id);
                              if (e.key === "Escape") setPotential(null);
                            }}
                            placeholder="what"
                            className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[14px] text-foreground placeholder:text-muted focus:outline-none"
                          />
                          <span className="font-mono text-[11px] text-muted">$</span>
                          <input
                            value={potential.amount}
                            inputMode="decimal"
                            onChange={(e) =>
                              setPotential((p) => (p ? { ...p, amount: e.target.value } : p))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addPotential(c.id);
                              if (e.key === "Escape") setPotential(null);
                            }}
                            placeholder="0"
                            className="w-14 shrink-0 border-0 bg-transparent font-mono text-[12px] text-foreground placeholder:text-muted focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => addPotential(c.id)}
                            className="shrink-0 font-mono text-[11px] text-muted"
                          >
                            save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPotential({ cat: c.id, label: "", amount: "" })}
                          className="block w-full px-4 py-2 text-left font-mono text-[10px] text-muted"
                        >
                          + add potential
                        </button>
                      )
                    ) : null}
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
          {income ? "+ add income source" : "+ add category"}
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

function LineRow({
  line,
  onEnterEdit,
  onDelete,
}: {
  line: BudgetLine;
  onEnterEdit: () => void;
  onDelete: () => void;
}) {
  const gesture = useEditGesture(onEnterEdit);
  const pendingSave = line.id?.startsWith("tmp-") ?? false;
  return (
    <li
      {...gesture}
      className={`flex h-[34px] w-full items-center gap-3 border-t border-border px-4 ${
        pendingSave ? "opacity-60" : ""
      }`}
    >
      <span className="shrink-0 font-mono text-[11px] text-muted">{shortDate(line.ymd)}</span>
      <span className="min-w-0 flex-1 truncate font-sans text-[14px] text-foreground">
        {line.label}
      </span>
      <span className="shrink-0 font-mono text-[12px] text-foreground">{money(line.amount)}</span>
      <button
        type="button"
        aria-label="delete"
        disabled={pendingSave}
        onClick={onDelete}
        className="shrink-0 font-mono text-[12px] text-muted opacity-40 transition-opacity hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}
