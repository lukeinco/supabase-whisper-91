import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getState, mutate, resultId, UnauthorizedError } from "@/lib/api";
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
  clearReminder: (id: string, intent?: "completed" | "dismissed") => void;
  deleteReminder: (id: string) => void;
  addReminder: (title: string, fireAt: string) => void;
  renameReminder: (id: string, title: string) => void;
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
    (entity: string, action: string, id: string, extra?: Record<string, unknown>) => {
      mutate(secret, entity, action, { id, ...extra }).catch((e: unknown) => {
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
        // Ten seconds of foreground time; inaction returns it to the widget, uncleared.
        duration: 10_000,
        cancel: {
          label: "×",
          onClick: () => {
            send("reminder", "cleared", r.id, { intent: "dismissed" });
            setResolved((prev) => new Set(prev).add(r.id));
          },
        },
        action: {
          label: "done",
          onClick: () => {
            send("reminder", "cleared", r.id, { intent: "completed" });
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
    (id: string, intent: "completed" | "dismissed" = "completed") => {
      send("reminder", "cleared", id, { intent });
      setResolved((prev) => new Set(prev).add(id));
    },
    [send],
  );

  const deleteReminder = useCallback(
    (id: string) => {
      send("reminder", "deleted", id);
      setResolved((prev) => new Set(prev).add(id));
      toast("deleted", {
        duration: 5000,
        action: {
          label: "undo",
          onClick: () => {
            mutate(secret, "reminder", "edited", { id, deleted_at: null }).catch(() => {});
            setResolved((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          },
        },
      });
    },
    [send, secret],
  );

  const addReminder = useCallback(
    (title: string, fireAt: string) => {
      const clean = title.trim();
      if (!clean) return;
      const tmpId = `tmp-${Date.now()}`;
      setReminders((prev) => [
        ...prev,
        {
          id: tmpId,
          title: clean,
          fire_at: fireAt,
          fireMs: new Date(fireAt).getTime(),
        } as Reminder,
      ]);
      mutate(secret, "reminder", "created", { title: clean, fire_at: fireAt })
        .then((res) => {
          const real = resultId(res);
          setReminders((prev) =>
            real
              ? prev.map((r) => (r.id === tmpId ? { ...r, id: real } : r))
              : prev.filter((r) => r.id !== tmpId),
          );
        })
        .catch((e: unknown) => {
          setReminders((prev) => prev.filter((r) => r.id !== tmpId));
          if (e instanceof UnauthorizedError) onUnauthorized?.();
        });
    },
    [secret, onUnauthorized],
  );



  const renameReminder = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, title: clean } : r)));
      mutate(secret, "reminder", "edited", { id, title: clean }).catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized?.();
      });
    },
    [secret, onUnauthorized],
  );

  return {
    next: nextReminder(reminders, now),
    reminders: reminders.filter((r) => !resolved.has(r.id)),
    clearReminder,
    deleteReminder,
    addReminder,
    renameReminder,
    cards: stack,
    count: stack.length,
    dismissed,
    clear,
    promote,
    keep,
  };
}
