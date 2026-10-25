/**
 * (2026-10-25, OWNER "bỏ phần phụ huynh") 🎤 BÉ TỰ BẬT MICRO — không cần nhờ bố mẹ.
 * Chạm nút → bật micro trong cài đặt của app (nếu đang tắt) rồi xin quyền micro của iPad (iPad hiện hộp hỏi, bé chạm
 * "Cho phép"). Công tắc TẮT micro chỉ nằm trong ⚙️ Cài đặt (sau cổng người lớn). 👤 Khách chơi: không đổi cài đặt.
 */
import type { App } from '../App';
import { button } from './dom';

/** Lời cho bé theo kết quả bật micro */
export const MIC_ALLOW_HINT = 'Khi iPad hỏi, con chạm “Cho phép” nhé!';

/** Bật micro (cài đặt + quyền iPad). true = micro đang nghe. Không bao giờ ném lỗi. */
export async function allowMic(app: App): Promise<boolean> {
  try {
    if (!app.store.settings.micEnabled && !app.store.guest) app.store.updateSettings({ micEnabled: true });
    return await app.ensureMic();
  } catch {
    return false;
  }
}

/** Nút "🎤 Bật micro" (data-test="mic-allow"). `onDone(true)` = micro đang nghe. */
export function micAllowButton(app: App, onDone: (on: boolean) => void, label = 'Bật micro'): HTMLButtonElement {
  const b = button({
    icon: '🎤',
    label,
    kind: 'primary',
    onTap: () => {
      b.disabled = true;
      void allowMic(app).then((on) => {
        b.disabled = false;
        onDone(on);
      });
    },
  });
  b.setAttribute('data-test', 'mic-allow');
  return b;
}
