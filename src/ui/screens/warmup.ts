import { POSTURE_CUE, type WarmupMusic } from '../../lessons/lessonEngine';
import { posEcho } from '../../lessons/targets';
import type { Segment } from '../../lessons/types';
import { findTune } from '../../music/exercises';
import type { App, Screen } from '../App';
import { h } from '../components/dom';
import { handFocus, handPrinciple, readHandLook, type HandPrincipleId } from '../../lessons/handTechnique';
import { HAND_ICON_TEXT, handIcon } from '../components/handIcon';
import { principleFigure } from '../components/handCards';
import { practiceScreen } from './practice';
import { songScreen, type SongHooks } from './song';
import type { Homework } from '../../lessons/homework';
import type { ParentFocus } from '../../lessons/parentFocus';
import '../../styles/warmup.css';

/**
 * v5.2 (OWNER duyệt 2026-10-08) — KHỞI ĐỘNG BẰNG NHẠC 20–30 giây mở đầu buổi, kèm câu nhắc tư thế MỘT dòng
 * (hiện chữ + đọc to qua lời dẫn của màn):
 * - 'song': câu đầu một bài bé đã thuộc, theo nhịp Mức 2 (nhạc đệm nếu bố mẹ bật) — dùng lại màn bài hát (song.ts);
 * - 'riff': "thầy đàn — con đàn lại" 2 câu ngắn — dùng lại màn Từng nốt (practice.ts), trò Nhại lại.
 * Luôn có nút "Bỏ qua ⏭". KHÔNG ghi gì vào buổi (onRun / record là no-op) → không đổi tiến độ, tiêu chí, "đã thuộc".
 */
export function warmupScreen(app: App, w: WarmupMusic, hooks: { onDone(): void; onBack(): void; focus?: ParentFocus | null }): Screen {
  const inner = innerScreen(app, w, hooks);
  return (root) => {
    const cleanup = inner(root);
    let left = false;
    const skip = h('button', { class: 'warmup-skip', type: 'button', 'aria-label': 'Bỏ qua khởi động' }, 'Bỏ qua ⏭');
    skip.addEventListener('click', () => {
      if (left) return;
      left = true;
      hooks.onDone();
    });
    // Ẩn nhãn "🔁 ôn bài cũ" của màn bài hát (dùng chế độ khoá câu của bước ôn) — đây là khởi động
    root.classList.add('is-warmup');
    const bar = h('div', { class: 'warmup-bar' }, h('span', { class: 'warmup-tag' }, '🎵 Khởi động'), handChip(app), skip);
    root.append(bar);
    const chip = parentFocusChip(app, hooks.focus);
    if (chip) root.append(chip);
    return () => {
      root.classList.remove('is-warmup');
      window.clearTimeout(bubbleTimer);
      cleanup?.();
    };
  };
}

/**
 * (+ 2026-10-15) "📝 BÀI TẬP VỀ NHÀ" đầu buổi (trước khởi động bằng nhạc): đúng chỗ thầy dặn ở buổi trước (lessons/homework.ts)
 * — câu đó ở chế độ "🔁 Lặp 3 lần đúng" (Từng nốt) hoặc theo nhịp ở tốc độ chậm. Luôn có "Bỏ qua ⏭". Lượt chơi GHI vào buổi
 * (`onRun`) như lượt thật: lượt một câu không đổi tiêu chí / "thuộc"; lượt đạt đúng chỗ dặn → bài tập xong (songResult).
 */
export function homeworkScreen(
  app: App,
  hw: Homework,
  hooks: { onRun: SongHooks['onRun']; onDone(): void; onBack(): void; focus?: ParentFocus | null },
): Screen {
  const tune = findTune(hw.songId);
  if (!tune) return () => void window.setTimeout(hooks.onDone, 0);
  const loop = hw.mode === 'wait' && !!hw.phrase;
  const inner = songScreen(
    app,
    tune,
    {
      mode: hw.mode,
      level: 2,
      hints: 'full',
      intro: `📝 Bài tập về nhà: ${hw.text}`,
      bpm: hw.bpm,
      ...(hw.phrase ? { phrase: hw.phrase } : {}),
      ...(loop ? { loop: true } : {}),
      // tempo một câu: khoá câu như bước ôn (không hiện nút chọn câu); cả bài / lặp câu: như bài thường
      ...(!loop && hw.phrase ? { review: true } : {}),
    },
    { onRun: hooks.onRun, onDone: hooks.onDone, onBack: hooks.onBack },
  );
  return (root) => {
    const cleanup = inner(root);
    let left = false;
    const skip = h('button', { class: 'warmup-skip', type: 'button', 'aria-label': 'Bỏ qua bài tập về nhà' }, 'Bỏ qua ⏭');
    skip.addEventListener('click', () => {
      if (left) return;
      left = true;
      hooks.onDone();
    });
    root.append(h('div', { class: 'warmup-bar' }, h('span', { class: 'warmup-tag' }, '📝 Bài tập về nhà'), skip));
    const chip = parentFocusChip(app, hooks.focus);
    if (chip) root.append(chip);
    return () => cleanup?.();
  };
}

let bubbleTimer = 0;

/** Ngày bố mẹ đã đóng dải "👪 Hôm nay để ý" (chỉ là tiện ích trong máy). */
const FOCUS_HIDDEN_KEY = 'piano-be-9:parent-focus-hidden';

