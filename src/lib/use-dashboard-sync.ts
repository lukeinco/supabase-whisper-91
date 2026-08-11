import { useEffect, useRef } from "react";
import { getState, UnauthorizedError, type DashboardState } from "./api";
import { readCache, useStateVersion } from "./state-cache";

/**
 * Read dashboard state on mount, then re-read it in place whenever fresh cloud
 * state lands. Nothing remounts: components merge the new data into their own
 * state so existing rows keep their DOM nodes.
 */
export function useDashboardSync(
  secret: string,
  apply: (state: DashboardState) => void,
  onUnauthorized?: () => void,
) {
  const version = useStateVersion();
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    let active = true;
    if (version > 0) {
      const cached = readCache();
      if (cached !== null) applyRef.current(cached);
      return;
    }
    getState(secret)
      .then((state) => {
        if (active) applyRef.current(state);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof UnauthorizedError) onUnauthorized?.();
        applyRef.current(null);
      });
    return () => {
      active = false;
    };
  }, [secret, version, onUnauthorized]);
}
