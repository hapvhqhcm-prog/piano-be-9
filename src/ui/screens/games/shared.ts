/**
 * 🎮 Phần dùng chung của các trò chơi: khung màn, màn giới thiệu (đọc hướng dẫn MỘT lần), màn kết (sao + kỷ lục).
 */
import { cancelSpeech, speak, speechBusy } from '../../../audio/voice';
import { midiToPitch, type Pitch } from '../../../piano/pitchTable';
import type { GameId } from '../../../practice/games/catalog';
import type { App } from '../../App';
import { backButton, button, h } from '../../components/dom';
import { confetti } from '../../components/celebrate';
import { mascot, type Mood } from '../../components/mascot';
import { speakChip } from '../../components/speakChip';
import '../../../styles/games.css';

export interface GameShell {
  stage: HTMLElement;
  bar: HTMLElement;
  setBar(...b: (HTMLElement | null | false)[]): void;
}

/** Khung màn trò chơi: vùng giữa (stage) + [phần thêm, vd bàn phím] + thanh nút dưới. */
export function gameShell(root: HTMLElement, extra?: HTMLElement): GameShell {
  const stage = h('div', { class: 'stage scrollable game-stage' });
  const bar = h('div', { class: 'actions' });
  root.append(h('div', { class: 'screen game-screen' }, stage, extra ?? null, bar));
  return {
    stage,
    bar,
    setBar: (...b) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x)),
  };
}

/** Mascot đổi nét mặt + nhún nhảy (phản ứng khi đúng / sai / kỷ lục). */
export function mascotSlot(size = 96): { el: HTMLElement; react(m: Mood, bounce?: boolean): void } {
  const el = h('div', { class: 'game-mascot' }, mascot('happy', size));
  return {
    el,
    react(m, bounce = true) {
      el.replaceChildren(mascot(m, size));
      el.classList.remove('react');
      if (bounce) {
        void el.offsetWidth;
        el.classList.add('react');
      }
    },
  };
}

/**
 * Màn giới thiệu: emoji lớn + tên trò + MỘT câu hướng dẫn (đọc to MỘT lần mỗi khi mở trò — "Chơi lại" không đọc lại).
 * Trả về hàm hủy hẹn giờ đọc.
 */
export function showIntro(
  app: App,
  shell: GameShell,
  o: { emoji: string; title: string; say: string; extra?: HTMLElement | null; best?: number; unit?: string; speakNow: boolean; onStart(): void; onBack(): void },
): () => void {
  shell.stage.replaceChildren(
    h(
      'div',
      { class: 'game-intro' },
      h('div', { class: 'game-hero', 'aria-hidden': 'true' }, o.emoji),
      h('h1', { class: 'title' }, o.title),
      h('p', { class: 'lead' }, o.say, speakChip(app, o.say)),
      o.extra ?? null,
      o.best ? h('div', { class: 'game-best-chip' }, `🏆 Kỷ lục: ${o.best}${o.unit ? ` ${o.unit}` : ''}`) : null,
    ),
  );
  shell.setBar(
    backButton(o.onBack),
    button({
      icon: '▶',
      label: 'Bắt đầu',
      kind: 'primary',
      big: true,
      onTap: () => {
        cancelSpeech();
        o.onStart();
      },
    }),
  );
  if (!o.speakNow) return () => undefined;
  const t = window.setTimeout(() => void speak(app, o.say), 450);
  return () => window.clearTimeout(t);
}

export function starsRow(n: number, max = 3): HTMLElement {
  return h(
    'div',
    { class: 'game-stars', 'aria-label': `${n} trên ${max} sao` },
    ...Array.from({ length: max }, (_, i) => h('span', { class: `gs${i < n ? ' on' : ''}`, 'aria-hidden': 'true' }, '★')),
  );
}

/**
 * Màn kết: ghi điểm (kỷ lục), sao, "Kỷ lục mới!" (pháo giấy + mascot reo). Luôn có "Chơi lại" và "Về Trò chơi".
 */
export function showEnd(
  app: App,
  shell: GameShell,
  o: {
    id: GameId;
    score: number;
    scoreText: string;
    stars: number;
    /** (+ 2026-10-09) Lưu kèm kỷ lục: mức khó lượt này / chuỗi đúng dài nhất */
    extra?: { level?: number; streak?: number };
    onAgain(): void;
    onHub(): void;
  },
): void {
  const r = app.store.recordGame(o.id, o.score, o.extra);
  const record = r.record && r.prevBest > 0;
  const first = r.record && r.prevBest === 0;
  const mood: Mood = record || o.stars >= 3 ? 'cheer' : o.stars >= 1 ? 'happy' : 'love';
  const praise = record
    ? 'Kỷ lục mới! 🎉'
    : o.stars >= 3
      ? 'Siêu giỏi!'
      : o.stars >= 2
        ? 'Giỏi lắm!'
        : o.stars >= 1
          ? 'Tốt lắm!'
          : 'Chơi lại nhé — con sẽ giỏi hơn!';
  shell.stage.replaceChildren(
    h(
      'div',
      { class: 'game-end' },
      h('div', { class: 'game-end-mascot' }, mascot(mood, 120)),
      h(
        'div',
        { class: 'game-end-text' },
        record ? h('div', { class: 'game-record' }, '🏆 Kỷ lục mới!') : null,
        h('h1', { class: 'title game-score' }, o.scoreText),
        starsRow(o.stars),
        h('p', { class: 'lead' }, record ? `Hơn kỷ lục cũ (${r.prevBest})!` : first ? 'Kỷ lục đầu tiên của con!' : praise),
        !record && !first ? h('div', { class: 'game-best-chip' }, `🏆 Kỷ lục: ${r.best}`) : null,
      ),
    ),
  );
  shell.setBar(
    button({ icon: '🎮', label: 'Về Trò chơi', onTap: o.onHub }),
    button({ icon: '↻', label: 'Chơi lại', kind: 'primary', big: true, onTap: o.onAgain }),
  );
  if (record || first) {
    confetti(record ? 48 : 30);
    void app.audio.chime();
  }
  void speak(app, record ? `Kỷ lục mới! ${o.scoreText}` : `${o.scoreText}. ${praise}`);
}

/**
 * (+ 2026-10-09) Nghe ĐÀN THẬT (khi phụ huynh bật micro): bật micro trong cú chạm, gọi `onPitch` mỗi nốt nghe được.
 * Tiếng của chính app (phím ảo, nốt mẫu, chuông) / giọng đọc → bỏ qua. Trả về { on, off } — micro tắt / không có → on = false.
 */
export async function listenPiano(app: App, onPitch: (p: Pitch) => void): Promise<{ on: boolean; off: () => void }> {
  if (!app.micWanted) return { on: false, off: () => undefined };
  const on = await app.ensureMic();
  if (!on) return { on: false, off: () => undefined };
  const off = app.mic.onNote((n) => {
    if (app.audio.isSounding || app.audio.msSinceSound() < 120 || speechBusy()) return;
    onPitch(midiToPitch(n.midi));
  });
  return { on: true, off };
}

/** Người dùng muốn giảm chuyển động (Cài đặt hệ thống) → trò chơi bỏ hiệu ứng trôi/nhún. */
export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chờ `ms` mili-giây; trả về false nếu `alive()` đã sai trong lúc chờ (rời màn / đổi lượt). */
export function pause(ms: number, alive: () => boolean): Promise<boolean> {
  return new Promise((r) => window.setTimeout(() => r(alive()), ms));
}
