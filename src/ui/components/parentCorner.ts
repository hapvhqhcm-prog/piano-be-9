/**
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") GÓC 👪 BỐ MẸ thu gọn: chữ dành cho bố mẹ (dải "Hôm nay để ý", bài tập
 * về nhà, lời dặn dừng ở đây…) KHÔNG nằm giữa màn của bé nữa — gom vào MỘT nút 👪 nhỏ ở góc trên; chạm để mở / đóng.
 * Bé chỉ thấy chữ của bé (≤ 12 tiếng mỗi màn, giọng đọc đọc to). Không đọc to, không ghi gì.
 * Mỗi màn tối đa MỘT góc (gọi lại → thêm dòng vào góc đã có).
 */
import { h } from './dom';
import '../../styles/parentCorner.css';

type Line = Node | string | null | undefined | false;

/** Gắn (hoặc thêm dòng vào) góc 👪 của `root`. Trả về phần tử góc, null khi không có dòng nào. */
export function parentCorner(root: HTMLElement, ...lines: Line[]): HTMLElement | null {
  const items = lines.filter((x): x is Node | string => !!x);
  if (!items.length) return null;
  let box = root.querySelector<HTMLDetailsElement>(':scope > details.pcorner');
  if (!box) {
    box = h(
      'details',
      { class: 'pcorner' },
      h('summary', { class: 'pcorner-btn', 'aria-label': 'Dành cho bố mẹ' }, '👪'),
      h('div', { class: 'pcorner-body', role: 'note' }),
    );
    root.append(box);
  }
  const body = box.querySelector('.pcorner-body')!;
  for (const x of items) {
    // cùng một dòng chữ đã có (màn vẽ lại) → không thêm lần nữa
    if (typeof x === 'string' && [...body.children].some((el) => el.textContent === x)) continue;
    body.append(typeof x === 'string' ? h('p', { class: 'pcorner-line' }, x) : x);
  }
  box.dataset.n = String(body.childElementCount);
  return box;
}
