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
      // (+ 2026-10-08) GIỮ bản ngay trước (một bản): trang còn chạy mã cũ (tab khác, chưa kịp tải lại) nạp muộn
      // chunk cũ vẫn có (lazy.ts) thay vì lỗi "Chưa mở được màn này". Bản cũ hơn nữa → xóa.
      // caches.keys() trả về theo thứ tự tạo → bản cuối (khác CACHE) là bản ngay trước.
      const keys = await caches.keys();
      const old = keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE);
      const keep = old[old.length - 1];
      await Promise.all(old.filter((k) => k !== keep).map((k) => caches.delete(k)));
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
      // Không có trong bản hiện tại → thử bản cũ còn giữ (chunk của trang chưa tải lại), rồi mới ra mạng
      const cached = (await cache.match(req, MATCH)) || (await caches.match(req, MATCH));
      return cached || fetch(req);
    })(),
  );
});
