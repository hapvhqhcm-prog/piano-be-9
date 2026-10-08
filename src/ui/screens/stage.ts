import { LEVELS, songEverPlayed, songMastered } from '../../lessons/lessonEngine';
import { songsUpToWeek, type Tune } from '../../music/tune';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { songScreen } from './song';
import { shortTitle, songEmoji } from '../components/songArt';
import '../../styles/kidux.css';

/** Số bài gợi ý trên màn chọn (thẻ to) */
const SUGGEST = 6;

export interface StageHooks {
  /** Cấp của buổi hòa nhạc (tuần cuối mỗi cấp, xem LEVELS): 1 = bài tay phải, 2 = thêm bài hai tay, 3 = mọi bài */
  level?: 1 | 2 | 3 | 4;
  onRun(run: Omit<SongRun, 'ts'>): void;
  /** Phụ huynh tặng huy chương — tiêu chí tuần hòa nhạc cuối cấp (PARENT) */
  onMedal(): void;
  onDone(): void;
  onBack(): void;
}

/**
 * (+ 2026-10-08) Một bài trên SÂN KHẤU: theo nhịp, đếm vào, chơi cả bài một lần, vỗ tay khi xong (songScreen `stage`).
 * Dùng chung cho tuần hòa nhạc cuối cấp (bên dưới) và "🎤 Biểu diễn cho cả nhà" hằng tuần (concert.ts).
 */
export function stageSongScreen(
  app: App,
  tune: Tune,
  o: { level: 1 | 2 | 3 | 4; intro: string; bpm?: number },
  hooks: { onRun(run: Omit<SongRun, 'ts'>): void; onDone(): void; onBack(): void },
) {
  return songScreen(
    app,
    tune,
    { mode: 'tempo', level: o.level >= 3 ? 3 : 2, hints: o.level >= 3 ? 'staff' : 'names', stage: true, intro: o.intro, ...(o.bpm ? { bpm: o.bpm } : {}) },
    hooks,
  );
}

/**
 * Tuần hòa nhạc cuối mỗi cấp — Sân khấu: bé TỰ CHỌN 2–3 bài, mời khán giả, biểu diễn theo nhịp, nhận vỗ tay & huy chương.
 */
