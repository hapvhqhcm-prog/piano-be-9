type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Tạo phần tử DOM nhỏ gọn: h('button', { class: 'btn', onClick }, 'Chữ'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

export interface ButtonOpts {
  icon?: string;
  label: string;
  onTap: () => void;
  kind?: 'primary' | 'good' | 'retry' | 'plain' | 'danger';
  disabled?: boolean;
  big?: boolean;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const b = h(
    'button',
    { class: `btn btn-${o.kind ?? 'plain'}${o.big ? ' btn-big' : ''}`, type: 'button' },
    o.icon ? h('span', { class: 'btn-icon', 'aria-hidden': 'true' }, o.icon) : null,
    h('span', { class: 'btn-label' }, o.label),
  );
  b.disabled = !!o.disabled;
  b.addEventListener('click', () => {
    if (!b.disabled) o.onTap();
  });
  return b;
}

/** Nút "Quay lại": kiểu nhẹ (ghost) và nằm sát mép trái thanh nút — không lẫn với nút chính. */
export function backButton(onTap: () => void): HTMLButtonElement {
  const b = button({ icon: '←', label: 'Quay lại', onTap, kind: 'plain' });
  b.classList.add('btn-back');
  return b;
}

/** Thanh nút cố định cuối màn hình (tối đa 4 nút — §4). Nút Quay lại (.btn-back) tự dạt sang trái (CSS). */
export function actionBar(...buttons: (HTMLElement | null | false)[]): HTMLElement {
  return h('div', { class: 'actions' }, ...buttons);
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** Thông báo ngắn, tự ẩn sau ~2 giây (vd khi bé chạm vào bài còn khóa) — để chạm không bao giờ "im lặng". */
export function toast(text: string, ms = 2000): void {
  if (!toastEl || !toastEl.isConnected) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  const el = toastEl;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // chạy lại hiệu ứng khi chạm liên tiếp
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}
