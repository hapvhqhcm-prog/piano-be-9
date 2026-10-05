/**
 * Cập nhật app trên iPad.
 *
 * App chạy offline (cache-first) nên luôn mở bản đã lưu, bản mới tải ngầm. Web app trên Màn hình chính
 * của iPad thường chỉ "ngủ" chứ không đóng hẳn → phải tự hỏi bản mới mỗi khi được mở lại.
 *
 * Bản mới tải xong thì CHỜ (sw-template.js không còn skipWaiting() lúc cài) — KHÔNG bao giờ đổi phiên bản
 * giữa buổi học. Khi tới điểm an toàn (màn Bắt đầu / màn chính gọi markSafePoint(true)) mới gửi 'SKIP_WAITING'
 * cho bản đang chờ, rồi tải lại trang khi bản mới nhận quyền (controllerchange).
 * Lần cài đầu tiên (chưa có bản cũ) vẫn tự kích hoạt ngay như trước.
 */

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

let registration: ServiceWorkerRegistration | null = null;
/** Bản mới đã sẵn sàng (đang chờ, hoặc đã nhận quyền điều khiển) */
let updateReady = false;
let atSafePoint = false;
let lastCheck = 0;
/** Bản mới đang chờ kích hoạt */
let waitingWorker: ServiceWorker | null = null;
/** Đã gửi 'SKIP_WAITING' (chỉ gửi một lần cho mỗi bản chờ) */
let skipSent: ServiceWorker | null = null;
/** Bản mới đã nhận quyền điều khiển trang (trang đang chạy mã cũ) → tải lại ở điểm an toàn */
let controllerChanged = false;

function reloadNow(): void {
  window.location.reload();
}

/** Ở điểm an toàn: kích hoạt bản đang chờ (rồi tải lại khi đổi controller) hoặc tải lại luôn. */
function applyUpdate(): void {
  if (controllerChanged) {
    reloadNow();
    return;
  }
  const w = waitingWorker ?? registration?.waiting ?? null;
  if (w && skipSent !== w) {
    skipSent = w;
    try {
      w.postMessage('SKIP_WAITING');
    } catch {
      /* bỏ qua — lần sau thử lại */
      skipSent = null;
    }
  }
}

function setWaiting(w: ServiceWorker): void {
  // Chỉ là "bản mới" khi đã có bản cũ điều khiển trang; lần cài đầu thì SW tự kích hoạt
  if (!navigator.serviceWorker.controller) return;
  waitingWorker = w;
  updateReady = true;
  if (atSafePoint) applyUpdate();
}

function trackRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
  if (reg.waiting) setWaiting(reg.waiting);
  reg.addEventListener?.('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') setWaiting(w);
    });
  });
}

/** Màn Bắt đầu / màn chính gọi hàm này: nếu có bản mới thì kích hoạt + tải lại luôn. */
export function markSafePoint(safe: boolean): void {
  atSafePoint = safe;
  if (safe && updateReady) applyUpdate();
}

/** Hỏi máy chủ có bản mới không (có giới hạn tần suất). Trả về true nếu đã gửi yêu cầu. */
export async function checkForUpdate(force = false): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return false;
  const now = Date.now();
  if (!force && now - lastCheck < 30_000) return false;
  lastCheck = now;
  try {
    if (!registration) {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? null;
      if (reg) trackRegistration(reg);
    }
    if (!registration) return false;
    await registration.update();
    if (registration.waiting) setWaiting(registration.waiting);
    return true;
  } catch {
    return false;
  }
}

export function isUpdateReady(): boolean {
  return updateReady;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  // Trang này đã có service worker điều khiển từ trước → lần đổi controller sau là bản MỚI.
  // Trang cài lần đầu: lần đổi controller ĐẦU TIÊN chỉ là SW vừa cài nhận quyền (clients.claim); các lần sau mới là bản mới.
  let seen = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!seen) {
      seen = true; // lần cài đầu tiên, không phải cập nhật
      return;
    }
    controllerChanged = true;
    updateReady = true;
    waitingWorker = null;
    // Đang ở điểm an toàn (chính trang này vừa xin kích hoạt) → tải lại ngay; bé đã vào học → chờ điểm an toàn sau
    if (atSafePoint) reloadNow();
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      trackRegistration(reg);
      void checkForUpdate(true);
    })
    .catch((e) => console.warn('SW register failed', e));
  // iPad mở lại app đang "ngủ" → kiểm tra bản mới
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('pageshow', () => void checkForUpdate());
  window.addEventListener('online', () => void checkForUpdate(true));
}
