import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { postureArt, type PosturePart } from '../components/postureArt';
import '../../styles/parentux.css';

/** 👪 Ba câu ngắn bố mẹ nói khi bé vấp — thay cho chê / giục (rà soát hành trình phụ huynh 2026-10-06). */
export const PARENT_PHRASES = ['“Con thử chậm hơn nhé”', '“Ngón số mấy nhỉ?”', '“Nghỉ 1 phút rồi làm lại”'];

function coachBox(): HTMLElement {
  return h(
    'aside',
    { class: 'coach-box', 'aria-label': 'Câu nói cho bố mẹ' },
    h('b', {}, '👪 Khi bé vấp, bố mẹ nói:'),
    h('ul', {}, ...PARENT_PHRASES.map((t) => h('li', {}, t))),
  );
}

const SHORT = { emoji: '🧘', part: 'all' as PosturePart, text: 'Ngồi thẳng · chân vững · tay tròn', sub: 'Kiểm tra nhanh tư thế nhé!' };

const ALL_CARDS = [
  { emoji: '🪑', part: 'back' as PosturePart, text: 'Ngồi thẳng lưng', sub: 'Ngồi nửa trước ghế' },
  { emoji: '🦶', part: 'feet' as PosturePart, text: 'Hai bàn chân đặt vững', sub: 'Chạm sàn hoặc ghế kê chân' },
  { emoji: '⚽', part: 'hands' as PosturePart, text: 'Tay tròn như ôm quả bóng', sub: 'Cổ tay thẳng, không gập' },
];

/** Tư thế (1') — mỗi màn một việc (§4). */
export function postureScreen(_app: App, hooks: { short?: boolean; onDone(): void; onBack(): void }) {
  return (root: HTMLElement) => {
    // Bé đã quen (sau 3 buổi) → rút gọn còn 1 thẻ (v2)
    const CARDS = hooks.short ? [SHORT] : ALL_CARDS;
    let i = 0;
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));

    const render = () => {
      const c = CARDS[i];
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, `Tư thế · ${i + 1}/${CARDS.length}`),
        h('div', { class: 'posture-wrap' }, postureArt(c.part)),
        h('h1', { class: 'title' }, c.text),
        h('p', { class: 'lead' }, c.sub),
        // Thẻ đầu (bé đang ngồi vào đàn): bố mẹ đọc nhanh 3 câu động viên
        ...(i === 0 ? [coachBox()] : []),
      );
      bar.replaceChildren(
        backButton(() => (i > 0 ? (i--, render()) : hooks.onBack())),
        button({
          icon: '✓',
          label: 'Xong rồi',
          kind: 'good',
          onTap: () => (i < CARDS.length - 1 ? (i++, render()) : hooks.onDone()),
        }),
      );
    };
    render();
  };
}
