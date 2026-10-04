import { ledgerSteps, staffStep, stemUp, type Clef } from '../../music/staff';
import {
  beatsPerMeasure,
  lhTimeline,
  measureCount,
  pitchesOf,
  timeline,
  type TimedNote,
  type Tune,
} from '../../music/tune';
import { pitchInfo, viName } from '../../piano/pitchTable';

const SVG = 'http://www.w3.org/2000/svg';
const GAP = 14; // khoảng cách 2 vạch
const X0 = 104; // nốt đầu tiên

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface StaffOptions {
  clef?: Clef;
  /** Hiện tên nốt (giàn giáo — rút dần) */
  names?: boolean;
  /** Hiện số ngón */
  fingers?: boolean;
  /** 'page': từng trang 4 ô nhịp, con trỏ nhảy; 'scroll': băng chuyền chạy ngang */
  mode?: 'page' | 'scroll';
  measuresPerPage?: number;
  pxPerBeat?: number;
}

export type NoteMark = 'now' | 'hit' | 'miss' | null;

interface Stave {
  clef: Clef;
  bottomY: number;
  notes: TimedNote[];
  fingerY: number;
  nameY: number;
}

/**
 * Khuông nhạc SVG: khuông đơn (Sol hoặc Fa) hoặc khuông KÉP cho bài hai tay.
 * Vẽ nốt (đen/trắng/tròn/móc đơn, chấm dôi, dấu thăng/giáng, hợp âm, dấu lặng), vạch nhịp, con trỏ.
 */
export class StaffView {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private content: SVGGElement;
  private noteEls = new Map<number, SVGGElement>();
  private staves: Stave[];
  private page = -1;
  private readonly o: Required<StaffOptions>;
  private readonly height: number;

