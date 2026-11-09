/* Service worker sinh lúc build (vite.config.ts). Offline-first, chỉ same-origin. */
const VERSION = '98c1eb76f676';
const PREFIX = 'piano-be-9-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  "./",
  "index.html",
  "assets/baloo-2-vietnamese-800-normal-ConLnEgt.woff2",
  "assets/baloo-2-latin-700-normal-CqTg7A15.woff2",
  "assets/nunito-latin-800-normal-Dz8SOQK_.woff2",
  "assets/baloo-2-vietnamese-700-normal-h4tlcePq.woff2",
  "assets/nunito-latin-600-normal-Br8yIETf.woff2",
  "assets/baloo-2-latin-800-normal-BbF3Etk1.woff2",
  "assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2",
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
  "assets/library-B_5FayAT.css",
  "assets/games-Dw7Y9Jab.css",
  "assets/parent-DxvUcg1M.css",
  "assets/session-B_p-ZR4d.css",
  "assets/song-CXB8P9QW.css",
  "assets/home-Cco1gcaG.css",
  "assets/index-jsWgZeCv.css",
  "assets/reviewAudio-D1k5w4Ni.js",
  "assets/diagnostics-BPnpEXAb.js",
  "assets/freePlay-0A7SoT8v.js",
  "assets/shortSession-hOkgHhFK.js",
  "assets/islandAccents-CyE0XBgY.js",
  "assets/installCard-DsIlc6zZ.js",
  "assets/weekHold-C2aI6nPz.js",
  "assets/testOut-DxUwRU8h.js",
  "assets/placement-Dm6YLiHc.js",
  "assets/songEditor-BzhRD670.js",
  "assets/report-DmyJ_Ba2.js",
  "assets/micLogStore-Bs8FYxfq.js",
  "assets/parentGuide-VeYkI1oc.js",
  "assets/onboarding-Bp-xKasR.js",
  "assets/handGuide-BxC_sG2J.js",
  "assets/handCards-DGUU3ZeH.js",
  "assets/album-Co_2xWZD.js",
  "assets/albumParent-B0F0Edk-.js",
  "assets/glossary-BfPrIEN0.js",
  "assets/theorySeen-k-TNWE2x.js",
  "assets/demoHands-1Va8jWjO.js",
  "assets/keyboardHand-_49Le8q9.js",
  "assets/rewardSongs-n3-vCuXr.js",
  "assets/improv-DayCCjq9.js",
  "assets/compose-CNN0lm4g.js",
  "assets/shareFile-Dxw2yfRo.js",
  "assets/songArt-BjrKA-Lq.js",
  "assets/postureArt-bwJoM9FF.js",
  "assets/micAllow-BdS477va.js",
  "assets/diagramKit-rCkhEpCR.js",
  "assets/stage-CWiWEjP5.js",
  "assets/concert-PbTuRi1G.js",
  "assets/handTechniqueArt-Bg2ll-7H.js",
  "assets/earGuess-BGno9Grr.js",
  "assets/beatCatch-PpvY1bo-.js",
  "assets/echo-D-TjgnEw.js",
  "assets/stickers-Bzncvmbo.js",
  "assets/skipRunner-D1NDIsEY.js",
  "assets/healthCheck-D79CqdAC.js",
  "assets/recorder-DpXo5yDq.js",
  "assets/theory-HpFfqwv4.js",
  "assets/techniqueAnim-CZA_U4vF.js",
  "assets/contour-BRvMCU_2.js",
  "assets/micTest-DrGAwLHb.js",
  "assets/handDiagram-BSfUjVfo.js",
  "assets/rhythm-DHjWcNep.js",
  "assets/report-FzRtRpBo.js",
  "assets/micAutoReport-A0HVioRb.js",
  "assets/handArtLazy-B_rgEVi4.js",
  "assets/middleC-22gF44jp.js",
  "assets/MicListener-DlVJQJbc.js",
  "assets/sing-Be3s3Q42.js",
  "assets/tapeRecorder-oPuw7Bie.js",
  "assets/songRecord-DzVKNnkN.js",
  "assets/practice-BupOuAzA.js",
  "assets/staffView-DHJ3ROTQ.js",
  "assets/weeklyReport-CKcm3jeG.js",
  "assets/micClaims-CioB98V5.js",
  "assets/musician-BfFx1kG-.js",
  "assets/library-BSZRi8r3.js",
  "assets/games-ClX3mz0q.js",
  "assets/catalog-U-dDKsIF.js",
  "assets/parent-C2BnKoM9.js",
  "assets/session-C19C4NAp.js",
  "assets/song-CZ-1uKmg.js",
  "assets/home-B7rBVAGD.js",
  "assets/index-DOnks47a.js",
  "assets/micSetup-BxBQwDJG.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "manifest.webmanifest"
];
// ignoreVary: server (vd "Vary: Origin") làm request module script không khớp cache khi offline.
const MATCH = { ignoreSearch: true, ignoreVary: true };
// (+ 2026-11-08) Giọng đọc thu sẵn (voice/hm/): KHÔNG precache (hàng chục MB). Kho riêng, giữ qua mọi bản cập nhật
// (không có tiền tố PREFIX nên 'activate' không dọn). File .mp3 đặt tên theo mã câu → không bao giờ đổi nội dung.
const VOICE_CACHE = 'pb9-voice-hm';
const VOICE_PATH = '/voice/hm/';

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

  if (url.pathname.includes(VOICE_PATH)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VOICE_CACHE);
        if (url.pathname.endsWith('/index.json')) {
          // danh sách câu: mạng trước (có câu mới), mất mạng → bản đã lưu
          try {
            const r = await fetch(req, { cache: 'no-cache' });
            if (r.ok) await cache.put(req, r.clone());
            return r;
          } catch (e) {
            const c = await cache.match(req, MATCH);
            if (c) return c;
            throw e;
          }
        }
        const c = await cache.match(req, MATCH);
        if (c) return c;
        const r = await fetch(req);
        if (r.ok) await cache.put(req, r.clone());
        return r;
      })(),
    );
    return;
  }

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
