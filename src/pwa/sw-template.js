/* Service worker sinh lúc build (vite.config.ts). Offline-first, chỉ same-origin. */
const VERSION = '__VERSION__';
const PREFIX = 'piano-be-9-';
const CACHE = PREFIX + VERSION;
const PRECACHE = __PRECACHE__;
// ignoreVary: server (vd "Vary: Origin") làm request module script không khớp cache khi offline.
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      // KHÔNG skipWaiting() ở đây: bản mới CHỜ, để không đổi phiên bản giữa buổi học.
      // Lần cài đầu (chưa có bản cũ) tự kích hoạt ngay; bản cập nhật chỉ kích hoạt khi trang gửi 'SKIP_WAITING'
      // ở điểm an toàn (src/pwa/updater.ts → markSafePoint(true)).
    })(),
  );
});

self.addEventListener('message', (event) => {
  const d = event.data;
  if (d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // app không gọi domain ngoài

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match('./index.html', MATCH)) || (await cache.match('./', MATCH));
        return cached || fetch(req);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, MATCH);
      return cached || fetch(req);
    })(),
  );
});
