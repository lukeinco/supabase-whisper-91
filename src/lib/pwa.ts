import { useEffect } from "react";

const SW_URL = "/sw.js";

function previewContext() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppWorker() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

/**
 * Points the manifest link at a copy carrying the current access secret, so an
 * installed shortcut relaunches with #k= intact, and registers the app-shell
 * service worker in production only.
 */
export function usePwa(secret: string | null) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) {
      link.href = secret
        ? `/manifest.webmanifest?k=${encodeURIComponent(secret)}`
        : "/manifest.webmanifest";
    }
  }, [secret]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (previewContext()) {
      void unregisterAppWorker();
      return;
    }
    const onLoad = () => void navigator.serviceWorker.register(SW_URL, { scope: "/" });
    window.addEventListener("load", onLoad);
    if (document.readyState === "complete") onLoad();
    return () => window.removeEventListener("load", onLoad);
  }, []);
}
