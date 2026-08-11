import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
import {
  dueReminderCards,
  nextReminder,
  normalizeReminders,
  normalizeReviewCards,
  type Reminder,
  type ReviewCard,
} from "@/lib/reminders";

export type ReminderHub = {
  next: Reminder | null;
  reminders: Reminder[];
  clearReminder: (id: string) => void;
  addReminder: (title: string, fireAt: string) => void;
  cards: ReviewCard[];
  count: number;
  dismissed: ReviewCard[];
  clear: (card: ReviewCard) => void;
  promote: (card: ReviewCard) => void;
  keep: (card: ReviewCard) => void;
};

const TICK_MS = 30_000;

/**
 * One fetch of reminders + queue cards per shell, polled every 30s.
 * Drives the next-reminder card, in-page alert toasts, and the review queue.
 */
export function useReminderHub(secret: string, onUnauthorized?: () => void): ReminderHub {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  const [dismissed, setDismissed] = useState<ReviewCard[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const alerted = useRef<Set<string>>(new Set());
  const started = useRef(Date.now());

  const load = useCallback(() => {
    getState(secret)
      .then((state) => {
        setReminders(normalizeReminders(state));
        setCards(normalizeReviewCards(state));
      })
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
  }, [secret, onUnauthorized]);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      setNow(Date.now());
      load();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [load]);

  const send = useCallback(
    (entity: string, action: string, id: string) => {
      mutate(secret, entity, action, { id }).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  // In-page alerts: a reminder whose fire_at passes while the app is open.
  useEffect(() => {
    for (const r of reminders) {
      if (r.fireMs > now) continue;
      if (r.fireMs < started.current) continue;
      if (alerted.current.has(r.id)) continue;
      alerted.current.add(r.id);
      toast(r.title || "reminder", {
        duration: Infinity,
        action: {
          label: "clear",
          onClick: () => {
            send("reminder", "cleared", r.id);
            setResolved((prev) => new Set(prev).add(r.id));
          },
        },
      });
    }
  }, [reminders, now, send]);

  const resolve = useCallback((card: ReviewCard, record: boolean) => {
    setResolved((prev) => new Set(prev).add(card.id));
    if (record) setDismissed((prev) => [card, ...prev]);
  }, []);

  const clear = useCallback(
    (card: ReviewCard) => {
      send(card.kind, "cleared", card.id);
      resolve(card, true);
    },
    [send, resolve],
  );

  const promote = useCallback(
    (card: ReviewCard) => {
      send("queue_card", "promoted", card.id);
      resolve(card, false);
    },
    [send, resolve],
  );

  const keep = useCallback(
    (card: ReviewCard) => {
      send("queue_card", "deferred", card.id);
      resolve(card, false);
    },
    [send, resolve],
  );

  const stack = [...dueReminderCards(reminders, now), ...cards].filter((c) => !resolved.has(c.id));

  const clearReminder = useCallback(
    (id: string) => {
      send("reminder", "cleared", id);
      setResolved((prev) => new Set(prev).add(id));
    },
    [send],
  );

  const addReminder = useCallback(
    (title: string, fireAt: string) => {
      const clean = title.trim();
      if (!clean) return;
      setReminders((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          title: clean,
          fire_at: fireAt,
          fireMs: new Date(fireAt).getTime(),
        } as Reminder,
      ]);
      mutate(secret, "reminder", "created", { title: clean, fire_at: fireAt })
        .then(() => load())
        .catch((e: unknown) => {
          if (e instanceof UnauthorizedError) onUnauthorized?.();
        });
    },
    [secret, onUnauthorized, load],
  );



  return {
    next: nextReminder(reminders, now),
    reminders: reminders.filter((r) => !resolved.has(r.id)),
    clearReminder,
    addReminder,
    cards: stack,
    count: stack.length,
    dismissed,
    clear,
    promote,
    keep,
  };
}
