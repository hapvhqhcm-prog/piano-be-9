import { cancelSpeech, speak } from '../../audio/voice';
import {
  POSTURE_CARD_MS,
  createPostureFlow,
  handFocus,
  handPrinciple,
  postureOrder,
  readHandLook,
  type PostureCard,
} from '../../lessons/handTechnique';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { principleFigure } from '../components/handCards';
import { handArtMod } from '../components/handArtLazy';
import { speakChip } from '../components/speakChip';
import '../../styles/parentux.css';

/**
 * Ba câu ngắn khi bé vấp — thay cho chê / giục (rà soát 2026-10-06). (2026-10-25, OWNER "bỏ phần phụ huynh") giờ là câu
 * BÉ TỰ NHỦ (không còn hộp "bố mẹ nói").
 */
export const PARENT_PHRASES = ['“Mình thử chậm hơn”', '“Ngón số mấy nhỉ?”', '“Nghỉ 1 phút rồi làm lại”'];

function coachBox(): HTMLElement {
  return h(
    'aside',
    { class: 'coach-box', 'aria-label': 'Khi vấp, con tự nhủ' },
    h('b', {}, '💬 Khi vấp, con tự nhủ:'),
    h('ul', {}, ...PARENT_PHRASES.map((t) => h('li', {}, t))),
  );
}

const TICK_MS = 250;

/**
 * Tư thế ĐẦY ĐỦ — (+ 2026-10-15, OWNER: "ngón tay phải đúng tư thế để đủ lực") dãy 4 THẺ CÓ TRANH ĐÚNG ✓ / CHƯA ĐÚNG ✗:
 * ngồi (đo ghế, kê chân) · dáng tay ôm bóng · đầu ngón đứng vững · cổ tay ngang & thả sức nặng cánh tay.
 * Mỗi thẻ tự sang thẻ sau sau ~9 giây (vuốt trái/phải hoặc "Tiếp" để nhanh hơn); thẻ cuối chờ "Xong rồi" → cả dãy ≤ 40 giây.
 * Luôn có "Bỏ qua ⏭". Bé vừa tự chấm "Làm lại" một lỗi tay (handFocus) → thẻ đó lên đầu, có nhãn "🎯 Hôm trước con nhắc mình điều này".
 * v5.2 (OWNER duyệt 2026-10-08): chỉ hiện ở bài tuần 1, buổi đầu mỗi tuần, hoặc khi cài đặt bật "nhắc tư thế đầy đủ"
 * (lessonEngine.postureFull); các buổi khác chỉ có câu nhắc một dòng (POSTURE_CUE) trên màn khởi động bằng nhạc.
 */
export function postureScreen(app: App, hooks: { onDone(): void; onBack(): void }) {
  return (root: HTMLElement) => {
    handArtMod.prefetch();
    let flag: ReturnType<typeof handFocus> = null;
    try {
      flag = handFocus(app.store.get(), Date.now(), readHandLook());
    } catch {
      flag = null;
    }
    const cards: PostureCard[] = postureOrder(flag);
    let left = false;
    const leave = (fn: () => void) => {
      if (left) return;
      left = true;
      window.clearInterval(timer);
      cancelSpeech();
      fn();
    };
    const flow = createPostureFlow(cards.length, () => leave(hooks.onDone), POSTURE_CARD_MS);
    const stage = h('div', { class: 'stage scrollable pz-flow' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));
    const fill = h('i');
    let spent = 0;

    const render = () => {
      if (left) return;
      spent = 0;
      fill.style.width = '0%';
      const i = flow.index;
      const c = cards[i];
      const last = i === cards.length - 1;
      const p = handPrinciple(c.principle);
      const bad = p.panels.find((x) => x.variant !== 'good');
      const said = `${c.text}. ${c.sub}`;
      const parts: (HTMLElement | null)[] = [
        h('div', { class: 'step-tag' }, `Tư thế · ${i + 1}/${cards.length}`),
        h('div', { class: 'pz-dots', 'aria-hidden': 'true' }, ...cards.map((_, k) => h('i', { class: k === i ? 'on' : undefined }))),
        last ? null : h('div', { class: 'pz-timebar', 'aria-hidden': 'true' }, fill),
        flag && c.principle === flag && i === 0 ? h('div', { class: 'pz-flagnote' }, '🎯 Con nhớ điều này nhé!') : null,
        h(
          'div',
          { class: 'pz-pair' },
          principleFigure(c.principle, 'good', p.panels[0].label),
          bad ? principleFigure(c.principle, bad.variant, bad.label) : null,
        ),
        h('h1', { class: 'title' }, `${c.emoji} ${c.text}`),
        h('p', { class: 'lead' }, c.sub, speakChip(app, said)),
        // Thẻ đầu (bé đang ngồi vào đàn): 3 câu bé tự nhủ khi vấp
        i === 0 ? coachBox() : null,
      ];
      stage.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
      bar.replaceChildren(
        backButton(() => (flow.prev() ? render() : leave(hooks.onBack))),
        button({ icon: '⏭', label: 'Bỏ qua', onTap: () => flow.skip() }),
        last
          ? button({ icon: '✓', label: 'Xong rồi', kind: 'good', onTap: () => flow.next() })
          : button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: () => (flow.next(), render()) }),
      );
      cancelSpeech();
      void speak(app, said);
    };

    // Vuốt ngang trên thẻ: trái → thẻ sau, phải → thẻ trước
    let x0: number | null = null;
    stage.addEventListener('pointerdown', (e) => (x0 = e.clientX));
    stage.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 60) return;
      if (dx < 0 && flow.index < cards.length - 1) (flow.next(), render());
      else if (dx > 0 && flow.prev()) render();
    });
    stage.addEventListener('pointercancel', () => (x0 = null));

    const timer = window.setInterval(() => {
      if (left || !root.isConnected) return window.clearInterval(timer);
      spent += TICK_MS;
      fill.style.width = `${Math.min(100, (spent / POSTURE_CARD_MS) * 100)}%`;
      if (flow.tick(TICK_MS)) render();
    }, TICK_MS);
    render();
    return () => {
      left = true;
      window.clearInterval(timer);
      cancelSpeech();
    };
  };
}
