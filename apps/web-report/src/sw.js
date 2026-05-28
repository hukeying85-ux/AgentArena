const CACHE_NAME = "agentarena-report-v11";
const serviceWorker = /** @type {typeof globalThis & { clients: { claim(): Promise<void> }, skipWaiting(): void | Promise<void> }} */ (globalThis);

// Install: pre-cache core assets for offline resilience on first visit
serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["./index.html", "./styles.css", "./app.js"])
    ).then(() => serviceWorker.skipWaiting())
  );
});

// Activate: delete old caches immediately on update
serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => serviceWorker.clients.claim())
  );
});

// Fetch: network-first for ALL requests (no hardcoded asset list).
// This eliminates stale cache issues when new JS files are added or existing ones change.
serviceWorker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API requests — always go to network
  if (url.pathname.startsWith("/api/")) return;

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Community data from GitHub raw: network-first with cache fallback.
  // Trust model: data from raw.githubusercontent.com is considered trusted
  // (served over HTTPS from the project's own repository).
  // No additional integrity check is applied — if the repository is
  // compromised, the cached data will be stale until the next fetch.
  if (url.hostname === "raw.githubusercontent.com" && url.pathname.includes("/leaderboard-data/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Prefer real cached data when network fails.
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // No cache: surface the failure honestly instead of fabricating a "{}" 200 OK.
          // The UI must distinguish "fetch failed" from "no leaderboard entries"; a 200 with
          // empty JSON conflates those and silently degrades community ranking display.
          return new Response(
            JSON.stringify({ error: "community-data-unavailable", offline: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // For all local requests: network-first with cache fallback.
  // Network-first ensures code changes are visible immediately without hard-refresh.
  // Cache fallback provides offline resilience.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Only return index.html for navigation requests. For JS/CSS/image/font
        // subresource requests, returning HTML would cause a parse error in the
        // browser; surface the failure as a proper 504 instead.
        const isNavigation = event.request.mode === "navigate" || event.request.destination === "document";
        if (isNavigation) {
          const indexFallback = await caches.match("./index.html");
          if (indexFallback) return indexFallback;
        }
        return new Response("Offline and not cached", { status: 504, headers: { "Content-Type": "text/plain" } });
      })
  );
});

// Update notification: notify clients when a new version is available
serviceWorker.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    serviceWorker.skipWaiting();
  }
});
