const CACHE_NAME = "agentarena-workbench-v1";
const serviceWorker = globalThis;

// Install: activate immediately so the first offline-capable load happens sooner.
serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(serviceWorker.skipWaiting());
});

// Activate: drop stale caches and take control of open clients.
serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => serviceWorker.clients.claim())
  );
});

// Fetch: network-first with cache fallback. Vite emits hashed asset filenames,
// so we cache at runtime (cache.put) instead of a static pre-cache manifest.
// API calls always hit the network and are not cached — offline reads come
// from the app's localStorage-backed run store, not from the SW.
serviceWorker.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // For navigation requests, fall back to the app shell so the SPA
        // still boots offline (hash routing means every navigation is /workbench/).
        const isNavigation = request.mode === "navigate" || request.destination === "document";
        if (isNavigation) {
          const indexFallback = await caches.match("./index.html");
          if (indexFallback) return indexFallback;
        }
        return new Response("Offline and not cached", { status: 504, headers: { "Content-Type": "text/plain" } });
      })
  );
});

// Skip waiting when the page asks for an immediate update.
serviceWorker.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    serviceWorker.skipWaiting();
  }
});
