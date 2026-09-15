/* ObraHub service worker v2 — installable PWA + offline shell.
   CAMBIO CRÍTICO vs v1: la v1 cacheaba el HTML de cada navegación y podía
   servir una app VIEJA completa (HTML viejo + chunks viejos) cuando la red
   fallaba un instante — el usuario veía bugs ya arreglados ("pantalla en
   blanco del Diseño IA"). Reglas v2:
   - Navegación: SIEMPRE red; si la red falla, solo el shell genérico /login.
     Nunca se guarda ni se sirve HTML de páginas de la app.
   - Chunks de build (/_next/static, /wasm): cache-first — son inmutables
     por hash de contenido, no existe el concepto de "versión vieja" en esa
     URL.
   - activate: borra TODA caché que no sea la actual (obrahub-v2), lo que
     purga de raíz la obrahub-v1 envenenada en los dispositivos. */
const CACHE = "obrahub-v2";
const SHELL = ["/login", "/manifest.json", "/logo-obrahub.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      // Sanación en UNA visita: los dispositivos pegados a la v1 (app vieja
      // con bugs) recargan sus ventanas apenas esta versión toma control, y
      // la recarga ya sale limpia de la red. El activate corre una sola vez
      // por versión — no hay bucle.
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        for (const c of clients) {
          try { c.navigate(c.url); } catch { /* cliente no navegable */ }
        }
      }),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // data is always live

  // Immutable build assets / wasm / images: cache-first (hash-safe).
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

  // Navigations: red SIEMPRE. Sin caché de HTML de la app: una app vieja
  // cacheada es peor que un error de red honesto. Offline → shell /login.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((hit) => hit ?? caches.match("/login")),
      ),
    );
  }
});
