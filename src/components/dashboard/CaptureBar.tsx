import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getState, mutate } from "@/lib/api";
import { denverISO } from "@/lib/denver";
import { normalizeBuyCategories, type BuyCategory } from "@/lib/buy";
import { EventComposer } from "./EventComposer";
import {
  formatChipDate,
  formatTimeLabel,
  formatToastDate,
  guessBuyCategory,
  parseCapture,
} from "@/lib/capture-parse";

type ChipMode = "date" | "categories" | "cycle" | "remind" | "none";

function useCaptureState(secret: string | null) {
  const [budgetCategories, setBudgetCategories] = useState<string[]>([]);
  const [buyCategories, setBuyCategories] = useState<BuyCategory[]>([]);
  useEffect(() => {
    if (!secret) return;
    let alive = true;
    getState(secret)
      .then((state) => {
        if (!alive || !state) return;
        setBuyCategories(normalizeBuyCategories(state));
        const raw = (state as Record<string, unknown>)["budget_categories"] ??
          (state as Record<string, unknown>)["budgetCategories"];
        if (Array.isArray(raw)) {
          setBudgetCategories(
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
  return { budgetCategories, buyCategories };
}

function localYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CaptureBar({ secret }: { secret?: string | null }) {
  const [value, setValue] = useState("");
  const [dueOverride, setDueOverride] = useState<Date | null>(null);
  const [catOverride, setCatOverride] = useState<string | null>(null);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [remind, setRemind] = useState(false);
  const [open, setOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { budgetCategories, buyCategories } = useCaptureState(secret ?? null);

  const parsed = useMemo(
    () => parseCapture(value, budgetCategories),
    [value, budgetCategories],
  );

  // reset overrides when the input text changes shape
  useEffect(() => {
    setDueOverride(null);
    setCatOverride(null);
    setCycleIndex(0);
    setRemind(false);
    setOpen(false);
  }, [parsed?.kind]);

  const buyGuess =
    parsed?.kind === "todo" ? guessBuyCategory(parsed.title, buyCategories) : null;
  const cycleOptions: (BuyCategory | null)[] = buyGuess
    ? [null, ...buyCategories]
    : [null];
  const cycleValue = cycleOptions[cycleIndex % cycleOptions.length] ?? null;

  const due = dueOverride ?? parsed?.due ?? null;
  const time = parsed?.time ?? null;
  const expenseCat = catOverride ?? parsed?.category ?? null;

  let chipLabel = "";
  let chipMode: ChipMode = "none";
  if (parsed?.kind === "expense") {
    chipLabel = `→ $${parsed.amount}${expenseCat ? ` · ${expenseCat}` : ""}`;
    chipMode = budgetCategories.length ? "categories" : "none";
  } else if (parsed && due && time) {
    chipLabel = remind
      ? `→ remind ${formatTimeLabel(time.hour, time.minute)}`
      : "→ to-do";
    chipMode = "remind";
  } else if (parsed && due) {
    chipLabel = `→ ${formatChipDate(due)}`;
    chipMode = "date";
  } else if (parsed) {
    chipLabel = `→ ${cycleValue?.name ?? "to-do"}`;
    chipMode = buyGuess ? "cycle" : "none";
  }

  async function commit() {
    if (!parsed || !secret) return;
    const snapshot = { parsed, due, time, expenseCat, cycleValue, remind };
    setValue("");
    setDueOverride(null);
    setCatOverride(null);
    setCycleIndex(0);
    setRemind(false);
    setOpen(false);

    let entity = "todo";
    let payload: Record<string, unknown>;
    let where: string;

    if (snapshot.parsed.kind === "expense") {
      entity = "expense";
      payload = {
        title: snapshot.parsed.title,
        amount: snapshot.parsed.amount,
        category: snapshot.expenseCat,
      };
      where = `expense · $${snapshot.parsed.amount}${
        snapshot.expenseCat ? ` · ${snapshot.expenseCat}` : ""
      }`;
    } else if (snapshot.remind && snapshot.due && snapshot.time) {
      entity = "reminder";
      const fireAt = denverISO(
        localYMD(snapshot.due),
        snapshot.time.hour,
        snapshot.time.minute,
      );
      payload = { title: snapshot.parsed.title, fire_at: fireAt };
      where = `reminder · ${formatToastDate(snapshot.due)} ${formatTimeLabel(
        snapshot.time.hour,
        snapshot.time.minute,
      )}`;
    } else if (snapshot.cycleValue) {
      entity = "buy_item";
      payload = {
        title: snapshot.parsed.title,
        category_id: snapshot.cycleValue.id,
      };
      where = snapshot.cycleValue.name;
    } else {
      payload = {
        title: snapshot.parsed.title,
        due_at: snapshot.due ? snapshot.due.toISOString() : null,
      };
      where = `to-do${snapshot.due ? ` · due ${formatToastDate(snapshot.due)}` : ""}`;
    }

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

        {chipMode === "remind" && (
          <button
            type="button"
            className="shrink-0"
            onClick={() => setRemind((r) => !r)}
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
