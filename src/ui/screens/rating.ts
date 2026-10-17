import { sessionRecap } from '../../lessons/bonusStickers';
import { mascot } from '../components/mascot';
import { confetti } from '../components/celebrate';
import type { SelfRating } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { cancelSpeech, speak } from '../../audio/voice';
import { speakChip } from '../components/speakChip';
import { TEACH_TITLE, teachCard } from './teach';
import { parentCorner } from '../components/parentCorner';

/**
 * Câu nào cũng là câu trả lời tốt — số sao KHÔNG phụ thuộc câu trả lời (sao = đúng ngay lần đầu trong buổi, ≥ 1).
 * Bé nói thật "khó quá" = thông tin quý cho bố mẹ, không bao giờ bị ít sao hơn.
 */
const OPTIONS: Array<{ rating: SelfRating; emoji: string; label: string; praise: string }> = [
  // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") nhãn & lời khen NGẮN (chữ của bé ≤ 12 tiếng mỗi màn)
  { rating: 'all', emoji: '😄', label: 'Dễ', praise: 'Tuyệt vời! Mai thử khó hơn nhé.' },
  { rating: 'some', emoji: '🙂', label: 'Vừa', praise: 'Vấp là đang học đó!' },
  { rating: 'hard', emoji: '😅', label: 'Khó', praise: 'Cảm ơn con đã nói thật!' },
];

const QUESTION = 'Hôm nay con thấy thế nào?';
/** (+ 2026-10-17) Sao sau khi bé chọn hiện ngần này ms rồi tự sang màn kết buổi. */
export const STARS_MS = 1500;


/** Sao của buổi ĐANG học (buổi chưa đóng gần nhất); không tìm thấy → 3. */
function sessionStars(app: App): 1 | 2 | 3 {
  const open = [...app.store.get().sessions].reverse().find((s) => !s.completed);
  return open ? sessionRecap(open).stars : 3;
}

export interface ClosingHooks {
  /** Thẻ "Con làm thầy" ở đầu màn; null = chỉ tự chấm (chơi lại / sân khấu) */
  teach: { emoji: string; text: string } | null;
  /** (+ 2026-10-15) Dòng "📝 Bài tập về nhà" cho BỐ MẸ (chỗ thầy dặn hôm nay — lessons/homework.ts); null/không có = không hiện */
  homework?: string | null;
  /** (+ 2026-10-17) Lời nhắn cho bố mẹ: bài tập về nhà vừa TẠM DỪNG (lessons/homework.ts reassignHomework); null/không có = không hiện */
  homeworkNote?: string | null;
  /**
   * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") Chip KHÔNG bắt buộc "📘 1 thẻ mới" (thẻ "Biết thêm" của bài — đã ra khỏi
   * buổi). null/không có = không hiện.
   */
  theory?: { label: string; onOpen(): void } | null;
  /** Bố mẹ bấm "Bố mẹ đã học xong" (PARENT_ASSESSMENT 'teach-back') — tối đa một lần */
  onTaught(): void;
  onRate(r: SelfRating): void;
  onDone(): void;
  onBack(): void;
}

/**
 * v5.1 — MÀN KẾT (OWNER duyệt 2026-10-06 — buổi ≤ 7 màn): gộp "Con làm thầy" + tự chấm vào MỘT màn.
 * Trên: thẻ "Con làm thầy" (bé dạy lại bố mẹ, bố mẹ bấm xác nhận — không bắt buộc). Dưới: "Hôm nay con thấy thế nào?"
 * Dễ / Vừa / Khó → sao như nhau cho mọi câu (§10) → Tiếp. Không có đáp án "thua".
 */
export function closingScreen(app: App, hooks: ClosingHooks) {
  return (root: HTMLElement) => {
    const stage = h('div', { class: 'stage scrollable' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));
    // Thẻ dựng MỘT lần — quay lại từ màn sao vẫn giữ trạng thái "đã học xong"
    const card = hooks.teach ? teachCard(app, hooks.teach, hooks.onTaught) : null;

    const ask = () => {
      const options = OPTIONS.map((o) => {
        const b = button({
          icon: o.emoji,
          label: o.label,
          big: true,
          onTap: () => {
            hooks.onRate(o.rating);
            stars(o);
          },
        });
        // Có thẻ "Con làm thầy" ở trên → nút thấp hơn chút cho vừa một màn iPad
        if (card) b.classList.add('rate-compact');
        return b;
      });
      const theory = hooks.theory
        ? h('button', { class: 'closing-theory', type: 'button', 'aria-label': 'Mở thẻ nhạc lý mới (không bắt buộc)' }, hooks.theory.label)
        : null;
      theory?.addEventListener('click', () => hooks.theory?.onOpen());
      stage.replaceChildren(
        ...(card ? [card] : []),
        h('h1', { class: 'title' }, QUESTION, speakChip(app, QUESTION)),
        h('div', { class: 'rating-options' }, ...options),
        theory ?? '',
      );
      // (+ 2026-10-17, OWNER duyệt) chữ cho bố mẹ (bài tập về nhà / lời nhắn) → góc 👪 thu gọn, không giữa màn của bé
      parentCorner(
        root,
        hooks.homework ? h('p', { class: 'closing-homework' }, h('b', {}, '📝 Bài tập về nhà: '), hooks.homework) : null,
        !hooks.homework && hooks.homeworkNote ? h('p', { class: 'closing-homework' }, hooks.homeworkNote) : null,
      );
      bar.replaceChildren(backButton(hooks.onBack));
    };

    const stars = (o: (typeof OPTIONS)[number]) => {
      cancelSpeech();
      // Playtest 2026-10: sao có ý nghĩa — theo tỉ lệ đúng NGAY LẦN ĐẦU của buổi (≥ 1 sao, không có dữ liệu = 3 sao).
      // KHÔNG phụ thuộc câu bé chọn (Dễ / Vừa / Khó) → nói thật không bao giờ bị ít sao hơn.
      const n = sessionStars(app);
      void app.audio.chime();
      confetti(); // mừng vì HỌC XONG BUỔI — như nhau cho mọi câu trả lời
      stage.replaceChildren(
        h('div', { class: 'hero-mascot' }, mascot('love', 100)),
        h('div', { class: 'stars' }, '★'.repeat(n), h('span', { class: 'stars-off' }, '★'.repeat(3 - n))),
        h('h1', { class: 'title' }, o.praise),
      );
      // (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") không còn màn sao phải bấm "Tiếp" — sao hiện ~1,5 giây rồi tự sang
      bar.replaceChildren();
      const gen = ++rated;
      window.setTimeout(() => gen === rated && root.isConnected && hooks.onDone(), STARS_MS);
    };
    let rated = 0;
    ask();
    const said = hooks.teach ? `${TEACH_TITLE} ${hooks.teach.text} Xong rồi, ${QUESTION.toLowerCase()}` : QUESTION;
    const timer = window.setTimeout(() => void speak(app, said), 400);
    return () => {
      window.clearTimeout(timer);
      cancelSpeech();
    };
  };
}


/** Màn kết KHÔNG có thẻ "Con làm thầy" (giữ tên cũ — scripts/shots.scenes.mjs dùng). */
export function ratingScreen(app: App, hooks: { onRate(r: SelfRating): void; onDone(): void; onBack(): void }) {
  return closingScreen(app, { ...hooks, teach: null, onTaught: () => undefined });
}
