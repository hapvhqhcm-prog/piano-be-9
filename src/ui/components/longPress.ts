import { h } from './dom';

/**
 * Nút "Phụ huynh": phải NHẤN GIỮ 2 giây (§8). Chống vào nhầm, không phải bảo mật.
 */
export function parentButton(onUnlock: () => void, holdMs = 2000): HTMLButtonElement {
  const fill = h('span', { class: 'hold-fill' });
  const btn = h(
    'button',
    { class: 'parent-btn', type: 'button', 'aria-label': 'Phụ huynh — nhấn giữ 2 giây' },
    fill,
    h('span', { class: 'parent-btn-label' }, '👪 Phụ huynh'),
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
