import * as chrono from "chrono-node";

export type ParsedKind = "expense" | "todo";

export type Parsed = {
  kind: ParsedKind;
  /** text with the recognized date/amount expression stripped */
  title: string;
  amount?: number;
  category?: string | null;
  due?: Date | null;
};

export const BUY_CATEGORIES = ["grocery", "hardware", "household"] as const;
export type BuyCategory = (typeof BUY_CATEGORIES)[number];

const BUY_KEYWORDS: Record<BuyCategory, string[]> = {
  grocery: [
    "milk", "eggs", "bread", "coffee", "butter", "cheese", "rice", "pasta",
    "chicken", "banana", "bananas", "apples", "groceries", "grocery", "sugar",
    "flour", "yogurt", "onions", "beer", "wine", "snacks",
  ],
  hardware: [
    "screws", "nails", "drill", "lumber", "paint", "sandpaper", "hammer",
    "bolts", "wrench", "tape measure", "hardware", "caulk", "wd40",
  ],
  household: [
    "soap", "detergent", "paper towels", "toilet paper", "trash bags",
    "sponges", "shampoo", "toothpaste", "batteries", "light bulbs", "bleach",
    "household",
  ],
};

export function guessBuyCategory(text: string): BuyCategory | null {
  const t = ` ${text.toLowerCase()} `;
  for (const cat of BUY_CATEGORIES) {
    for (const kw of BUY_KEYWORDS[cat]) {
      if (t.includes(` ${kw} `) || t.includes(`${kw}s `)) return cat;
    }
  }
  return null;
}

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10,
};

const ORDINALS: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4,
  "4th": 4, fifth: 5, "5th": 5, last: -1,
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
];

function atNoon(d: Date) {
  d.setHours(12, 0, 0, 0);
  return d;
}

/** "two Fridays from now", "3 Mondays from now" */
export function parseRelativeWeekday(
  text: string,
  ref = new Date(),
): { date: Date; match: string } | null {
  const re = new RegExp(
    `\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(${WEEKDAYS.join("|")})s?\\s+from\\s+(?:now|today)\\b`,
    "i",
  );
  const m = re.exec(text);
  if (!m) return null;
  const nRaw = (m[1] ?? "").toLowerCase();
  const n = /^\d+$/.test(nRaw) ? parseInt(nRaw, 10) : (NUMBER_WORDS[nRaw] ?? 1);
  const target = WEEKDAYS.indexOf((m[2] ?? "").toLowerCase());
  if (n < 1 || target < 0) return null;
  const d = new Date(ref);
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta + (n - 1) * 7);
  return { date: atNoon(d), match: m[0] };
}

/** "last Thursday in January 2028", "first Monday of March" */
export function parseOrdinalWeekdayOfMonth(
  text: string,
  ref = new Date(),
): { date: Date; match: string } | null {
  const re = new RegExp(
    `\\b(${Object.keys(ORDINALS).join("|")})\\s+(${WEEKDAYS.join("|")})\\s+(?:in|of)\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`,
    "i",
  );
  const m = re.exec(text);
  if (!m) return null;
  const ord = ORDINALS[(m[1] ?? "").toLowerCase()] ?? 1;
  const weekday = WEEKDAYS.indexOf((m[2] ?? "").toLowerCase());
  const month = MONTHS.indexOf((m[3] ?? "").toLowerCase());
  let year = m[4] ? parseInt(m[4], 10) : ref.getFullYear();

  const build = (y: number) => {
    if (ord === -1) {
      const d = new Date(y, month + 1, 0, 12, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
      return d;
    }
    const d = new Date(y, month, 1, 12, 0, 0, 0);
    d.setDate(1 + ((weekday - d.getDay() + 7) % 7) + (ord - 1) * 7);
    return d;
  };

  let date = build(year);
  if (!m[4] && date.getTime() < ref.getTime()) {
    year += 1;
    date = build(year);
  }
  if (date.getMonth() !== month) return null;
  return { date, match: m[0] };
}

export function parseDate(
  text: string,
  ref = new Date(),
): { date: Date; match: string } | null {
  return (
    parseRelativeWeekday(text, ref) ??
    parseOrdinalWeekdayOfMonth(text, ref) ??
    (() => {
      const results = chrono.parse(text, ref, { forwardDate: true });
      if (!results.length) return null;
      const r = results[0]!;
      return { date: atNoon(r.start.date()), match: r.text };
    })()
  );
}

export function formatChipDate(d: Date) {
  const parts = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  // "Thu, Jan 27, 2028" -> "Thu Jan 27, 2028"
  return parts.replace(",", "");
}

export function formatToastDate(d: Date) {
  return d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .replace(",", "");
}

export function parseCapture(
  input: string,
  budgetCategories: string[],
  ref = new Date(),
): Parsed | null {
  const text = input.trim();
  if (!text) return null;

  // 1. expense
  const money = /^\$\s*(\d+(?:[.,]\d{1,2})?)\s*(.*)$/.exec(text);
  if (money) {
    const amount = parseFloat((money[1] ?? "0").replace(",", "."));
    const rest = (money[2] ?? "").trim();
    const words = rest.split(/\s+/).filter(Boolean);
    const trailing = (words[words.length - 1] ?? "").toLowerCase();
    const matched =
      budgetCategories.find(
        (c) =>
          c.toLowerCase() === trailing ||
          `${c.toLowerCase()}s` === trailing ||
          c.toLowerCase() === trailing.replace(/s$/, ""),
      ) ?? null;
    return { kind: "expense", title: rest, amount, category: matched };
  }

  // 2. date expression
  const found = parseDate(text, ref);
  if (found) {
    const title = text.replace(found.match, " ").replace(/\s+/g, " ").trim();
    return { kind: "todo", title: title || text, due: found.date, category: null };
  }

  // 3 & 4. buy keyword or plain to-do — chip defaults to to-do either way
  return { kind: "todo", title: text, due: null, category: null };
}
