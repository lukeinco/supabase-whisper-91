const VAPID_PUBLIC =
  "BGiTzXBg2sDXerGS9elarT7UMVJNrrfowqhpBhOkYZWDXzT0GHlDJ3W6svCE8f_9jHhW7y-N4dylZmLurI5Iu4I";

const PUSH_URL = `${import.meta.env["VITE_SUPABASE_URL"]}/functions/v1/push`;

function toUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function call(secret: string, body: unknown) {
  const r = await fetch(PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-secret": secret },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `${r.status}`);
  return r.json();
}

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function pushState() {
  if (!pushSupported()) return "unsupported" as const;
  if (Notification.permission === "denied") return "blocked" as const;
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? ("on" as const) : ("off" as const);
}

export async function enablePush(secret: string) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("permission " + perm);
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8(VAPID_PUBLIC),
    }));
  await call(secret, {
    action: "subscribe",
    subscription: sub.toJSON(),
    userAgent: navigator.userAgent,
  });
}

export async function disablePush(secret: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await call(secret, { action: "unsubscribe", endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export const testPush = (secret: string) =>
  call(secret, { action: "test", title: "life", body: "push is working" });
