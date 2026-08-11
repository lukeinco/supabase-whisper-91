import { useEffect } from "react";
import type { TabId } from "./TabBar";

const TAB_KEYS: Record<string, TabId> = {
  "1": "today",
  "2": "do",
  "3": "buy",
  "4": "budget",
  "5": "notes",
};

function inInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export type ShortcutHandlers = {
  onSearch: () => void;
  onHelp: () => void;
  onQueue: () => void;
  onEscape: () => void;
  onTab?: (tab: TabId) => void;
};

/** Global keyboard shortcuts. Every key except Escape is ignored in inputs. */
export function useShortcuts({ onSearch, onHelp, onQueue, onEscape, onTab }: ShortcutHandlers) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onEscape();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inInput(e.target)) return;

      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("[data-capture-input]");
        input?.focus();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        onHelp();
        return;
      }
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        onQueue();
        return;
      }
      const tab = TAB_KEYS[e.key];
      if (tab && onTab) {
        e.preventDefault();
        onTab(tab);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearch, onHelp, onQueue, onEscape, onTab]);
}
