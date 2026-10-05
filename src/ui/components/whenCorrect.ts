import { h } from './dom';

/**
 * "👪 Khi nào bấm Đúng rồi?" — chuẩn chấm cho bố mẹ không biết nhạc (thẻ 2 Hướng dẫn + màn Phụ huynh).
 * Một chuẩn rõ ràng → bố mẹ chấm nhất quán, bé không bị "khó tính" lúc này dễ dãi lúc khác.
 */
export function whenCorrectBox(heading: 'h3' | 'div' = 'h3'): HTMLElement {
  return h(
    'div',
    { class: 'when-correct' },
    h(heading, { class: 'when-title' }, '👪 Khi nào bấm “Đúng rồi”?'),
    h(
      'ul',
      {},
      h('li', {}, 'Đúng phím đang sáng ', h('b', {}, '+'), ' đúng số ngón trên màn hình → Đúng rồi'),
      h('li', {}, 'Ngập ngừng một chút, đàn còn nhỏ tiếng → vẫn là Đúng rồi'),
      h('li', {}, 'Đúng phím nhưng sai ngón → nhắc nhẹ số ngón, bé bấm lại rồi mới “Đúng rồi”'),
      h('li', {}, 'Sai phím → bấm “Thử lại” (không cần chê, app tự động viên)'),
    ),
  );
}
