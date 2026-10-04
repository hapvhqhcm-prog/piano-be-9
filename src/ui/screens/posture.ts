import type { App } from '../App';
import { backButton, button, h } from '../components/dom';

const CARDS = [
  { emoji: '🪑', text: 'Ngồi thẳng lưng', sub: 'Ngồi nửa trước ghế' },
  { emoji: '🦶', text: 'Hai bàn chân đặt vững', sub: 'Chạm sàn hoặc ghế kê chân' },
  { emoji: '⚽', text: 'Tay tròn như ôm quả bóng', sub: 'Cổ tay thẳng, không gập' },
];

/** Tư thế (1') — mỗi màn một việc (§4). */
export function postureScreen(_app: App, hooks: { onDone(): void; onBack(): void }) {
  return (root: HTMLElement) => {
    let i = 0;
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));

    const render = () => {
      const c = CARDS[i];
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, `Tư thế · ${i + 1}/${CARDS.length}`),
        h('div', { class: 'hero-emoji huge' }, c.emoji),
        h('h1', { class: 'title' }, c.text),
        h('p', { class: 'lead' }, c.sub),
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
