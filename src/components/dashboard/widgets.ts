export type WidgetId =
  | "today"
  | "routine"
  | "to-do"
  | "to-buy"
  | "budget"
  | "waiting-on"
  | "scratchpad";

export type WidgetDef = {
  id: WidgetId;
  label: string;
  empty: string;
};

export const WIDGETS: WidgetDef[] = [
  { id: "today", label: "today", empty: "nothing due" },
  { id: "routine", label: "routine", empty: "empty" },
  { id: "to-do", label: "to-do", empty: "nothing to do" },
  { id: "to-buy", label: "to-buy", empty: "nothing to buy" },
  { id: "budget", label: "budget", empty: "no spending yet" },
  { id: "waiting-on", label: "waiting on", empty: "not waiting on anything" },
  { id: "scratchpad", label: "scratchpad", empty: "empty" },
];

export const DEFAULT_LAYOUT = [
  { i: "today", x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "to-do", x: 4, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "to-buy", x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "routine", x: 0, y: 12, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "budget", x: 0, y: 6, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "waiting-on", x: 4, y: 6, w: 4, h: 6, minW: 3, minH: 4 },
  { i: "scratchpad", x: 8, y: 6, w: 4, h: 6, minW: 3, minH: 4 },
];

export const ROW_HEIGHT = 28;
