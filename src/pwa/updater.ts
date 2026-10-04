/**
 * Cập nhật app trên iPad.
 *
 * App chạy offline (cache-first) nên luôn mở bản đã lưu, bản mới tải ngầm. Web app trên Màn hình chính
 * của iPad thường chỉ "ngủ" chứ không đóng hẳn → phải tự hỏi bản mới mỗi khi được mở lại.
 * Khi bản mới đã sẵn sàng: tải lại ngay nếu đang ở màn an toàn (Bắt đầu / màn chính),
 * KHÔNG bao giờ cắt ngang khi bé đang học.
 */

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

let registration: ServiceWorkerRegistration | null = null;
let updateReady = false;
let atSafePoint = false;
let lastCheck = 0;

function reloadNow(): void {
  window.location.reload();
}

/** Màn Bắt đầu / màn chính gọi hàm này: nếu có bản mới thì tải lại luôn. */
export function markSafePoint(safe: boolean): void {
  atSafePoint = safe;
  if (safe && updateReady) reloadNow();
}

/** Hỏi máy chủ có bản mới không (có giới hạn tần suất). Trả về true nếu đã gửi yêu cầu. */
export async function checkForUpdate(force = false): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return false;
  const now = Date.now();
  if (!force && now - lastCheck < 30_000) return false;
  lastCheck = now;
  try {
    registration ??= (await navigator.serviceWorker.getRegistration()) ?? null;
    if (!registration) return false;
    await registration.update();
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
  // Trang cài lần đầu: lần đổi controller ĐẦU TIÊN chỉ là SW vừa cài nhận quyền; các lần sau mới là bản mới.
  let seen = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!seen) {
      seen = true; // lần cài đầu tiên, không phải cập nhật
      return;
    }
    updateReady = true;
    if (atSafePoint) reloadNow();
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
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
