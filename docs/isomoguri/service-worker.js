const CACHE_NAME = 'isomoguri-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;               // スコア送信(POST)は素通し
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return;     // ランキングは常に最新を取る

  const isPage = req.mode === 'navigate' ||
    url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    // ページ本体はネット優先（更新を確実に届ける）。オフライン時だけキャッシュ
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  } else {
    event.respondWith(
      caches.match(req).then(response => response || fetch(req))
    );
  }
});
