import { h } from './dom';

/**
 * Nút "⚙️" Cài đặt (trước 2026-10-25: "👪 Phụ huynh"): nhỏ, kín đáo, phải NHẤN GIỮ 2 giây (§8) rồi qua cổng tính nhẩm.
 * Chống vào nhầm, không phải bảo mật. Giữ lớp .parent-btn (scripts/e2e.mjs, webkit-smoke.mjs) + thêm .settings-btn.
 */
export function parentButton(onUnlock: () => void, holdMs = 2000): HTMLButtonElement {
  const fill = h('span', { class: 'hold-fill' });
  const btn = h(
    'button',
    { class: 'parent-btn settings-btn', type: 'button', 'aria-label': 'Cài đặt — nhấn giữ 2 giây', 'data-test': 'settings' },
    fill,
    h('span', { class: 'parent-btn-label', 'aria-hidden': 'true' }, '⚙️'),
  );
  let timer: number | undefined;
  const cancel = () => {
    window.clearTimeout(timer);
    timer = undefined;
    btn.classList.remove('holding');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cancel();
    btn.classList.add('holding');
    fill.style.transitionDuration = `${holdMs}ms`;
    timer = window.setTimeout(() => {
      cancel();
      onUnlock();
    }, holdMs);
  });
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return btn;
}
