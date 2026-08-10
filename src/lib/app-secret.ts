import { useEffect, useState } from "react";

/**
 * Reads the access secret from the URL fragment (#k=<secret>).
 * Kept in memory only — never localStorage/sessionStorage.
 */
export function readSecretFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const k = params.get("k");
  return k && k.length > 0 ? k : null;
}

export function useAppSecret() {
  const [secret, setSecret] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSecret(readSecretFromHash());
    setReady(true);
    const onHash = () => setSecret(readSecretFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);


  return { secret, ready, clear: () => setSecret(null) };
}
