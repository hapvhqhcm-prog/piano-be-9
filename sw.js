/* Service worker sinh lúc build (vite.config.ts). Offline-first, chỉ same-origin. */
const VERSION = '93d44e0b1d56';
const PREFIX = 'piano-be-9-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  "./",
  "index.html",
  "assets/baloo-2-vietnamese-700-normal-h4tlcePq.woff2",
  "assets/baloo-2-vietnamese-800-normal-ConLnEgt.woff2",
  "assets/baloo-2-latin-700-normal-CqTg7A15.woff2",
  "assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2",
  "assets/baloo-2-latin-800-normal-BbF3Etk1.woff2",
  "assets/nunito-latin-600-normal-Br8yIETf.woff2",
  "assets/nunito-latin-800-normal-Dz8SOQK_.woff2",
  "assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2",
  "assets/parentux-DjQYBJFX.css",
  "assets/diagnostics-DimufbuT.css",
  "assets/report-lhCP4rnJ.css",
  "assets/sing-DOgu-73Y.css",
  "assets/songRecord-DT9swKyc.css",
  "assets/library-CIrQOuWj.css",
  "assets/games-B4S2hDOp.css",
  "assets/parent-DxvUcg1M.css",
  "assets/session-CNeMQYSr.css",
  "assets/song-BlAfEe59.css",
  "assets/home-C6gaU0lC.css",
  "assets/index-C78aT98z.css",
  "assets/voice-D8aDQqzJ.js",
  "assets/freePlay-DHpNk7nz.js",
  "assets/shortSession-D8pvAuZB.js",
  "assets/rhythm-CjBQrD04.js",
  "assets/postureArt-B5nRteHv.js",
  "assets/parentCheck-D9vdDQjy.js",
  "assets/diagnostics-B_dTLQMj.js",
  "assets/micLogStore-Bs8FYxfq.js",
  "assets/songEditor-DIu95MW7.js",
  "assets/report-D5moWhIp.js",
  "assets/parentGuide-Dhwp9gY1.js",
  "assets/album-KxYP9d_j.js",
  "assets/improv-CVdmQ10M.js",
  "assets/compose-BcsDn-bq.js",
  "assets/concert-Cz6R7st3.js",
  "assets/stage-DpjUXRr-.js",
  "assets/songArt-BjrKA-Lq.js",
  "assets/earGuess-CCdGET3M.js",
  "assets/beatCatch-CM2FYcXe.js",
  "assets/echo-LXPQhTqb.js",
  "assets/diagnostics-FtFYkw_I.js",
  "assets/stickers-BgWCJ6UB.js",
  "assets/twoHand-CHKWzmxZ.js",
  "assets/contour-DPdzejdR.js",
  "assets/onboarding-DWDSlgsr.js",
  "assets/practice-BcY3sTIq.js",
  "assets/MicListener-DRXCa1T_.js",
  "assets/demo-DLn-ILCF.js",
  "assets/weeklyReport-BcnzD2JF.js",
  "assets/report-okzToeGT.js",
  "assets/sing-BEwe4rsT.js",
  "assets/songRecord-CRqm2BoA.js",
  "assets/handDiagram-DzgxUK1T.js",
  "assets/library-DDrpO5-4.js",
  "assets/micTest-CmAFsGxQ.js",
  "assets/games-DaST_32i.js",
  "assets/catalog-BIJxMSO3.js",
  "assets/parent-DppUVsEe.js",
  "assets/session-Cs1NVDuk.js",
  "assets/song-DhHGcMmr.js",
  "assets/home-BwiK7SKq.js",
  "assets/index-CjXROQro.js",
  "assets/micSetup-SLyS9_bp.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "manifest.webmanifest"
];
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
