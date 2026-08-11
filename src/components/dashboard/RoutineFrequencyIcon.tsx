import type { RepeatKind } from "@/lib/modules";

export type FrequencyKind =
  | "daily"
  | "every_n_days"
  | "weekly"
  | "every_n_weeks"
  | "nth_weekday_of_month";

type Props = {
  kind: FrequencyKind;
  /** only used when kind === "nth_weekday_of_month": 1..4 or -1 for last */
  nth?: number | undefined;
  size?: number;
  className?: string;
};

/** repeat_kind + interval + nth -> icon kind */
export function frequencyKindOf(r: {
  repeat_kind: RepeatKind;
  repeat_interval: number;
}): FrequencyKind {
  if (r.repeat_kind === "weekly") return r.repeat_interval > 1 ? "every_n_weeks" : "weekly";
  if (r.repeat_kind === "every_n_days") return "every_n_days";
  if (r.repeat_kind === "nth_weekday_of_month") return "nth_weekday_of_month";
  return "daily";
}

const WEEK_TICKS = (
  <>
    <line x1="4" y1="22" x2="24" y2="22" strokeWidth="1.2" />
    <line x1="5.4" y1="22" x2="5.4" y2="19" strokeWidth="1.2" />
    <line x1="8.3" y1="22" x2="8.3" y2="19" strokeWidth="1.2" />
    <line x1="11.1" y1="22" x2="11.1" y2="15" strokeWidth="2" />
    <line x1="14" y1="22" x2="14" y2="19" strokeWidth="1.2" />
    <line x1="16.9" y1="22" x2="16.9" y2="19" strokeWidth="1.2" />
    <line x1="19.7" y1="22" x2="19.7" y2="19" strokeWidth="1.2" />
    <line x1="22.6" y1="22" x2="22.6" y2="19" strokeWidth="1.2" />
  </>
);

const STAIRS: Record<number, string> = {
  1: "M5,23 L23,23 L23,5",
  2: "M5,23 L14,23 L14,14 L23,14 L23,5",
  3: "M5,23 L11,23 L11,17 L17,17 L17,11 L23,11 L23,5",
  4: "M5,23 L9.5,23 L9.5,18.5 L14,18.5 L14,14 L18.5,14 L18.5,9.5 L23,9.5 L23,5",
};

export function RoutineFrequencyIcon({ kind, nth = 1, size = 16, className }: Props) {
  const common = {
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "aria-hidden": true,
    className: `shrink-0 text-muted ${className ?? ""}`,
  } as const;

  if (kind === "daily") {
    return (
      <svg {...common} viewBox="0 0 28 28" strokeWidth="1.5" strokeLinecap="square">
        <line x1="4" y1="22" x2="24" y2="22" />
        <line x1="6" y1="22" x2="6" y2="17" />
        <line x1="10" y1="22" x2="10" y2="17" />
        <line x1="14" y1="22" x2="14" y2="17" />
        <line x1="18" y1="22" x2="18" y2="17" />
        <line x1="22" y1="22" x2="22" y2="17" />
      </svg>
    );
  }

  if (kind === "every_n_days") {
    return (
      <svg {...common} viewBox="0 0 28 28" strokeWidth="1.5" strokeLinecap="square">
        <line x1="4" y1="22" x2="24" y2="22" />
        <line x1="6" y1="22" x2="6" y2="16" />
        <line x1="14" y1="22" x2="14" y2="16" />
        <line x1="22" y1="22" x2="22" y2="16" />
        <circle cx="10" cy="22" r="1.3" strokeWidth="1.1" />
        <circle cx="18" cy="22" r="1.3" strokeWidth="1.1" />
      </svg>
    );
  }

  if (kind === "weekly" || kind === "every_n_weeks") {
    return (
      <svg {...common} viewBox="0 0 28 28" strokeLinecap="square">
        {WEEK_TICKS}
        {kind === "every_n_weeks" ? (
          <>
            <path d="M9,8.5 A3,3 0 1 1 11,10.8" strokeWidth="1.1" fill="none" />
            <path d="M11,10.8 L9.3,10.3 M11,10.8 L10.6,9" strokeWidth="1.1" />
          </>
        ) : null}
      </svg>
    );
  }

  if (nth === -1) {
    return (
      <svg
        {...common}
        viewBox="0 0 30 30"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M5,23 L11,23 L11,17 L17,17 L17,11" />
        <path d="M17,11 L26,2" strokeDasharray="1.5,2" />
        <path d="M26,2 L21.5,2 M26,2 L26,6.5" />
      </svg>
    );
  }

  return (
    <svg
      {...common}
      viewBox="0 0 28 28"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d={STAIRS[nth] ?? STAIRS[1]!} />
    </svg>
  );
}
