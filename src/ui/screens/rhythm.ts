import type { RhythmSymbol } from '../../lessons/types';
import type { ParentResult } from '../../progress/schema';
import type { App } from '../App';
import { backButton, button, h } from '../components/dom';

const SYMBOL: Record<RhythmSymbol, { label: string; emoji: string; beats: number; hits: number[] }> = {
  walk: { label: 'Đi', emoji: '👣', beats: 1, hits: [0] },
  run: { label: 'Chạy-chạy', emoji: '🏃', beats: 1, hits: [0, 0.5] },
  long: { label: 'Đi-i', emoji: '🐢', beats: 2, hits: [0] },
  rest: { label: 'Suỵt', emoji: '🤫', beats: 1, hits: [] },
};

export interface RhythmHooks {
  title: string;
  intro: string;
  patterns: RhythmSymbol[][];
  /** PARENT_ASSESSMENT: bố mẹ xác nhận bé vỗ đều */
  record(noteId: string, result: ParentResult): void;
  onDone(): void;
  onBack(): void;
}

/**
 * Nhịp Mức 1 (tuần 2 & 4): vỗ tay theo máy gõ nhịp 60, đọc "Đi / Chạy-chạy / Đi-i / Suỵt".
 * Mỗi mẫu 1 ô nhịp, chơi 2 lần liền. App vỗ mẫu trước, rồi đến lượt bé; bố mẹ xác nhận.
 */
export function rhythmScreen(app: App, hooks: RhythmHooks) {
  return (root: HTMLElement) => {
    let i = 0;
    let token = 0;
    let raf = 0;
    const stage = h('div', { class: 'stage' });
    const bar = h('div', { class: 'actions' });
    root.append(h('div', { class: 'screen' }, stage, bar));
    const setBar = (...b: (HTMLElement | null)[]) => bar.replaceChildren(...b.filter((x): x is HTMLElement => !!x));

    const BPM = 60;
    const spb = 60 / BPM;

    function cells(p: RhythmSymbol[]): { row: HTMLElement; els: HTMLElement[]; starts: number[] } {
      const els: HTMLElement[] = [];
      const starts: number[] = [];
      let b = 0;
      for (const sym of [...p, ...p]) {
        const s = SYMBOL[sym];
        const c = h(
          'div',
          { class: `rh-cell rh-${sym}`, style: { flexGrow: String(s.beats) } },
          h('div', { class: 'rh-emoji' }, s.emoji),
          h('div', { class: 'rh-label' }, s.label),
        );
        els.push(c);
        starts.push(b);
        b += s.beats;
      }
      return { row: h('div', { class: 'rh-row' }, ...els), els, starts };
    }

    function intro(): void {
      token++;
      stage.replaceChildren(
        h('div', { class: 'step-tag' }, 'Nhịp'),
        h('h1', { class: 'title' }, hooks.title),
        h('p', { class: 'lead' }, hooks.intro),
      );
      setBar(backButton(hooks.onBack), button({ icon: '▶', label: 'Bắt đầu', kind: 'primary', onTap: () => show() }));
    }

    function show(): void {
      token++;
      cancelAnimationFrame(raf);
      const p = hooks.patterns[i];
      const { row } = cells(p);
      stage.replaceChildren(
        h('div', { class: 'progress' }, `Mẫu ${i + 1} / ${hooks.patterns.length}`),
        h('h1', { class: 'title' }, 'Vỗ tay và đọc to'),
        row,
        h('div', { class: 'countin' }, ' '),
      );
      setBar(
        backButton(() => (i > 0 ? ((i -= 1), show()) : intro())),
        button({ icon: '🔊', label: 'Nghe mẫu', onTap: () => play(true) }),
        button({ icon: '👏', label: 'Con vỗ', kind: 'primary', onTap: () => play(false) }),
      );
    }

    /** demo=true: app "vỗ" mẫu; false: chỉ có tiếng tích, bé vỗ. */
    function play(demo: boolean): void {
      const tk = ++token;
      const p = hooks.patterns[i];
      const { row, els, starts } = cells(p);
      const countEl = h('div', { class: 'countin' });
      stage.replaceChildren(h('h1', { class: 'title' }, demo ? '🔊 Nghe mẫu' : '👏 Đến lượt con!'), row, countEl);
      setBar(button({ icon: '⏹', label: 'Dừng', onTap: () => (app.audio.stopAll(), show()) }));
      const t0 = app.audio.now() + 0.4 + 4 * spb;
      const total = starts.length ? starts[starts.length - 1] + SYMBOL[[...p, ...p][starts.length - 1]].beats : 4;
      for (let b = -4; b < total; b++) app.audio.click(t0 + b * spb, ((b % 4) + 4) % 4 === 0);
      if (demo) {
        [...p, ...p].forEach((sym, k) => {
          for (const hb of SYMBOL[sym].hits) void app.audio.scheduleFreq(196, t0 + (starts[k] + hb) * spb, 0.09, 0.9);
        });
      }
      const loop = () => {
        if (tk !== token) return;
        const beat = (app.audio.now() - t0) / spb;
        if (beat < 0) countEl.textContent = String(4 - Math.ceil(-beat - 1e-6) + 1);
        else {
          countEl.textContent = ' ';
          els.forEach((e, k) => e.classList.toggle('now', beat >= starts[k] && (k + 1 >= starts.length || beat < starts[k + 1])));
        }
        if (beat < total + 0.3) raf = requestAnimationFrame(loop);
        else demo ? show() : askParent();
      };
      raf = requestAnimationFrame(loop);
    }

    function askParent(): void {
      const p = hooks.patterns[i];
      const id = `rhythm:${p.join('-')}`;
      stage.replaceChildren(h('h1', { class: 'title' }, '👪 Bố/mẹ: con vỗ đều chưa?'), cells(p).row);
      setBar(
        backButton(show),
        button({
          icon: '✓',
          label: 'Đều rồi',
          kind: 'good',
          onTap: () => {
            hooks.record(id, 'correct');
            void app.audio.chime();
            i++;
            if (i >= hooks.patterns.length) done();
            else show();
          },
        }),
        button({
          icon: '↻',
          label: 'Thử lại',
          kind: 'retry',
          onTap: () => {
            hooks.record(id, 'retry');
            show();
          },
        }),
      );
    }

    function done(): void {
      token++;
      stage.replaceChildren(h('div', { class: 'hero-emoji' }, '🥁'), h('h1', { class: 'title' }, 'Con giữ nhịp giỏi quá!'));
      setBar(button({ icon: '▶', label: 'Tiếp', kind: 'primary', onTap: hooks.onDone }));
    }

    intro();
    return () => {
      token++;
      cancelAnimationFrame(raf);
    };
  };
}
