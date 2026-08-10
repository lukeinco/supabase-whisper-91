import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getState, mutate } from "@/lib/api";
import { EventComposer } from "./EventComposer";
import {
  BUY_CATEGORIES,
  formatChipDate,
  formatToastDate,
  guessBuyCategory,
  parseCapture,
  type BuyCategory,
} from "@/lib/capture-parse";

type ChipMode = "date" | "categories" | "cycle" | "none";

function useBudgetCategories(secret: string | null) {
  const [cats, setCats] = useState<string[]>([]);
  useEffect(() => {
    if (!secret) return;
    let alive = true;
    getState(secret)
      .then((state) => {
        if (!alive || !state) return;
        const raw = (state as Record<string, unknown>)["budget_categories"] ??
          (state as Record<string, unknown>)["budgetCategories"];
        if (Array.isArray(raw)) {
          setCats(
            raw
              .map((c) =>
                typeof c === "string" ? c : ((c as { name?: string })?.name ?? ""),
              )
              .filter(Boolean),
          );
        }
      })
      .catch(() => {
        /* empty state renders placeholders */
      });
    return () => {
      alive = false;
    };
  }, [secret]);
  return cats;
}

export function CaptureBar({ secret }: { secret?: string | null }) {
  const [value, setValue] = useState("");
  const [dueOverride, setDueOverride] = useState<Date | null>(null);
  const [catOverride, setCatOverride] = useState<string | null>(null);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const budgetCategories = useBudgetCategories(secret ?? null);

  const parsed = useMemo(
    () => parseCapture(value, budgetCategories),
    [value, budgetCategories],
  );

  // reset overrides when the input text changes shape
  useEffect(() => {
    setDueOverride(null);
    setCatOverride(null);
    setCycleIndex(0);
    setOpen(false);
  }, [parsed?.kind]);

  const buyGuess = parsed?.kind === "todo" ? guessBuyCategory(parsed.title) : null;
  const cycleOptions: (string | null)[] = buyGuess
    ? [null, ...BUY_CATEGORIES]
    : [null];
  const cycleValue = cycleOptions[cycleIndex % cycleOptions.length] ?? null;

  const due = dueOverride ?? parsed?.due ?? null;
  const expenseCat = catOverride ?? parsed?.category ?? null;

  let chipLabel = "";
  let chipMode: ChipMode = "none";
  if (parsed?.kind === "expense") {
    chipLabel = `→ $${parsed.amount}${expenseCat ? ` · ${expenseCat}` : ""}`;
    chipMode = budgetCategories.length ? "categories" : "none";
  } else if (parsed && due) {
    chipLabel = `→ ${formatChipDate(due)}`;
    chipMode = "date";
  } else if (parsed) {
    chipLabel = `→ ${cycleValue ?? "to-do"}`;
    chipMode = buyGuess ? "cycle" : "none";
  }

  async function commit() {
    if (!parsed || !secret) return;
    const snapshot = { parsed, due, expenseCat, cycleValue };
    setValue("");
    setDueOverride(null);
    setCatOverride(null);
    setCycleIndex(0);
    setOpen(false);

    const entity = snapshot.parsed.kind === "expense" ? "expense" : "todo";
    const payload =
      snapshot.parsed.kind === "expense"
        ? {
            title: snapshot.parsed.title,
            amount: snapshot.parsed.amount,
            category: snapshot.expenseCat,
          }
        : {
            title: snapshot.parsed.title,
            due_at: snapshot.due ? snapshot.due.toISOString() : null,
            category: snapshot.cycleValue,
          };

    const where =
      snapshot.parsed.kind === "expense"
        ? `expense · $${snapshot.parsed.amount}${snapshot.expenseCat ? ` · ${snapshot.expenseCat}` : ""}`
        : `${snapshot.cycleValue ?? "to-do"}${snapshot.due ? ` · due ${formatToastDate(snapshot.due)}` : ""}`;

    let id: string | null = null;
    try {
      const res = await mutate<{ id?: string } | null>(
        secret,
        entity,
        "created",
        payload,
      );
      id = res?.id ?? null;
    } catch {
      /* offline / function not deployed — still show where it landed */
    }

    toast(where, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          if (id) void mutate(secret, entity, "deleted", { id });
        },
      },
    });
  }

  const chip = chipLabel ? (
    <span className="shrink-0 font-mono text-[11px] text-muted">{chipLabel}</span>
  ) : null;

  return (
    <div className="w-full max-w-full overflow-hidden border-t border-border bg-background px-4 py-2">
      <div className="flex w-full max-w-full items-center gap-2 rounded-[6px] border border-border bg-card px-3 py-2">
        <input
          ref={inputRef}
          data-capture-input=""
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
          }}
          placeholder="Add anything…"
          className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-foreground placeholder:text-muted focus:outline-none"
        />

        {chipMode === "none" && chip}

        {chipMode === "cycle" && (
          <button
            type="button"
            className="shrink-0"
            onClick={() => setCycleIndex((i) => i + 1)}
          >
            {chip}
          </button>
        )}

        {(chipMode === "date" || chipMode === "categories") && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="shrink-0">
                {chip}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto rounded-[6px] border-border bg-card p-0 shadow-none"
            >
              {chipMode === "date" ? (
                <Calendar
                  mode="single"
                  selected={due ?? undefined}
                  onSelect={(d) => {
                    if (d) setDueOverride(d);
                    setOpen(false);
                  }}
                  className={cn("p-3 pointer-events-auto")}
                />
              ) : (
                <div className="flex min-w-[140px] flex-col py-1">
                  {budgetCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="px-3 py-2 text-left font-mono text-[11px] text-muted hover:text-foreground"
                      onClick={() => {
                        setCatOverride(c);
                        setOpen(false);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        <button
          type="button"
          aria-label="Voice capture"
          onClick={() => inputRef.current?.focus()}
          className="shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <Mic size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Add event"
          onClick={() => setComposerOpen(true)}
          className="shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <Plus size={18} strokeWidth={1.5} />
        </button>
      </div>
      {composerOpen ? <EventComposer onClose={() => setComposerOpen(false)} /> : null}
    </div>
  );
}