  constructor(
    private readonly tune: Tune,
    opts: StaffOptions = {},
  ) {
    this.o = {
      clef: opts.clef ?? (tune.hand === 'LH' ? 'bass' : 'treble'),
      names: opts.names ?? true,
      fingers: opts.fingers ?? true,
      mode: opts.mode ?? 'page',
      measuresPerPage: opts.measuresPerPage ?? 4,
      pxPerBeat: opts.pxPerBeat ?? (beatsPerMeasure(tune) === 3 ? 76 : 62),
    };
    if (tune.lh) {
      this.staves = [
        { clef: 'treble', bottomY: 116, notes: timeline(tune), fingerY: 18, nameY: 152 },
        { clef: 'bass', bottomY: 240, notes: lhTimeline(tune), fingerY: 290, nameY: 270 },
      ];
      this.height = 300;
    } else {
      this.staves = [{ clef: this.o.clef, bottomY: 116, notes: timeline(tune), fingerY: 18, nameY: 178 }];
      this.height = 186;
    }
    this.el = document.createElement('div');
    this.el.className = `staff staff-${this.o.mode}${tune.lh ? ' grand' : ''}`;
    const pageBeats = this.o.measuresPerPage * beatsPerMeasure(tune);
    const width = X0 + pageBeats * this.o.pxPerBeat + 24;
    this.svg = el('svg', {
      viewBox: `0 0 ${width} ${this.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `Khuông nhạc: ${tune.titleVi}`,
    });
    for (const s of this.staves) this.drawFrame(s, width);
    if (tune.lh) {
      // Vạch nối khuông kép
      this.svg.append(el('line', { x1: 8, x2: 8, y1: this.y(this.staves[0], 8), y2: this.y(this.staves[1], 0), class: 'staff-bar' }));
    }
    this.content = el('g', { class: 'staff-content' });
    if (this.o.mode === 'scroll') {
      const clipId = `staff-clip-${Math.random().toString(36).slice(2, 9)}`;
      const defs = el('defs');
      const clip = el('clipPath', { id: clipId });
      clip.append(el('rect', { x: X0 - 16, y: 0, width, height: this.height }));
      defs.append(clip);
      this.svg.append(defs);
      const wrap = el('g', { 'clip-path': `url(#${clipId})` });
      wrap.append(this.content);
      this.svg.append(wrap);
      this.drawAll();
      this.svg.append(el('line', { x1: X0, x2: X0, y1: 22, y2: this.height - 26, class: 'staff-playhead' }));
      this.setTime(0);
    } else {
      this.svg.append(this.content);
      this.showPage(0);
    }
    this.el.append(this.svg);
  }

  private y(s: Stave, step: number): number {
    return s.bottomY - (step * GAP) / 2;
  }

  private drawFrame(s: Stave, width: number): void {
    for (let i = 0; i < 5; i++) {
      const y = this.y(s, i * 2);
      this.svg.append(el('line', { x1: 8, x2: width - 8, y1: y, y2: y, class: 'staff-line' }));
    }
    const dy = s.bottomY - 116;
    this.svg.append(
      el('path', {
        class: 'staff-clef',
        transform: `translate(0 ${dy})`,
        d:
          s.clef === 'treble'
            ? 'M40,150 C30,150 28,138 38,136 C46,135 46,146 40,148 M40,148 C48,140 44,56 40,36 C37,22 48,18 50,32 C53,52 22,70 20,94 C18,114 44,122 56,108 C66,96 54,80 41,86 C30,92 34,108 46,105'
            : 'M24,76 C22,58 52,56 54,76 C56,100 34,118 18,126 M62,70 a3,3 0 1 0 0.1,0 M62,84 a3,3 0 1 0 0.1,0',
      }),
    );
    const [top, bottom] = this.tune.timeSignature.split('/');
    const ts = el('text', { x: 78, y: this.y(s, 6) + 6, class: 'staff-time' });
    ts.textContent = top;
    const ts2 = el('text', { x: 78, y: this.y(s, 2) + 6, class: 'staff-time' });
    ts2.textContent = bottom;
    this.svg.append(ts, ts2);
  }

  private xOf(beat: number, originBeat: number): number {
    return X0 + (beat - originBeat) * this.o.pxPerBeat;
  }

  private drawRange(from: number, to: number, originBeat: number): void {
    const bpm = beatsPerMeasure(this.tune);
    for (let m = from; m <= to; m++) {
      if (m === 0 && this.o.mode === 'page') continue;
      const x = this.xOf(m * bpm, originBeat) - 14;
      for (const s of this.staves) {
        this.content.append(el('line', { x1: x, x2: x, y1: this.y(s, 8), y2: this.y(s, 0), class: 'staff-bar' }));
      }
    }
    for (const s of this.staves) {
      for (const n of s.notes) {
        if (n.measure < from || n.measure >= to) continue;
        this.content.append(this.drawNote(s, n, this.xOf(n.start, originBeat)));
      }
    }
    if (to >= measureCount(this.tune)) {
      const end = this.xOf(measureCount(this.tune) * bpm, originBeat) - 14;
      const top = this.y(this.staves[0], 8);
      const bottom = this.y(this.staves[this.staves.length - 1], 0);
      this.content.append(el('line', { x1: end + 4, x2: end + 4, y1: top, y2: bottom, class: 'staff-bar end' }));
    }
  }

  private drawNote(s: Stave, n: TimedNote, x: number): SVGGElement {
    const g = el('g', { class: 'staff-note' });
    this.noteEls.set(n.index, g);
    if (n.rest) {
      const y = this.y(s, 4);
      if (n.beats >= 2) {
        g.append(el('rect', { x: x - 8, y: n.beats >= 4 ? this.y(s, 6) : y - 6, width: 16, height: 6, class: 'staff-rest' }));
      } else {
        g.append(el('path', { d: `M${x - 3},${y - 18} l7,9 l-7,7 l7,9 c-6,-3 -10,1 -5,6`, class: 'staff-rest-q' }));
      }
      return g;
    }
    const pitches = pitchesOf(n);
    const steps = pitches.map((p) => staffStep(p, s.clef));
    const hollow = n.beats >= 2;
    const dotted = [0.75, 1.5, 3].includes(n.beats);
    for (const [i, p] of pitches.entries()) {
      const step = steps[i];
      const y = this.y(s, step);
      for (const ls of ledgerSteps(step)) {
        g.append(el('line', { x1: x - 13, x2: x + 13, y1: this.y(s, ls), y2: this.y(s, ls), class: 'staff-ledger' }));
      }
      g.append(
        el('ellipse', {
          cx: x,
          cy: y,
          rx: 8.5,
          ry: 6.2,
          transform: `rotate(-20 ${x} ${y})`,
          class: hollow ? 'staff-head hollow' : 'staff-head',
        }),
      );
      const acc = pitchInfo(p).accidental;
      if (acc) {
        const t = el('text', { x: x - 17, y: y + 6, class: 'staff-acc' });
        t.textContent = acc === '#' ? '♯' : '♭';
        g.append(t);
      }
      if (dotted) g.append(el('circle', { cx: x + 14, cy: step % 2 === 0 ? y - 4 : y, r: 2.4, class: 'staff-dot' }));
    }
    if (n.beats < 4) {
      const lo = Math.min(...steps);
      const hi = Math.max(...steps);
      const up = stemUp((lo + hi) / 2);
      const sx = up ? x + 7.6 : x - 7.6;
      const y1 = up ? this.y(s, lo) : this.y(s, hi);
      const y2 = up ? this.y(s, hi) - 46 : this.y(s, lo) + 46;
      g.append(el('line', { x1: sx, x2: sx, y1, y2, class: 'staff-stem' }));
      if (n.beats < 1) {
        g.append(
          el('path', { d: up ? `M${sx},${y2} c4,8 12,10 10,22` : `M${sx},${y2} c4,-8 12,-10 10,-22`, class: 'staff-flag' }),
        );
      }
    }
    if (this.o.fingers) {
      const fs = [n.finger, ...(n.also ?? []).map((a) => a.finger)].filter((f): f is number => !!f);
      if (fs.length) {
        const t = el('text', { x, y: s.fingerY, class: `staff-finger${n.hand === 'LH' ? ' lh' : ''}` });
        t.textContent = fs.join('');
        g.append(t);
      }
    }
    if (this.o.names) {
      const t = el('text', { x, y: s.nameY, class: 'staff-name' });
      t.textContent = viName(n.pitch!).replace(' thăng', '♯').replace(' giáng', '♭');
      g.append(t);
    }
    return g;
  }

  private drawAll(): void {
    this.content.replaceChildren();
    this.noteEls.clear();
    this.drawRange(0, measureCount(this.tune), 0);
  }

  private showPage(p: number): void {
    if (p === this.page) return;
    this.page = p;
    this.content.replaceChildren();
    this.noteEls.clear();
    const per = this.o.measuresPerPage;
    const from = p * per;
    this.drawRange(from, Math.min(from + per, measureCount(this.tune)), from * beatsPerMeasure(this.tune));
  }

  private measureOf(index: number): number | undefined {
    for (const s of this.staves) {
      const n = s.notes.find((x) => x.index === index);
      if (n) return n.measure;
    }
    return undefined;
  }

  /** Đưa (các) nốt lên màn — lật trang nếu cần — và đánh dấu "đang tới". */
  setCursor(index: number | number[]): void {
    const idx = Array.isArray(index) ? index : [index];
    const m = idx.length ? this.measureOf(idx[0]) : undefined;
    if (m === undefined) return;
    if (this.o.mode === 'page') this.showPage(Math.floor(m / this.o.measuresPerPage));
    this.noteEls.forEach((g) => g.classList.remove('now'));
    for (const i of idx) this.noteEls.get(i)?.classList.add('now');
  }

  /** Băng chuyền: đặt vị trí theo phách hiện tại (nốt trôi về vạch đỏ). */
  setTime(beat: number): void {
    if (this.o.mode === 'scroll') {
      this.content.setAttribute('transform', `translate(${-beat * this.o.pxPerBeat} 0)`);
    } else {
      const bpm = beatsPerMeasure(this.tune);
      this.showPage(Math.floor(Math.max(0, beat) / bpm / this.o.measuresPerPage));
    }
  }

  mark(index: number, m: NoteMark): void {
    const g = this.noteEls.get(index);
    if (!g) return;
    g.classList.toggle('now', m === 'now');
    g.classList.toggle('hit', m === 'hit');
    g.classList.toggle('miss', m === 'miss');
  }

  clearMarks(): void {
    this.noteEls.forEach((g) => g.classList.remove('now', 'hit', 'miss'));
  }
}
