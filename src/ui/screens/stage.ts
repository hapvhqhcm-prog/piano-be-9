import { songsUpToWeek, type Tune } from '../../music/tune';
import type { SongRun } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';
import { songScreen } from './song';

export interface StageHooks {
  /** Cấp của buổi hòa nhạc: 1 = tay phải tuần 1–8, 2 = thêm bài hai tay, 3 = mọi bài */
  level?: 1 | 2 | 3;
  onRun(run: Omit<SongRun, 'ts'>): void;
  /** Phụ huynh tặng huy chương — tiêu chí tuần 8 (PARENT) */
  onMedal(): void;
  onDone(): void;
  onBack(): void;
}

/**
 * Tuần 8 — Sân khấu: bé TỰ CHỌN 2–3 bài, mời khán giả, biểu diễn theo nhịp, nhận vỗ tay & huy chương.
 */
export function stageScreen(app: App, hooks: StageHooks) {
  return (root: HTMLElement) => {
    const level = hooks.level ?? 1;
    const upTo = level === 1 ? 8 : level === 2 ? 16 : 24;
    // Cấp 1: bài tay phải; Cấp 2–3: mọi bài đã mở (ưu tiên bài mới của cấp đó lên đầu)
    const choices = songsUpToWeek(upTo)
      .filter((s) => level > 1 || s.hand === 'RH')
      .sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
    const picked: Tune[] = [];

    const pick = () => {
      root.replaceChildren(
        h(
          'div',
          { class: 'screen' },
          h(
            'div',
            { class: 'stage scroll-y scrollable' },
            h('div', { class: 'step-tag' }, 'Sân khấu'),
            h('h1', { class: 'title' }, `Con chọn ${picked.length ? `thêm (đã chọn ${picked.length}/3)` : '2–3 bài'} để biểu diễn`),
            h(
              'div',
              { class: 'chips' },
              ...choices.map((s) => {
                const i = picked.indexOf(s);
                return h(
                  'button',
                  {
                    class: `chip${i >= 0 ? ' chip-next' : ''}`,
                    type: 'button',
                    onClick: () => {
                      if (i >= 0) picked.splice(i, 1);
                      else if (picked.length < 3) picked.push(s);
                      pick();
                    },
                  },
                  i >= 0 ? h('span', { class: 'chip-done' }, String(i + 1)) : null,
                  h('span', {}, s.titleVi),
                );
              }),
            ),
          ),
          h(
            'div',
            { class: 'actions' },
            backButton(hooks.onBack),
            button({ icon: '🎟', label: 'Mời khán giả', kind: 'primary', disabled: picked.length < 2, onTap: invite }),
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
      const screen = songScreen(
        app,
        picked[k],
        { mode: 'tempo', level: level === 3 ? 3 : 2, hints: level === 3 ? 'staff' : 'names', stage: true, intro: `Bài ${k + 1}/${picked.length}: ${picked[k].titleVi}.` },
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
            level === 1 ? 'Con đã chinh phục Lâu đài Âm nhạc!' : level === 2 ? 'Huy chương Cấp 2 — nghệ sĩ hai tay!' : '🏆 Huy chương vàng — con đã thành thạo piano!',
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
