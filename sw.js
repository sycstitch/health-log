// service worker — caches the app shell so the log opens offline.
// the apps script backend is never cached: log posts always go to the
// network, and if they fail the offline queue in api.js holds the entry.

const CACHE = "health-log-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./js/api.js",
  "./js/app.js",
  "./js/dashboard.js",
  "./manifest.json",
  "./assets/bristol.webp",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // add one at a time: a single missing asset (e.g. an icon not
      // pushed yet) must not fail the whole install.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  // only cache same-origin GETs (the app shell). everything else — notably
  // the apps script backend — is network-only.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      });
    })
  );
});