export function stageScreen(app: App, hooks: StageHooks) {
  return (root: HTMLElement) => {
    const level = hooks.level ?? 1;
    // Tuần cuối của cấp (LEVELS — v5.1: tuần 10 / 21 / 31)
    const upTo = LEVELS[level - 1].weeks[1];
    // Cấp 1: bài tay phải; Cấp 2–3: mọi bài đã mở (ưu tiên bài mới của cấp đó lên đầu)
    const choices = songsUpToWeek(upTo)
      .filter((s) => level > 1 || s.hand === 'RH')
      .sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
    const picked: Tune[] = [];
    // Playtest 2026-10: ít thẻ, thẻ TO — gợi ý 6 bài con đã thuộc / đã chơi (bài mới nhất trước); bài khác sau nút "Bài khác"
    const data = app.store.get();
    const known = (s: Tune) => (songMastered(data, s.id) ? 2 : songEverPlayed(data, s.id) ? 1 : 0);
    const suggested = [...choices].sort((a, b) => known(b) - known(a)).slice(0, SUGGEST);
    let showAll = false;

    const pick = () => {
      const list = showAll ? choices : [...suggested, ...picked.filter((p) => !suggested.includes(p))];
      root.replaceChildren(
        h(
          'div',
          { class: 'screen' },
          h(
            'div',
            { class: 'stage scroll-y scrollable' },
            h('div', { class: 'step-tag' }, 'Sân khấu'),
            h('h1', { class: 'title' }, `Con chọn ${picked.length ? `thêm (đã chọn ${picked.length}/3)` : '2 hoặc 3 bài'} để biểu diễn`),
            h(
              'div',
              { class: 'stage-picks' },
              ...list.map((s) => {
                const i = picked.indexOf(s);
                return h(
                  'button',
                  {
                    class: `stage-pick${i >= 0 ? ' on' : ''}`,
                    type: 'button',
                    'aria-pressed': String(i >= 0),
                    onClick: () => {
                      if (i >= 0) picked.splice(i, 1);
                      else if (picked.length < 3) picked.push(s);
                      pick();
                    },
                  },
                  i >= 0 ? h('span', { class: 'stage-pick-n' }, String(i + 1)) : null,
                  h('span', { class: 'stage-pick-emoji', 'aria-hidden': 'true' }, songEmoji(s)),
                  h('span', { class: 'stage-pick-title' }, shortTitle(s)),
                  songMastered(data, s.id) ? h('span', { class: 'stage-pick-star' }, '⭐ đã thuộc') : null,
                );
              }),
            ),
            !showAll && choices.length > suggested.length
              ? h(
                  'button',
                  { class: 'seg-btn small stage-more', type: 'button', onClick: () => ((showAll = true), pick()) },
                  `➕ Bài khác (${choices.length - suggested.length})`,
                )
              : null,
          ),
          h(
            'div',
            { class: 'actions' },
            backButton(hooks.onBack),
            button({ icon: '🎟️', label: 'Mời khán giả', kind: 'primary', disabled: picked.length < 2, onTap: invite }),
          ),
        ),
      );
    };

    const invite = () => {
      cleanup?.();
      cleanup = null;
      root.replaceChildren(
        h(
          'div',
          { class: 'screen center' },
          h('div', { class: 'hero-emoji huge' }, '🎟️'),
          h('h1', { class: 'hero-title' }, 'Mời cả nhà ngồi xuống nhé!'),
          h('p', { class: 'lead' }, 'Chương trình hôm nay: ' + picked.map((s, i) => `${i + 1}. ${s.titleVi}`).join(' · ')),
          h('p', { class: 'lead' }, 'Nghệ sĩ cúi chào khán giả trước khi đàn 🙇'),
          h(
            'div',
            { class: 'end-actions' },
            button({ icon: '←', label: 'Chọn lại', onTap: pick }),
            button({ icon: '🎹', label: 'Bắt đầu biểu diễn', kind: 'primary', big: true, onTap: () => perform(0) }),
          ),
        ),
      );
    };

    const perform = (k: number) => {
      if (k >= picked.length) return medal();
      const screen = stageSongScreen(
        app,
        picked[k],
        { level, intro: `Bài ${k + 1}/${picked.length}: ${picked[k].titleVi}.` },
        { onRun: hooks.onRun, onDone: () => perform(k + 1), onBack: invite },
      );
      root.replaceChildren();
      cleanup?.();
      cleanup = screen(root) || null;
    };
    let cleanup: (() => void) | null = null;

    const medal = () => {
      cleanup?.();
      cleanup = null;
      app.audio.applause(3.5);
      root.replaceChildren(
        h(
          'div',
          { class: 'screen center' },
          h('div', { class: 'hero-emoji huge' }, '👏'),
          h('h1', { class: 'hero-title' }, 'Bravo! Buổi biểu diễn tuyệt vời!'),
          h('p', { class: 'lead' }, '👪 Bố mẹ: hãy trao huy chương cho nghệ sĩ nhỏ'),
          h(
            'div',
            { class: 'end-actions' },
            button({
              icon: '🏅',
              label: 'Tặng huy chương',
              kind: 'primary',
              big: true,
              onTap: () => {
                hooks.onMedal();
                root.replaceChildren(
                  h(
                    'div',
                    { class: 'screen center' },
                    h('div', { class: 'hero-emoji huge medal' }, '🏅'),
                    h(
            'h1',
            { class: 'hero-title' },
            level === 1 ? 'Con đã chinh phục Lâu đài Âm nhạc!' : level === 2 ? 'Huy chương Cấp 2 — nghệ sĩ hai tay!' : `🏆 Huy chương vàng — con đã đi hết ${LEVELS[level - 1].weeks[1]} tuần học đàn!`,
          ),
                    button({ icon: '▶', label: 'Tiếp', kind: 'primary', big: true, onTap: hooks.onDone }),
                  ),
                );
              },
            }),
          ),
        ),
      );
    };

    pick();
    return () => cleanup?.();
  };
}
