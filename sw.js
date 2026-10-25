/* Service worker sinh lúc build (vite.config.ts). Offline-first, chỉ same-origin. */
const VERSION = 'cc1c9425b548';
const PREFIX = 'piano-be-9-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  "./",
  "index.html",
  "assets/baloo-2-vietnamese-700-normal-h4tlcePq.woff2",
  "assets/baloo-2-latin-800-normal-BbF3Etk1.woff2",
  "assets/baloo-2-latin-700-normal-CqTg7A15.woff2",
  "assets/baloo-2-vietnamese-800-normal-ConLnEgt.woff2",
  "assets/nunito-latin-800-normal-Dz8SOQK_.woff2",
  "assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2",
  "assets/nunito-latin-600-normal-Br8yIETf.woff2",
  "assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2",
  "assets/diagnostics-CbyfCPRD.css",
  "assets/parentux-CxfPdK0f.css",
  "assets/theory-C2WABpHC.css",
  "assets/techniqueAnim-ST6YSjcw.css",
  "assets/rhythm-Bb29D8rv.css",
  "assets/report-CWYBP3i8.css",
  "assets/handArtLazy-K82ovvRo.css",
  "assets/middleC-Bif2ouu-.css",
  "assets/sing-DOgu-73Y.css",
  "assets/tapeRecorder-C0Qn7YVS.css",
  "assets/songRecord-DT9swKyc.css",
  "assets/musician-B7nzGNqS.css",
  "assets/library-CIrQOuWj.css",
  "assets/games-Dw7Y9Jab.css",
  "assets/parent-DxvUcg1M.css",
  "assets/session-B_p-ZR4d.css",
  "assets/song-CXB8P9QW.css",
  "assets/home-Cco1gcaG.css",
  "assets/index-C1xi-zOQ.css",
  "assets/reviewAudio-D1k5w4Ni.js",
  "assets/diagnostics-Ca4e4G8Z.js",
  "assets/freePlay-BorOvxnb.js",
  "assets/shortSession-PcPO5OTU.js",
  "assets/islandAccents-DveVWjmC.js",
  "assets/installCard-Bp9SwcRX.js",
  "assets/weekHold-C2aI6nPz.js",
  "assets/testOut-pLmdzMZ8.js",
  "assets/placement-CvKwh9wY.js",
  "assets/songEditor-B2AFHovA.js",
  "assets/report-DyU93cXx.js",
  "assets/micLogStore-Bs8FYxfq.js",
  "assets/parentGuide-Tj0PbWMY.js",
  "assets/onboarding-CcybfqhI.js",
  "assets/handGuide-DMVfwnFS.js",
  "assets/handCards-OcQPpvzV.js",
  "assets/album-Lz-17Xdn.js",
  "assets/albumParent-C_H8Tiyp.js",
  "assets/glossary-C8FApiQT.js",
  "assets/theorySeen-k-TNWE2x.js",
  "assets/demoHands-CwVJe1uk.js",
  "assets/keyboardHand-CTm3SKsN.js",
  "assets/rewardSongs-B4tbcO1e.js",
  "assets/improv-DNuh9dwa.js",
  "assets/compose-CE6qRw8A.js",
  "assets/songArt-BjrKA-Lq.js",
  "assets/postureArt-DD5gvP1z.js",
  "assets/micAllow-Bd5mrJbh.js",
  "assets/diagramKit-cFiMD_oO.js",
  "assets/shareFile-BorJeR-X.js",
  "assets/stage-Bu_LulcP.js",
  "assets/concert-C-5117Y1.js",
  "assets/handTechniqueArt-CsDB_dCp.js",
  "assets/earGuess-BygJkWa5.js",
  "assets/beatCatch-Dy7DRkdw.js",
  "assets/echo-DcGJ_jDJ.js",
  "assets/stickers-CYKe3-Ln.js",
  "assets/skipRunner-LWeI3SHN.js",
  "assets/healthCheck-C6nmJc1L.js",
  "assets/recorder-DpXo5yDq.js",
  "assets/theory-Bz9ObKvi.js",
  "assets/techniqueAnim-DEiOaQoX.js",
  "assets/contour-CMlO7fQ9.js",
  "assets/micTest-Cdamhq7U.js",
  "assets/handDiagram-DEOsbzMQ.js",
  "assets/rhythm-YJvMYsNH.js",
  "assets/report-DYWFc-iD.js",
  "assets/micAutoReport-BLhJGPS-.js",
  "assets/handArtLazy-DerWicZO.js",
  "assets/middleC-QsWggOSg.js",
  "assets/MicListener-vWq8DoDd.js",
  "assets/voiceGuard-CxTHi74O.js",
  "assets/sing-BpL1T99b.js",
  "assets/tapeRecorder-DxGIF3Gv.js",
  "assets/songRecord-BUjo62KF.js",
  "assets/practice-CHXc3kug.js",
  "assets/staffView-BsuA7JBZ.js",
  "assets/weeklyReport-C1GLQ9mD.js",
  "assets/musician-nZbraTXe.js",
  "assets/library-Br-76fDu.js",
  "assets/games-BkTjtJPS.js",
  "assets/catalog-DJFc-AiT.js",
  "assets/parent-C8OFjrEE.js",
  "assets/session-DZt6prUV.js",
  "assets/song-Deg8L0tq.js",
  "assets/home-D0Fkdqs9.js",
  "assets/index-Jo0INxx0.js",
  "assets/micSetup-CGUidLzd.js",
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
