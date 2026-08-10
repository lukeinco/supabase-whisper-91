import { useCallback, useEffect, useRef, useState } from "react";
import { getState, mutate, UnauthorizedError } from "@/lib/api";
import { normalizeNotes } from "@/lib/modules";

type Props = {
  secret: string;
  onUnauthorized?: () => void;
};

export function Scratchpad({ secret, onUnauthorized }: Props) {
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getState(secret)
      .then((state) => {
        if (!active) return;
        setBody(normalizeNotes(state));
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [secret, onUnauthorized]);

  const grow = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    grow();
  }, [body, grow, loaded]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  function onChange(value: string) {
    setBody(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      mutate(secret, "notes", "edited", { body: value })
        .then(() => {
          setSaved(true);
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
        })
        .catch((e: unknown) => {
          if (e instanceof UnauthorizedError) onUnauthorized?.();
        });
    }, 800);
  }

  return (
    <div className="w-full min-w-0 px-4 py-3">
      <textarea
        ref={areaRef}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…"
        rows={1}
        className="min-h-[120px] w-full min-w-0 resize-none overflow-hidden bg-transparent font-sans text-[15px] text-foreground placeholder:text-muted outline-none"
      />
      <p
        className={`font-mono text-[11px] text-muted transition-opacity duration-500 ${
          saved ? "opacity-100" : "opacity-0"
        }`}
      >
        saved
      </p>
    </div>
  );
}
