// Service worker for the Restaurantes Portugal PWA.
// Strategy: cache the static shell (same-origin app files) and serve it
// stale-while-revalidate so the app opens offline. All cross-origin traffic
// (Google Maps/Places/Directions, Firebase) is left to the network.

const CACHE = "restaurantes-v1";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/storage.js",
  "js/db.js",
  "js/map.js",
  "js/geocode.js",
  "js/places.js",
  "js/planner.js",
  "js/addRestaurant.js",
  "js/app.js",
  "data/restaurants.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only manage same-origin requests; everything else goes straight to network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
