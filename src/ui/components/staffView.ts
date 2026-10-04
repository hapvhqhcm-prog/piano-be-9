import { ledgerSteps, staffStep, stemUp, type Clef } from '../../music/staff';
import { beatsPerMeasure, measureCount, timeline, type TimedNote, type Tune } from '../../music/tune';
import { viName } from '../../piano/pitchTable';

const SVG = 'http://www.w3.org/2000/svg';
const GAP = 14; // khoảng cách 2 vạch
const BOTTOM_Y = 116; // y của vạch dưới cùng
const X0 = 104; // nốt đầu tiên
const HEIGHT = 186;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const yOf = (step: number) => BOTTOM_Y - (step * GAP) / 2;

export interface StaffOptions {
  clef?: Clef;
  /** Hiện tên nốt dưới khuông (giàn giáo — rút dần ở tuần 7) */
  names?: boolean;
  /** Hiện số ngón trên đầu nốt */
  fingers?: boolean;
  /** 'page': hiện từng trang 4 ô nhịp, con trỏ nhảy; 'scroll': băng chuyền chạy ngang */
  mode?: 'page' | 'scroll';
  measuresPerPage?: number;
  pxPerBeat?: number;
}

export type NoteMark = 'now' | 'hit' | 'miss' | null;

/** Khuông nhạc SVG cho một bài: vẽ nốt, vạch nhịp, con trỏ; tô nốt đúng/trượt. */
export class StaffView {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private content: SVGGElement;
  private noteEls = new Map<number, SVGGElement>();
  private notes: TimedNote[];
  private page = -1;
  private readonly o: Required<StaffOptions>;
  private playhead: SVGLineElement | null = null;

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
      pxPerBeat: opts.pxPerBeat ?? 62,
    };
    this.notes = timeline(tune);
    this.el = document.createElement('div');
    this.el.className = `staff staff-${this.o.mode}`;
    const pageBeats = this.o.measuresPerPage * beatsPerMeasure(tune);
    const width = X0 + pageBeats * this.o.pxPerBeat + 24;
    this.svg = el('svg', {
      viewBox: `0 0 ${width} ${HEIGHT}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `Khuông nhạc: ${tune.titleVi}`,
    });
    this.drawStaffFrame(width);
    this.content = el('g', { class: 'staff-content' });
    if (this.o.mode === 'scroll') {
      // Nốt đã trôi qua vạch chơi thì ẩn đi, không đè lên khóa nhạc
      const clipId = `staff-clip-${tune.id.replace(/[^a-z0-9]/gi, '')}-${Math.random().toString(36).slice(2, 7)}`;
      const defs = el('defs');
      const clip = el('clipPath', { id: clipId });
      clip.append(el('rect', { x: X0 - 16, y: 0, width: width, height: HEIGHT }));
      defs.append(clip);
      this.svg.append(defs);
      const wrap = el('g', { 'clip-path': `url(#${clipId})` });
      wrap.append(this.content);
      this.svg.append(wrap);
    } else {
      this.svg.append(this.content);
    }
    if (this.o.mode === 'scroll') {
      this.drawAll();
      this.playhead = el('line', { x1: X0, x2: X0, y1: 22, y2: HEIGHT - 26, class: 'staff-playhead' });
      this.svg.append(this.playhead);
      this.setTime(0);
    } else {
      this.showPage(0);
    }
    this.el.append(this.svg);
  }

  private drawStaffFrame(width: number): void {
    for (let i = 0; i < 5; i++) {
      const y = yOf(i * 2);
      this.svg.append(el('line', { x1: 8, x2: width - 8, y1: y, y2: y, class: 'staff-line' }));
    }
    // Khóa — đơn giản hóa cho dễ nhìn
    const clef = el('path', {
      class: 'staff-clef',
      d:
        this.o.clef === 'treble'
          ? 'M40,150 C30,150 28,138 38,136 C46,135 46,146 40,148 M40,148 C48,140 44,56 40,36 C37,22 48,18 50,32 C53,52 22,70 20,94 C18,114 44,122 56,108 C66,96 54,80 41,86 C30,92 34,108 46,105'
          : 'M24,76 C22,58 52,56 54,76 C56,100 34,118 18,126 M62,70 a3,3 0 1 0 0.1,0 M62,84 a3,3 0 1 0 0.1,0',
    });
    this.svg.append(clef);
    const ts = el('text', { x: 78, y: yOf(6) + 6, class: 'staff-time' });
    ts.textContent = this.tune.timeSignature.split('/')[0];
    const ts2 = el('text', { x: 78, y: yOf(2) + 6, class: 'staff-time' });
    ts2.textContent = this.tune.timeSignature.split('/')[1];
    this.svg.append(ts, ts2);
  }

  private xOf(beat: number, originBeat: number): number {
    return X0 + (beat - originBeat) * this.o.pxPerBeat;
  }

  private drawNotes(from: number, to: number, originBeat: number): void {
    const bpm = beatsPerMeasure(this.tune);
    for (let m = from; m <= to; m++) {
      if (m === 0 && this.o.mode === 'page') continue;
      const x = this.xOf(m * bpm, originBeat) - 14;
      this.content.append(el('line', { x1: x, x2: x, y1: yOf(8), y2: yOf(0), class: 'staff-bar' }));
    }
    for (const n of this.notes) {
      if (n.measure < from || n.measure >= to) continue;
      this.content.append(this.drawNote(n, this.xOf(n.start, originBeat)));
    }
    if (to >= measureCount(this.tune)) {
      const end = this.xOf(measureCount(this.tune) * bpm, originBeat) - 14;
      this.content.append(el('line', { x1: end + 4, x2: end + 4, y1: yOf(8), y2: yOf(0), class: 'staff-bar end' }));
    }
  }

  private drawNote(n: TimedNote, x: number): SVGGElement {
    const g = el('g', { class: 'staff-note' });
    this.noteEls.set(n.index, g);
    if (n.rest) {
      const y = yOf(4);
      if (n.beats >= 2) {
        g.append(el('rect', { x: x - 8, y: n.beats >= 4 ? yOf(6) : y - 6, width: 16, height: 6, class: 'staff-rest' }));
      } else {
        g.append(el('path', { d: `M${x - 3},${y - 18} l7,9 l-7,7 l7,9 c-6,-3 -10,1 -5,6`, class: 'staff-rest-q' }));
      }
      return g;
    }
    const step = staffStep(n.pitch!, this.o.clef);
    const y = yOf(step);
    for (const ls of ledgerSteps(step)) {
      g.append(el('line', { x1: x - 13, x2: x + 13, y1: yOf(ls), y2: yOf(ls), class: 'staff-ledger' }));
    }
    const hollow = n.beats >= 2;
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
    if (n.beats < 4) {
      const up = stemUp(step);
      const sx = up ? x + 7.6 : x - 7.6;
      const sy2 = up ? y - 46 : y + 46;
      g.append(el('line', { x1: sx, x2: sx, y1: y, y2: sy2, class: 'staff-stem' }));
      if (n.beats < 1) {
        g.append(
          el('path', {
            d: up ? `M${sx},${sy2} c4,8 12,10 10,22` : `M${sx},${sy2} c4,-8 12,-10 10,-22`,
            class: 'staff-flag',
          }),
        );
      }
    }
    if (this.o.fingers && n.finger) {
      const t = el('text', { x, y: 18, class: 'staff-finger' });
      t.textContent = String(n.finger);
      g.append(t);
    }
    if (this.o.names) {
      const t = el('text', { x, y: HEIGHT - 8, class: 'staff-name' });
      t.textContent = viName(n.pitch!);
      g.append(t);
    }
    return g;
  }

  private drawAll(): void {
    this.content.replaceChildren();
    this.noteEls.clear();
    this.drawNotes(0, measureCount(this.tune), 0);
  }

  private showPage(p: number): void {
    if (p === this.page) return;
    this.page = p;
    this.content.replaceChildren();
    this.noteEls.clear();
    const per = this.o.measuresPerPage;
    const from = p * per;
    this.drawNotes(from, Math.min(from + per, measureCount(this.tune)), from * beatsPerMeasure(this.tune));
  }

  /** Đưa nốt `index` lên màn (lật trang nếu cần) và đánh dấu "đang tới". */
  setCursor(index: number): void {
    const n = this.notes[index];
    if (!n) return;
    if (this.o.mode === 'page') this.showPage(Math.floor(n.measure / this.o.measuresPerPage));
    this.noteEls.forEach((g) => g.classList.remove('now'));
    this.noteEls.get(index)?.classList.add('now');
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
