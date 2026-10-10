/**
 * (+ 2026-10-10) Nhãn "Mới" cho bé (logic: src/lessons/discovery.ts). Không phải màn mừng — chỉ một viên / một chấm nhỏ.
 */
import { h } from './dom';
import '../../styles/discovery.css';

/** Viên "Mới" đặt trên thẻ (thẻ cần lớp .has-new — newPillOn tự thêm). */
export function newPill(): HTMLElement {
  return h('span', { class: 'new-pill', role: 'img', 'aria-label': 'mới' }, 'Mới');
}

/** Gắn viên "Mới" vào một thẻ / nút. */
export function newPillOn<T extends HTMLElement>(el: T): T {
  el.classList.add('has-new');
  el.append(newPill());
  return el;
}

/** Chấm nhỏ trên nút ở màn chính (một chấm — không có số). Gắn lại nhiều lần vẫn chỉ một chấm. */
export function newDotOn<T extends HTMLElement>(el: T): T {
  if (!el.querySelector(':scope > .new-dot')) {
    el.classList.add('has-new');
    el.append(h('span', { class: 'new-dot', role: 'img', 'aria-label': 'mới' }));
  }
  return el;
}
