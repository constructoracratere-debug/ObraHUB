/* ObraHub service worker — installable PWA + offline app shell.
   Strategy: precache the shell; navigations network-first with offline
   fallback; immutable build assets cache-first; /api always network. */
const CACHE = "obrahub-v1";
const SHELL = ["/login", "/landing", "/manifest.json", "/logo-obrahub.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // data is always live

  // Immutable build assets / wasm / images: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/wasm/") ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, offline fallback to cached shell.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match("/login"))),
    );
  }
});
