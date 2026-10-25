/**
 * (2026-10-25, OWNER: "tôi hầu như không có thời gian vào app, hãy bỏ phần phụ huynh ra") 👦 BÉ TỰ KIỂM TRA — dùng chung.
 *
 * App không còn bước nào cần bố mẹ. Chấm điểm:
 *   (a) MICRO chấm khi nghe được (micro bật sẵn cho người dùng mới; bé tự chạm "Cho phép" khi iPad hỏi);
 *   (b) chỗ micro không chấm được (tư thế, dáng tay, ngón, kỹ thuật, pedal, liền tiếng, micro tắt / chưa cho phép / nghe
 *       chưa rõ) → BÉ TỰ KIỂM TRA, thật thà: "Con đã làm đúng chưa?  👍 Rồi  ·  🔁 Làm lại".
 * Không bao giờ chặn bé chờ người lớn. Kết quả bé tự kiểm tra ghi như trước (PARENT_ASSESSMENT / lượt bài hát source
 * 'parent' kèm phiếu 3 ý) và được đóng dấu `by: 'self'` (ProgressStore) — tiêu chí tuần đọc như cũ.
 *
 * Kiểm thử (scripts/e2e.mjs, webkit-smoke.mjs): nút "👍 Rồi" có data-test="self-ok", "🔁 Làm lại" có data-test="self-again".
 */
import { button, h } from './components/dom';
import '../styles/selfstudy.css';

/** Câu hỏi mặc định */
export const SELF_ASK = 'Con đã làm đúng chưa?';
/** Nút "👍 Rồi" (bé tự xác nhận làm đúng) */
export const SELF_OK = { icon: '👍', label: 'Rồi' } as const;
/** Nút "🔁 Làm lại" (bé thấy chưa đúng → làm lại, không bị chê) */
export const SELF_AGAIN = { icon: '🔁', label: 'Làm lại' } as const;
/** Lời nhắc thật thà (một dòng nhỏ dưới câu hỏi) */
export const SELF_HONEST = 'Con tự kiểm tra thật thà nhé — làm lại cũng giỏi!';

/** Nút "👍 Rồi" (data-test="self-ok"). `label` đổi chữ khi cần (vd "Rồi, đúng hết!"). */
export function selfOkButton(onTap: () => void, o: { label?: string; disabled?: boolean; primary?: boolean } = {}): HTMLButtonElement {
  const b = button({ icon: SELF_OK.icon, label: o.label ?? SELF_OK.label, kind: o.primary === false ? 'plain' : 'good', disabled: o.disabled, onTap });
  b.setAttribute('data-test', 'self-ok');
  return b;
}

/** Nút "🔁 Làm lại" (data-test="self-again"). */
export function selfAgainButton(onTap: () => void, o: { label?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = button({ icon: SELF_AGAIN.icon, label: o.label ?? SELF_AGAIN.label, kind: 'retry', disabled: o.disabled, onTap });
  b.setAttribute('data-test', 'self-again');
  return b;
}

/** Khối câu hỏi bé tự kiểm tra (đặt trong màn): câu hỏi to + (tuỳ chọn) danh sách ý cần tự xem + lời nhắc thật thà. */
export function selfAsk(question: string = SELF_ASK, points: readonly string[] = []): HTMLElement {
  return h(
    'div',
    { class: 'self-ask', role: 'group', 'aria-label': 'Con tự kiểm tra' },
    h('b', { class: 'self-ask-q' }, `🤔 ${question}`),
    points.length ? h('ul', { class: 'self-ask-points' }, ...points.map((p) => h('li', {}, p))) : null,
    h('span', { class: 'self-ask-honest' }, SELF_HONEST),
  );
}

/**
 * Bộ đủ cho một chỗ cần bé tự kiểm tra: `ask` (đặt trong màn) + hai nút (đặt ở thanh nút). `onOk` = bé chạm 👍 Rồi;
 * `onAgain` = 🔁 Làm lại. Nút bấm một lần (chạm liên tiếp không ghi hai lần).
 */
export function selfCheck(o: { question?: string; points?: readonly string[]; onOk: () => void; onAgain: () => void; okLabel?: string }): {
  ask: HTMLElement;
  ok: HTMLButtonElement;
  again: HTMLButtonElement;
} {
  let done = false;
  const once = (fn: () => void) => () => {
    if (done) return;
    done = true;
    fn();
  };
  return {
    ask: selfAsk(o.question, o.points),
    ok: selfOkButton(once(o.onOk), { label: o.okLabel }),
    again: selfAgainButton(once(o.onAgain)),
  };
}

/** Ba ý bé tự xem sau một lượt cả bài (không micro) — thay phiếu 3 ý của bố mẹ (SongRun.checklist). */
export const SONG_SELF_POINTS = ['🎵 Đúng phím đang sáng', '🥁 Đều nhịp, không dừng lâu', '🖐️ Đúng ngón, ngón cong'] as const;
/** Chế độ "Từng nốt" (app chờ bé — không có nhịp để xem) */
export const SONG_SELF_POINTS_WAIT = ['🎵 Đúng phím đang sáng', '🖐️ Đúng ngón, ngón cong'] as const;
