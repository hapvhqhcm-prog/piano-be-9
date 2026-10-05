import { RATING_STARS } from '../../progress/ProgressStore';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import type { SelfRating } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';

/**
 * Câu nào cũng là câu trả lời tốt — sao như nhau (thưởng cho việc học xong buổi, RATING_STARS).
 * Bé nói thật "khó quá" = thông tin quý cho bố mẹ, không bao giờ bị ít sao hơn.
 */
const OPTIONS: Array<{ rating: SelfRating; emoji: string; label: string; praise: string }> = [
  { rating: 'all', emoji: '😄', label: 'Dễ — con đàn được', praise: 'Tuyệt vời! Mai mình thử khó hơn chút nhé.' },
  { rating: 'some', emoji: '🙂', label: 'Vừa — còn vấp chút', praise: 'Vấp là đang học đó! Con giỏi lắm.' },
  { rating: 'hard', emoji: '😅', label: 'Khó — con cần tập thêm', praise: 'Cảm ơn con đã nói thật! Bố mẹ sẽ giúp con chỗ khó.' },
];

const QUESTION = 'Hôm nay con thấy thế nào?';

/** Tổng kết: bé kể cảm nhận → sao như nhau cho mọi câu (§10). Không có đáp án "thua". */
export function ratingScreen(
  app: App,
  hooks: { onRate(r: SelfRating): void; onDone(): void; onBack(): void },
) {
  return (root: HTMLElement) => {
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));

    const ask = () => {
      stage.replaceChildren(
        h('h1', { class: 'title' }, QUESTION, speakChip(app, QUESTION)),
        h('p', { class: 'lead' }, 'Con chọn câu nào cũng được sao — nói thật nhé!'),
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
      cancelSpeech();
      const n = Math.min(3, RATING_STARS[o.rating]);
      void app.audio.chime();
      confetti(); // mừng vì HỌC XONG BUỔI — như nhau cho mọi câu trả lời
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('love', 100)),
        h('div', { class: 'stars' }, '★'.repeat(n), h('span', { class: 'stars-off' }, '★'.repeat(3 - n))),
        h('h1', { class: 'title' }, o.praise),
        h('p', { class: 'lead' }, 'Sao này là vì con đã học xong buổi hôm nay!'),
      );
      bar.replaceChildren(
        backButton(ask),
        button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }),
      );
    };
    ask();
    const timer = window.setTimeout(() => void speak(app, QUESTION), 400);
    return () => {
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}