/**
 * (+ 2026-10-16, OWNER duyệt) "👪 Bố mẹ 30 giây — hôm nay để ý: …" — dải chữ NHỎ cho bố mẹ (không phải màn che, không đọc to)
 * ở đầu buổi (khởi động / bài tập về nhà). Chạm ✕ → ẩn tới hết hôm nay. Luật chọn: lessons/parentFocus.ts.
 */
export function parentFocusChip(app: App, focus: ParentFocus | null | undefined): HTMLElement | null {
  if (!focus) return null;
  const today = app.store.today();
  try {
    if (localStorage.getItem(FOCUS_HIDDEN_KEY) === today) return null;
  } catch {
    /* không có bộ nhớ → vẫn hiện */
  }
  const close = h('button', { class: 'pfocus-x', type: 'button', 'aria-label': 'Ẩn lời nhắc cho bố mẹ hôm nay' }, '✕');
  const chip = h(
    'aside',
    { class: 'pfocus-chip', 'aria-label': 'Lời nhắc cho bố mẹ', 'data-focus': focus.id },
    h('span', { class: 'pfocus-who' }, '👪 Bố mẹ 30 giây'),
    h('span', { class: 'pfocus-text' }, `${focus.icon} Hôm nay để ý: `, h('b', {}, focus.text)),
    close,
  );
  close.addEventListener('click', () => {
    chip.remove();
    try {
      localStorage.setItem(FOCUS_HIDDEN_KEY, today);
    } catch {
      /* bỏ qua */
    }
  });
  return chip;
}

/**
 * (+ 2026-10-15) Biểu tượng tí hon cạnh câu nhắc tư thế một dòng: chạm → bong bóng tranh "Đúng ✓" của nguyên tắc.
 * Bố mẹ vừa nhắc một lỗi tay (handFocus: thẻ chấm "Làm lại" / phiếu bài hát / phiếu xem tay) → biểu tượng vàng của lỗi đó
 * và bong bóng tự hiện ~6 giây đầu. Không ghi gì.
 */
function handChip(app: App): HTMLElement {
  let flag: HandPrincipleId | null = null;
  try {
    flag = handFocus(app.store.get(), Date.now(), readHandLook());
  } catch {
    flag = null;
  }
  const id: HandPrincipleId = flag ?? 'tip';
  const chip = h(
    'button',
    { class: `warmup-hand${flag ? ' flagged' : ''}`, type: 'button', 'aria-label': `Xem tranh: ${handPrinciple(id).title}` },
    handIcon(!!flag),
    flag ? HAND_ICON_TEXT[id] : 'ngón cong',
  );
  let bubble: HTMLElement | null = null;
  const close = () => {
    window.clearTimeout(bubbleTimer);
    bubble?.remove();
    bubble = null;
  };
  const open = (ms: number) => {
    if (bubble) return close();
    const p = handPrinciple(id);
    bubble = h('div', { class: 'warmup-bubble', role: 'note' }, principleFigure(id, 'good', p.title), h('p', { class: 'hp-caption' }, p.caption));
    bubble.addEventListener('click', close);
    chip.after(bubble);
    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(close, ms);
  };
  chip.addEventListener('click', () => open(8000));
  if (flag) window.setTimeout(() => chip.isConnected && open(6000), 700);
  return chip;
}

/** Lời dẫn (> 60 ký tự → màn bài hát hiện câu đầu = câu nhắc tư thế, và ĐỌC TO cả câu). */
export function warmupIntro(w: WarmupMusic): string {
  return w.kind === 'song'
    ? `🧘 ${POSTURE_CUE}! Khởi động bằng bài con đã thuộc — đàn cho vui nhé 🎵`
    : `${POSTURE_CUE}! Thầy đàn — con đàn lại nhé.`;
}

/** Màn "thầy đàn — con đàn lại" của khởi động (không có bài nào thuộc). */
export function riffSegment(w: Extract<WarmupMusic, { kind: 'riff' }>): Segment {
  return {
    id: 'warmup-riff',
    step: 'Khởi động',
    title: 'Khởi động bằng nhạc 🎵',
    intro: warmupIntro(w),
    targets: w.riffs.map((r) => ({ ...posEcho(r, w.hand, w.position), subtitle: 'Thầy đàn — con đàn lại' })),
  };
}

function innerScreen(app: App, w: WarmupMusic, hooks: { onDone(): void; onBack(): void }): Screen {
  const noop = () => undefined;
  if (w.kind === 'song') {
    const tune = findTune(w.songId);
    if (tune) {
      return songScreen(
        app,
        tune,
        { mode: 'tempo', level: 2, hints: w.hints, intro: warmupIntro(w), phrase: w.phrase, bpm: w.bpm, review: true },
        { onRun: noop, onDone: hooks.onDone, onBack: hooks.onBack },
      );
    }
    // Bài không còn (dữ liệu cũ) → bỏ qua khởi động
    return () => void window.setTimeout(hooks.onDone, 0);
  }
  if (!w.riffs.length) return () => void window.setTimeout(hooks.onDone, 0);
  return practiceScreen(app, riffSegment(w), {
    record: noop,
    recordMic: noop,
    amendLast: noop,
    onComplete: hooks.onDone,
    onExit: hooks.onBack,
  });
}
