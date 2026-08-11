import { createFileRoute } from "@tanstack/react-router";

/**
 * The web app manifest is generated per-request so the installed app can keep
 * the access secret in its start_url without that secret ever being committed
 * to the repo or served to anyone who did not already have it: the browser
 * asks for /manifest.webmanifest?k=<secret> only when the page it is on
 * already carries that secret in its own fragment.
 */
function manifest(k: string | null) {
  return {
    name: "Life Dashboard",
    short_name: "Life",
    display: "standalone",
    background_color: "#1B1E24",
    theme_color: "#1B1E24",
    orientation: "portrait",
    scope: "/",
    // Relative so the app installs against whatever origin served it.
    start_url: k ? `./#k=${k}` : "./",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const k = new URL(request.url).searchParams.get("k");
        return new Response(JSON.stringify(manifest(k), null, 2), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
