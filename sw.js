// amitfpl service worker.
// Strategy: network-first for everything, falling back to cache when
// offline. This keeps the app installable and usable offline WITHOUT
// ever serving stale code when online.
const CACHE = 'amitfpl-v2';
const CORE = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'icon.svg',
  'js/app.js', 'js/api.js', 'js/i18n.js', 'js/names-he.js', 'js/state.js', 'js/ui.js', 'js/model.js',
  'js/players.js', 'js/planner.js', 'js/scout.js', 'js/market.js',
  'js/status.js', 'js/compare.js', 'js/fixtures.js', 'js/lineups.js',
  'js/matches.js', 'js/setpieces.js', 'js/myteam.js', 'js/home.js',
  'js/drawer.js',
  'data/bootstrap.json', 'data/fixtures.json', 'data/faces.json', 'data/meta.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful same-origin responses for offline use.
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: false }))
  );
});
