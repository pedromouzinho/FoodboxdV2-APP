// Service worker for the Foodboxd PWA.
// Strategy:
//   - HTML navigations  -> network-first (so a freshly deployed shell, e.g. a
//     new sign-in button, shows up immediately when online; cache is the
//     offline fallback only).
//   - Other static files -> stale-while-revalidate (fast, self-healing).
//   - Cross-origin (Google Maps/Places/Directions, Firebase) -> network only.
//
// PUSH: a PWA web NÃO recebe push nesta v1 — só a app nativa (js/push.js).
// Este service worker não tem handler de push de propósito; quando a web
// entrar, é aqui que ele nasce.

const CACHE = "foodboxd-v97";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/storage.js",
  "js/imagem.js",
  "js/db.js",
  "js/userdata.js",
  "js/filtro.js",
  "js/erros.js",
  "js/push.js",
  "js/auth.js",
  "js/map.js",
  "js/geocode.js",
  "js/places.js",
  "js/planner.js",
  "js/geoValidate.js",
  "js/addRestaurant.js",
  "js/ai.js",
  "js/app.js",
  "data/restaurants.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

// addAll() vai à cache HTTP do browser, e os assets são servidos com
// max-age — resultado: a cache NOVA ficava populada com os ficheiros VELHOS, e
// lá ficavam até ao próximo bump do CACHE. Era por isso que só apagar a app
// resolvia. Com cache:"reload" cada ficheiro vem da rede, independentemente
// dos cabeçalhos.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(ASSETS.map((u) =>
        fetch(u, { cache: "reload" })
          .then((res) => (res.ok ? c.put(u, res) : null))
          // Um ficheiro que falhe não pode impedir a instalação: sem isto, uma
          // falha de rede a meio deixava a app na versão anterior para sempre.
          .catch(() => null)
      ))
    ).then(() => self.skipWaiting())
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

function cachePut(req, res) {
  if (res && res.status === 200 && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only manage same-origin requests; everything else goes straight to network.
  if (url.origin !== self.location.origin) return;

  // HTML navigations (and index.html itself): network-first so newly deployed
  // markup always wins online; fall back to cache when offline.
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => cachePut(req, res))
        .catch(() => caches.match(req).then((c) => c || caches.match("index.html")))
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => cachePut(req, res))
        .catch(() => cached);
      return cached || network;
    })
  );
});
