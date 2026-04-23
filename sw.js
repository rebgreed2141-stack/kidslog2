const CACHE_NAME = "kidslog2-cache-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./version.json",
  "./jszip.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-1024.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data.type === "GET_CURRENT_VERSION") {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match("./version.json") || await cache.match(new URL("./version.json", self.location.href).href);
      let version = "";
      if (response) {
        try {
          const data = await response.json();
          version = String(data && data.version ? data.version : "").trim();
        } catch (_error) {
          version = "";
        }
      }
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version });
      }
    })());
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && /\/(child_[^/]+\.json|staff_[^/]+\.json)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.endsWith("/version.json")) {
    if (event.request.cache === "no-store") {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match("./version.json") || await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && response.ok) {
          cache.put("./version.json", response.clone());
        }
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
