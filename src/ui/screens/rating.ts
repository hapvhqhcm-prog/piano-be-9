import { RATING_STARS } from '../../progress/ProgressStore';
import type { SelfRating } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';

const OPTIONS: Array<{ rating: SelfRating; emoji: string; label: string; praise: string }> = [
  { rating: 'all', emoji: '😄', label: 'Đánh được hết', praise: 'Tuyệt vời!' },
  { rating: 'some', emoji: '🙂', label: 'Còn vấp vài chỗ', praise: 'Con tiến bộ lắm!' },
  { rating: 'hard', emoji: '😅', label: 'Khó quá', praise: 'Con đã cố gắng — giỏi lắm!' },
];

/** Tổng kết: bé tự đánh giá → sao (§10). Không có đáp án "thua". */
export function ratingScreen(
  app: App,
  hooks: { onRate(r: SelfRating): void; onDone(): void; onBack(): void },
) {
  return (root: HTMLElement) => {
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));

    const ask = () => {
      stage.replaceChildren(
        h('h1', { class: 'title' }, 'Hôm nay con đánh thế nào?'),
        h(
          'div',
          { class: 'rating-options' },
          ...OPTIONS.map((o) =>
            button({
              icon: o.emoji,
              label: o.label,
              big: true,
              onTap: () => {
                hooks.onRate(o.rating);
                stars(o);
              },
            }),
          ),
        ),
      );
      bar.replaceChildren(backButton(hooks.onBack));
    };

    const stars = (o: (typeof OPTIONS)[number]) => {
      const n = RATING_STARS[o.rating];
      void app.audio.chime();
      stage.replaceChildren(
        h('div', { class: 'stars' }, '★'.repeat(n), h('span', { class: 'stars-off' }, '★'.repeat(3 - n))),
        h('h1', { class: 'title' }, o.praise),
      );
      bar.replaceChildren(
        backButton(ask),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    };
    ask();
  };
}
