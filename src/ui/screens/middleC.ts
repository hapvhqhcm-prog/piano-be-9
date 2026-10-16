/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) "📍 TÌM ĐÔ GIỮA TRÊN ĐÀN THẬT" — bước phụ ≤ 20 giây
 * ở ĐẦU buổi (session.ts, khi sessionPlan cho `middleC` ≠ null — luật: lessons/middleC.ts). Chunk riêng (nạp lười).
 * Tranh đàn 88 phím: Đô giữa gần giữa đàn, ngay dưới tên hãng đàn / ổ khóa, bên TRÁI nhóm 2 phím đen → "Đàn Đô giữa nhé":
 * - micro bật: nghe Đô4 → "Đúng Đô giữa rồi!" rồi đi tiếp; nghe Đô3 / Đô5 → "cao / thấp hơn một quãng tám — dời tay";
 * - micro tắt (hoặc micro nghe chưa ra): bố mẹ chạm "👪 Đã tìm đúng".
 * Luôn có "Bỏ qua ⏭"; hết MIDDLE_C_MS tự đi tiếp. KHÔNG ghi gì vào buổi / tiêu chí — chỉ nhật ký nhỏ trong máy
 * (đã hiện hôm nay, lần tìm đúng gần nhất).
 */
import { cancelSpeech, speak, speechBusy } from '../../audio/voice';
import { MIDDLE_C_MIDI, MIDDLE_C_MS, markMiddleCFound, markMiddleCShown, type MiddleCReason } from '../../lessons/middleC';
import type { App, Screen } from '../App';
import { middleCArt } from '../components/art/middleCArt';
import { backButton, button, h } from '../components/dom';
import '../../styles/middleC.css';

const INTRO: Record<MiddleCReason, string> = {
  octave: 'Mấy hôm nay con đàn lệch một quãng tám — mình tìm lại Đô giữa nhé!',
  position: 'Hôm nay con đổi thế tay — tìm Đô giữa làm mốc trước nhé!',
  'week-start': 'Tuần mới rồi — tìm Đô giữa trên đàn thật nào!',
};

export const WHERE = 'Gần giữa đàn, ngay dưới tên hãng đàn (hoặc ổ khóa): phím trắng bên TRÁI nhóm 2 phím đen.';

/** Lời nhắn khi micro nghe nốt `midi` (null = Đô giữa — đúng). */
export function middleCHint(midi: number): string | null {
  if (midi === MIDDLE_C_MIDI) return null;
  if (midi % 12 === 0) {
    const up = midi > MIDDLE_C_MIDI;
    const n = Math.round(Math.abs(midi - MIDDLE_C_MIDI) / 12);
    return `🎵 Đúng là Đô — nhưng ${up ? 'cao' : 'thấp'} hơn ${n > 1 ? `${n} quãng tám` : 'một quãng tám'}. Dời tay sang ${up ? 'TRÁI 👈' : 'PHẢI 👉'} nhé!`;
  }
  return '🔎 Chưa phải Đô — tìm nhóm 2 phím đen gần tên hãng đàn, Đô ở ngay bên trái.';
}

export function middleCScreen(app: App, reason: MiddleCReason, hooks: { onDone(): void; onBack(): void }): Screen {
  return (root) => {
    let left = false;
    let found = false;
    const timers: number[] = [];
    const leave = (fn: () => void) => {
      if (left) return;
      left = true;
      fn();
    };
    try {
      markMiddleCShown(app.store.today());
    } catch {
      /* chỉ là nhật ký */
    }
    const micOn = () => app.mic.state === 'on';
    const art = h('div', { class: 'mc-art-box' }, middleCArt());
    const status = h('p', { class: 'mc-status', role: 'status' });
    const fill = h('i');
    const setStatus = () => {
      if (found) return;
      status.textContent = micOn() ? '🎹 Con đàn Đô giữa nhé — micro đang nghe!' : '🎹 Con chỉ (hoặc đàn) Đô giữa — 👪 bố mẹ xem đúng thì chạm “Đã tìm đúng”.';
    };
    const success = (byMic: boolean) => {
      if (found || left) return;
      found = true;
      try {
        markMiddleCFound(Date.now());
      } catch {
        /* chỉ là nhật ký */
      }
      art.replaceChildren(middleCArt({ found: true }));
      status.textContent = byMic ? '✓ Đúng Đô giữa rồi! Giỏi quá 🎉' : '✓ Tìm đúng Đô giữa rồi! 🎉';
      status.classList.add('ok');
      void app.audio.chime();
      timers.push(window.setTimeout(() => leave(hooks.onDone), 1400));
    };
    const stage = h(
      'div',
      { class: 'stage scrollable mc-stage' },
      h('div', { class: 'step-tag' }, '📍 Tìm Đô giữa'),
      h('h1', { class: 'title mc-title' }, INTRO[reason]),
      h('p', { class: 'lead mc-lead' }, WHERE),
      art,
      status,
      h('div', { class: 'mc-timebar', 'aria-hidden': 'true' }, fill),
    );
    const bar = h(
      'div',
      { class: 'actions' },
      backButton(() => leave(hooks.onBack)),
      button({ icon: '🔊', label: 'Nghe Đô giữa', onTap: () => void app.audio.playPitch('C4', 0.9) }),
      button({ icon: '⏭', label: 'Bỏ qua', onTap: () => leave(hooks.onDone) }),
      button({ icon: '👪', label: 'Đã tìm đúng', kind: 'good', onTap: () => success(false) }),
    );
    root.append(h('div', { class: 'screen' }, stage, bar));
    setStatus();

    // Micro: bật nếu bố mẹ cho phép (iOS cần một lần chạm — thử ngay, và lần chạm đầu tiên trên màn)
    const tryMic = () => {
      if (!app.micWanted || micOn()) return;
      void app.ensureMic().then(() => !left && setStatus()).catch(() => undefined);
    };
    tryMic();
    root.addEventListener('pointerdown', tryMic, { once: true, capture: true });
    const unNote = app.mic.onNote((n) => {
      if (left || found || speechBusy()) return;
      const hint = middleCHint(n.midi);
      if (hint === null) return success(true);
      status.textContent = hint;
    });

    // ≤ 20 giây rồi tự đi tiếp (không chặn buổi)
    const t0 = Date.now();
    const tick = window.setInterval(() => {
      if (left || !root.isConnected) return window.clearInterval(tick);
      const pct = Math.min(100, ((Date.now() - t0) / MIDDLE_C_MS) * 100);
      fill.style.width = `${pct}%`;
      if (pct >= 100 && !found) leave(hooks.onDone);
    }, 250);
    void speak(app, `${INTRO[reason]} ${WHERE}`);
    return () => {
      left = true;
      window.clearInterval(tick);
      timers.forEach((t) => window.clearTimeout(t));
      root.removeEventListener('pointerdown', tryMic, { capture: true });
      unNote();
      cancelSpeech();
    };
  };
}
