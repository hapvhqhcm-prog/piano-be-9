/* Service worker sinh lúc build (vite.config.ts). Offline-first, chỉ same-origin. */
const VERSION = '696c8ce7f89b';
const PREFIX = 'piano-be-9-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  "./",
  "index.html",
  "assets/baloo-2-latin-700-normal-CqTg7A15.woff2",
  "assets/baloo-2-vietnamese-700-normal-h4tlcePq.woff2",
  "assets/baloo-2-latin-800-normal-BbF3Etk1.woff2",
  "assets/nunito-latin-800-normal-Dz8SOQK_.woff2",
  "assets/baloo-2-vietnamese-800-normal-ConLnEgt.woff2",
  "assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2",
  "assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2",
  "assets/nunito-latin-600-normal-Br8yIETf.woff2",
  "assets/parentux-BEm5Z6fI.css",
  "assets/diagnostics-CbyfCPRD.css",
  "assets/theory-C2WABpHC.css",
  "assets/techniqueAnim-ST6YSjcw.css",
  "assets/report-CWYBP3i8.css",
  "assets/handArtLazy-K82ovvRo.css",
  "assets/middleC-Bif2ouu-.css",
  "assets/sing-DOgu-73Y.css",
  "assets/songRecord-DT9swKyc.css",
  "assets/musician-B7nzGNqS.css",
  "assets/library-CIrQOuWj.css",
  "assets/games-Bip_dXcB.css",
  "assets/parent-DxvUcg1M.css",
  "assets/session-B_p-ZR4d.css",
  "assets/song-Df74memO.css",
  "assets/home-B8j0mIGM.css",
  "assets/index-BOPsppx5.css",
  "assets/diagnostics-CFb8NxmF.js",
  "assets/freePlay-naiexMrX.js",
  "assets/shortSession-UxbyTpaG.js",
  "assets/islandAccents-ClPuKqzN.js",
  "assets/micLogStore-Bs8FYxfq.js",
  "assets/installCard-DnkpH_gr.js",
  "assets/songEditor-BEnzAw54.js",
  "assets/report-rGdP55L8.js",
  "assets/healthCheck-qV98iKYR.js",
  "assets/parentGuide-CYaQHU3i.js",
  "assets/handGuide-ByPqi_g2.js",
  "assets/handCards-DGXrIe4d.js",
  "assets/demoHands-D26PCy2x.js",
  "assets/keyboardHand-29ckcQsj.js",
  "assets/handTechniqueArt-By3zhz-A.js",
  "assets/handKit-Dd1YAsum.js",
  "assets/postureArt-D9x_HtGs.js",
  "assets/album-zSBF9Aa1.js",
  "assets/albumParent-cvyVifVM.js",
  "assets/glossary-BM2FK0q6.js",
  "assets/theorySeen-k-TNWE2x.js",
  "assets/rewardSongs-CnU4J21G.js",
  "assets/improv-B5QPRSEv.js",
  "assets/compose-Cqvl0g9Y.js",
  "assets/songArt-BjrKA-Lq.js",
  "assets/stage-C8OgtzI-.js",
  "assets/concert-CgNLO93i.js",
  "assets/earGuess-DWmBKnFr.js",
  "assets/beatCatch-cDOhJlVn.js",
  "assets/echo-DbWp687U.js",
  "assets/stickers-CeVwgUBW.js",
  "assets/twoHand-DgYoExGT.js",
  "assets/rhythm-vO3ugnQE.js",
  "assets/onboarding-BQVqXPlL.js",
  "assets/theory-DhI1lPJV.js",
  "assets/techniqueAnim-Bpaf427m.js",
  "assets/contour-fZ74uvgm.js",
  "assets/micTest-DFIngHRR.js",
  "assets/MicListener-Dd_B2SnB.js",
  "assets/demo-BbYJIl0T.js",
  "assets/weeklyReport-B25lE0Qj.js",
  "assets/report-BzCSsckA.js",
  "assets/micAutoReport-LBxLD_oO.js",
  "assets/handArtLazy-DxMj4eN-.js",
  "assets/middleC-B_COd7hY.js",
  "assets/sing-BFqUKB00.js",
  "assets/songRecord-BvbGK08c.js",
  "assets/parentFocus-RGbHcxWp.js",
  "assets/handDiagram-U0t5KeIt.js",
  "assets/musician-KmK7TxdU.js",
  "assets/library-x6p2SueP.js",
  "assets/games-CfcF250W.js",
  "assets/catalog-DsXRYDXq.js",
  "assets/parent-ClwuAJ8r.js",
  "assets/session-nuE4Rn16.js",
  "assets/song-WK73e3Q7.js",
  "assets/home-B6CQdido.js",
  "assets/index-Vz6Y7p0N.js",
  "assets/micSetup-C5QzJ_Zl.js",
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
