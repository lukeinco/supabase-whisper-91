import { toDenverYMD } from "./denver";

export type Todo = {
  id: string;
  title: string;
  folder_id: string | null;
  due_ymd: string | null;
  position: number;
  recur_rule: string | null;
  deferred_count: number;
  deferral_history: unknown[];
};

export type Folder = {
  id: string;
  name: string;
  sort_order: number;
};

export const UNFILED: Folder = { id: "unfiled", name: "unfiled", sort_order: 1e9 };

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function normalizeFolders(state: unknown): Folder[] {
  const raw = (state as Raw | null)?.["folders"];
  const list = Array.isArray(raw) ? raw : [];
  const folders = list
    .map((f) => {
      const r = f as Raw;
      const id = str(r["id"]);
      if (!id) return null;
      return {
        id,
        name: str(r["name"]) ?? "folder",
        sort_order: typeof r["sort_order"] === "number" ? (r["sort_order"] as number) : 0,
      } satisfies Folder;
    })
    .filter((f): f is Folder => f !== null)
    .filter((f) => f.id !== UNFILED.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  return [...folders, UNFILED];
}

export function normalizeTodos(state: unknown): Todo[] {
  const raw = (state as Raw | null)?.["todos"] ?? (state as Raw | null)?.["items"];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((t, i) => {
      const r = t as Raw;
      const id = str(r["id"]);
      if (!id) return null;
      if (r["deleted_at"] || r["completed_at"]) return null;
      return {
        id,
        title: str(r["title"]) ?? str(r["text"]) ?? "",
        folder_id: str(r["folder_id"]),
        due_ymd: toDenverYMD(str(r["due_at"]) ?? str(r["due_date"])),
        position: typeof r["position"] === "number" ? (r["position"] as number) : i,
        recur_rule: str(r["recur_rule"]),
        deferred_count:
          typeof r["deferred_count"] === "number" ? (r["deferred_count"] as number) : 0,
        deferral_history: Array.isArray(r["deferral_history"])
          ? (r["deferral_history"] as unknown[])
          : [],
      } satisfies Todo;
    })
    .filter((t): t is Todo => t !== null)
    .sort((a, b) => a.position - b.position);
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days, 12));
  return dt.toISOString().slice(0, 10);
}

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1 + months, d ?? 1, 12));
  return dt.toISOString().slice(0, 10);
}

/**
 * Next occurrence for a simple recur_rule: "daily", "weekly", "biweekly",
 * "monthly", "yearly", or "every N days|weeks|months".
 */
export function nextOccurrence(rule: string, fromYMD: string): string | null {
  const r = rule.trim().toLowerCase();
  const every = r.match(/every\s+(\d+)\s*(day|week|month|year)s?/);
  if (every) {
    const n = Number(every[1]);
    switch (every[2]) {
      case "day":
        return addDays(fromYMD, n);
      case "week":
        return addDays(fromYMD, n * 7);
      case "month":
        return addMonths(fromYMD, n);
      default:
        return addMonths(fromYMD, n * 12);
    }
  }
  if (r.includes("daily")) return addDays(fromYMD, 1);
  if (r.includes("biweekly")) return addDays(fromYMD, 14);
  if (r.includes("weekly")) return addDays(fromYMD, 7);
  if (r.includes("monthly")) return addMonths(fromYMD, 1);
  if (r.includes("yearly") || r.includes("annual")) return addMonths(fromYMD, 12);
  return null;
}
