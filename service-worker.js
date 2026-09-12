// service-worker.js
// Caches all app files the first time it opens, then serves everything
// from the cache — works fully offline. The actual data (localStorage)
// is completely separate from this.

const CACHE_NAME = "calorie-ledger-v1";
const FILES_TO_CACHE = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./storage.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
