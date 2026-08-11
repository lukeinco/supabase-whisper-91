import { useCallback, useEffect, useRef, useState } from "react";

const CELL = 16;
const STEP_MS = 420;
const STALL_MS = 1000;

const DEAD = "#1B1E24";
const NEWBORN = "#FFFFFF";
const AGED = "#A8AEB8";

type Cells = Uint8Array; // 0 dead, 1 newborn (born this generation), 2 aged

const PATTERNS: number[][][] = [
  [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]], // acorn
  [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], // r-pentomino
  [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2]], // glider
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 2]], // variant
];

function seed(cols: number, rows: number): Cells {
  const cells = new Uint8Array(cols * rows);
  if (cols < 3 || rows < 3) return cells;
  for (let n = 0; n < 2; n++) {
    const p = PATTERNS[Math.floor(Math.random() * PATTERNS.length)]!;
    const ox = Math.floor(Math.random() * cols);
    const oy = Math.floor(Math.random() * rows);
    for (const [dx, dy] of p) {
      const x = (ox + (dx as number)) % cols;
      const y = (oy + (dy as number)) % rows;
      cells[y * cols + x] = 1;
    }
  }
  return cells;
}

/** Standard B3/S23 on a torus. Survivors age, births are marked newborn. */
function step(cells: Cells, cols: number, rows: number): Cells {
  const next = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + cols) % cols;
          const ny = (y + dy + rows) % rows;
          if (cells[ny * cols + nx]! > 0) n++;
        }
      }
      const alive = cells[y * cols + x]! > 0;
      if (alive && (n === 2 || n === 3)) next[y * cols + x] = 2;
      else if (!alive && n === 3) next[y * cols + x] = 1;
    }
  }
  return next;
}

function same(a: Cells, b: Cells): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i]! > 0) !== (b[i]! > 0)) return false;
  return true;
}

function population(a: Cells): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i]! > 0) n++;
  return n;
}

/** Decorative Conway field. Monochrome by design — never the accent color. */
export function LifeField() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ cols: 0, rows: 0 });
  const [cells, setCells] = useState<Cells>(() => new Uint8Array(0));
  const history = useRef<Cells[]>([]);
  const stalledAt = useRef<number | null>(null);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const reseed = useCallback((cols: number, rows: number) => {
    history.current = [];
    stalledAt.current = null;
    setCells(seed(cols, rows));
  }, []);

  // Size the grid to the widget body; a size change reseeds.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = (w: number, h: number) => {
      const cols = Math.max(1, Math.floor(w / CELL));
      const rows = Math.max(1, Math.floor(h / CELL));
      setDims((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    const ro = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    measure(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dims.cols && dims.rows) reseed(dims.cols, dims.rows);
  }, [dims.cols, dims.rows, reseed]);

  useEffect(() => {
    if (reduced || !dims.cols || !dims.rows) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setCells((prev) => {
        if (prev.length !== dims.cols * dims.rows) return prev;
        const next = step(prev, dims.cols, dims.rows);
        const [h1, h2] = history.current;
        const stalled =
          population(next) === 0 ||
          same(next, prev) ||
          (h1 !== undefined && same(next, h1)) ||
          (h2 !== undefined && same(next, h2));
        if (stalled) {
          const now = Date.now();
          stalledAt.current ??= now;
          if (now - stalledAt.current >= STALL_MS) {
            history.current = [];
            stalledAt.current = null;
            return seed(dims.cols, dims.rows);
          }
        } else {
          stalledAt.current = null;
        }
        history.current = [prev, h1 ?? prev];
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [dims.cols, dims.rows, reduced]);

  const { cols, rows } = dims;

  return (
    <div
      ref={boxRef}
      onClick={() => reseed(cols, rows)}
      className="h-full w-full cursor-pointer"
      style={{ backgroundColor: DEAD }}
    >
      {cols > 0 && rows > 0 ? (
        <svg
          width={cols * CELL}
          height={rows * CELL}
          viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
          aria-hidden
          shapeRendering="crispEdges"
        >
          {Array.from({ length: cols * rows }, (_, i) => {
            const v = cells[i] ?? 0;
            return (
              <rect
                key={i}
                x={(i % cols) * CELL}
                y={Math.floor(i / cols) * CELL}
                width={CELL}
                height={CELL}
                rx={3}
                fill={v === 1 ? NEWBORN : v === 2 ? AGED : DEAD}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
