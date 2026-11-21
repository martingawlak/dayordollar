/* Dead Dreams Booking service worker.
   Pages: network first, falling back to the last copy, so the app opens offline.
   Built assets: cache first (their names change when they change).
   API: never cached here, except an order, so tickets open at the door with no signal
   (the order page also keeps its own copy on the phone). Payments are never cached. */
const VERSION = "dd-v1";
const SHELL = ["/", "/tickets/", "/order/", "/event/", "/door/", "/offline/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: req.mode === "navigate" })) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/door/")) return;

  if (/^\/api\/orders\/[^/]+$/.test(url.pathname) && !url.searchParams.has("session_id")) {
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }
  if (req.mode === "navigate") {
    // Ticket links (/e/<slug>) fall back to the ticket page shell; everything else to the offline page.
    e.respondWith(networkFirst(req, url.pathname.startsWith("/e/") ? "/event/" : "/offline/"));
  }
});
