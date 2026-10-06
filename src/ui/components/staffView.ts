import { ledgerSteps, staffStep, stemUp, type Clef } from '../../music/staff';
import {
  beamGroups,
  beamSegments,
  flagCount,
  groupStemUp,
  makeSpacing,
  noteShape,
  spaceAt,
  type Spacing,
} from '../../music/engrave';
import {
  beatsPerMeasure,
  expressionUsed,
  lhTimeline,
  measureCount,
  pitchesOf,
  slurSpans,
  timeline,
  type TimedNote,
  type Tune,
} from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import { pitchInfo, viName } from '../../piano/pitchTable';

const SVG = 'http://www.w3.org/2000/svg';
const GAP = 14; // khoảng cách 2 vạch
const X0 = 104; // nốt đầu tiên
/** Độ dài đuôi nốt đơn lẻ */
const STEM = 46;
/** Đuôi nốt có gạch nối: khoảng tối thiểu từ đầu nốt gần gạch nhất tới mép ngoài gạch */
const BEAM_STEM = 42;
/** Độ dày gạch nối & khoảng giữa hai gạch (móc kép) */
const BEAM_T = 6;
const BEAM_GAP = 9.5;
/** Khoảng tối thiểu giữa hai mốc nốt liền nhau (móc kép không dính nhau) */
const MIN_GAP = 30;
const MIN_GAP_NAMES = 34;
/** Chừa thêm trước vạch nhịp / trước nốt có dấu thăng-giáng */
const BAR_PAD = 8;
const ACC_PAD = 10;

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
  /** v5 — Tập tách tay: bè của tay này vẽ MỜ (app đàn thay / không chấm) */
  dimHand?: Hand | null;
}

export type NoteMark = 'now' | 'hit' | 'miss' | null;

interface Stave {
  clef: Clef;
  bottomY: number;
  notes: TimedNote[];
  /** Nhóm gạch nối (mỗi nhóm: các nốt theo thứ tự thời gian) */
  beams: TimedNote[][];
  fingerY: number;
  nameY: number;
  /** v4 — hàng chữ sắc thái (p / mf / f) */
  dynY: number;
}

/** Đuôi nốt do nhóm gạch nối quyết định */
interface StemInfo {
  up: boolean;
  /** y mép ngoài gạch nối tại đuôi nốt */
  tipY: number;
}

/** v4 — chỗ dành thêm cho hàng chữ sắc thái (chỉ khi bài có ghi sắc thái) */
const DYN_PAD = 30;

/** pxPerBeat mặc định theo nhịp: 2/4 (dân ca, nhiều móc kép) giãn rộng gấp đôi để mỗi trang vẫn 4 ô nhịp dễ đọc */
function defaultPxPerBeat(bpm: number): number {
  return bpm === 3 ? 76 : bpm === 2 ? 124 : 62;
}

/**
 * Khuông nhạc SVG: khuông đơn (Sol hoặc Fa) hoặc khuông KÉP cho bài hai tay.
 * Vẽ nốt (tròn/trắng/đen/móc đơn/móc kép, chấm dôi, dấu thăng/giáng, hợp âm, dấu lặng),
 * gạch nối theo phách (như sách in), vạch nhịp, con trỏ.
 * Giãn cách theo trường độ có khoảng tối thiểu: mọi vị trí x đi qua `xOf` (nốt, vạch nhịp, dấu luyến, băng chuyền).
 */
export class StaffView {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private content: SVGGElement;
  private noteEls = new Map<number, SVGGElement>();
  /** Hướng đuôi nốt đã vẽ (để đặt dấu luyến đúng phía) */
  private stemDir = new Map<number, boolean>();
  private staves: Stave[];
  private page = -1;
  private readonly o: Required<StaffOptions>;
  private readonly height: number;
  private readonly spacing: Spacing;
  /** Bề ngang dành cho nốt (từ X0) của một trang đầy */
  private readonly avail: number;
  /** Ánh xạ của trang đang hiện: x = X0 + (spaceAt(phách) − origin) × scale */
  private origin = 0;
  private scale = 1;
  /** Con trỏ đang vẽ (khóa các chỉ số nốt) — chỉ đụng tới DOM khi con trỏ thật sự đổi nhóm */
  private cursorKey = '';
  /**
   * Băng chuyền (mode 'scroll'): dải nốt là một <svg> riêng nằm trong khung HTML cắt hai bên; chạy ngang bằng
   * CSS `transform: translate3d()` trên lớp HTML (GPU ghép lớp — không vẽ lại khuông mỗi khung hình, nhẹ cho iPad cũ).
   */
  private strip: { clip: HTMLDivElement; move: HTMLDivElement; svg: SVGSVGElement; x0: number; w: number } | null = null;
  /** px màn hình trên mỗi đơn vị viewBox (đo bằng ResizeObserver, không đọc bố cục mỗi khung hình) */
  private px = 0;
  /** Độ dịch hiện tại (đơn vị viewBox) */
  private shift = 0;
  /** Phần lẻ (px) của vị trí khung cắt — cộng vào transform */
  private frac: [number, number] = [0, 0];
  private ro: ResizeObserver | null = null;

  constructor(
    private readonly tune: Tune,
    opts: StaffOptions = {},
  ) {
    const bpm = beatsPerMeasure(tune);
    this.o = {
      clef: opts.clef ?? (tune.hand === 'LH' ? 'bass' : 'treble'),
      names: opts.names ?? true,
      fingers: opts.fingers ?? true,
      mode: opts.mode ?? 'page',
      measuresPerPage: opts.measuresPerPage ?? 4,
      pxPerBeat: opts.pxPerBeat ?? defaultPxPerBeat(bpm),
      dimHand: opts.dimHand ?? null,
    };
    // Bài có sắc thái: chừa một hàng dưới khuông (khuông kép: giữa hai khuông, như bản nhạc piano thật)
    const pad = expressionUsed(tune).dyn ? DYN_PAD : 0;
    const voice = (notes: TimedNote[]) => {
      const groups = beamGroups(notes, bpm).map((g) => g.map((i) => notes[i]));
      return { notes, beams: groups };
    };
    if (tune.lh) {
      // Bè tay trái nằm trọn từ Đô giữa trở lên (vd "Lý ngựa ô": Rê4–Fa4) → khóa Sol như bản piano thật, khỏi vạch phụ
      const lhNotes = lhTimeline(tune);
      const lhLow = Math.min(...lhNotes.flatMap(pitchesOf).map((p) => staffStep(p, 'treble')));
      const lhClef: Clef = Number.isFinite(lhLow) && lhLow >= -2 ? 'treble' : 'bass';
      this.staves = [
        { clef: 'treble', bottomY: 116, ...voice(timeline(tune)), fingerY: 18, nameY: 152, dynY: 184 },
        { clef: lhClef, bottomY: 240 + pad, ...voice(lhNotes), fingerY: 290 + pad, nameY: 270 + pad, dynY: 184 },
      ];
      this.height = 300 + pad;
    } else {
      this.staves = [{ clef: this.o.clef, bottomY: 116, ...voice(timeline(tune)), fingerY: 18, nameY: 178 + pad, dynY: 180 }];
      this.height = 186 + pad;
    }

    // Giãn cách chung cho mọi khuông (nốt cùng lúc thẳng hàng dọc)
    const total = measureCount(tune);
    const all = this.staves.flatMap((s) => s.notes);
    const bars = new Set<number>();
    for (let m = 0; m <= total; m++) bars.add(m * bpm);
    const accAt = new Set(
      all.filter((n) => pitchesOf(n).some((p) => pitchInfo(p).accidental)).map((n) => Math.round(n.start * 1e6) / 1e6),
    );
    this.spacing = makeSpacing(
      [...all.map((n) => n.start), ...bars],
      this.o.pxPerBeat,
      this.o.names ? MIN_GAP_NAMES : MIN_GAP,
      (t) => (bars.has(t) ? BAR_PAD : 0) + (accAt.has(t) ? ACC_PAD : 0),
    );
    // Bề ngang trang: đủ cho trang dày nốt nhất (trang thưa được giãn đều ra cho kín — như bản in)
    const per = this.o.measuresPerPage;
    let avail = per * bpm * this.o.pxPerBeat;
    if (this.o.mode === 'page') {
      for (let from = 0; from < total; from += per) {
        const to = Math.min(from + per, total);
        const w = spaceAt(this.spacing, to * bpm) - spaceAt(this.spacing, from * bpm);
        avail = Math.max(avail, (w * per) / (to - from));
      }
    }
    this.avail = avail;

    this.el = document.createElement('div');
    this.el.className = `staff staff-${this.o.mode}${tune.lh ? ' grand' : ''}`;
    const width = X0 + avail + 24;
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
      this.buildStrip(width);
    } else {
      this.svg.append(this.content);
      this.showPage(0);
      this.el.append(this.svg);
    }
  }

  /**
   * Băng chuyền: [khung khuông (svg tĩnh)] + [khung cắt HTML ▸ lớp chạy (will-change: transform) ▸ svg dải nốt]
   * + [svg vạch đỏ ở trên cùng]. Ba lớp cùng hệ toạ độ viewBox (meet, căn giữa) → hình y hệt bản một-svg cũ.
   * Cắt hai bên: nốt chỉ hiện giữa (vạch đỏ − 16) và mép phải khuông, như clipPath trước đây.
   */
  private buildStrip(width: number): void {
    const stage = document.createElement('div');
    stage.className = 'staff-stage';
    this.drawAll();
    const total = beatsPerMeasure(this.tune) * measureCount(this.tune);
    const x0 = X0 - 16;
    // Dải đủ dài cho cả bài (+ chỗ vạch kết, dấu luyến cuối, số ngón)
    const w = X0 + spaceAt(this.spacing, total) + 60 - x0;
    const svg = el('svg', { viewBox: `${x0} 0 ${w} ${this.height}`, preserveAspectRatio: 'xMinYMin meet', class: 'staff-strip-svg', 'aria-hidden': 'true' });
    svg.append(this.content);
    const move = document.createElement('div');
    move.className = 'staff-strip';
    move.append(svg);
    const clip = document.createElement('div');
    clip.className = 'staff-clip';
    clip.append(move);
    this.strip = { clip, move, svg, x0, w };
    const top = el('svg', {
      viewBox: `0 0 ${width} ${this.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'staff-over',
      'aria-hidden': 'true',
    });
    top.append(el('line', { x1: X0, x2: X0, y1: 22, y2: this.height - 26, class: 'staff-playhead' }));
    stage.append(this.svg, clip, top);
    this.el.append(stage);
    const vw = width;
    const vh = this.height;
    const fit = (W: number, H: number) => {
      if (!(W > 0 && H > 0) || !this.strip) return;
      // Cùng phép "meet + căn giữa" của svg khung → toạ độ viewBox → px
      const s = Math.min(W / vw, H / vh);
      const ox = (W - vw * s) / 2;
      const oy = (H - vh * s) / 2;
      this.px = s;
      // Khung cắt đặt ở px NGUYÊN (lớp GPU không nhận nửa px khi đặt vị trí); phần lẻ dồn vào transform của dải
      const left = ox + x0 * s;
      const top = oy;
      this.frac = [left - Math.round(left), top - Math.round(top)];
      const cs = this.strip.clip.style;
      cs.left = `${Math.round(left)}px`;
      cs.top = `${Math.round(top)}px`;
      cs.width = `${(vw - 8 - x0) * s}px`;
      cs.height = `${vh * s}px`;
      this.strip.svg.style.width = `${w * s}px`;
      this.strip.svg.style.height = `${vh * s}px`;
      this.applyShift();
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver((entries) => {
        if (!stage.isConnected) {
          // Màn đã đóng → thôi theo dõi (tránh giữ DOM cũ)
          this.ro?.disconnect();
          this.ro = null;
          return;
        }
        const r = entries[entries.length - 1].contentRect;
        fit(r.width, r.height);
      });
      this.ro.observe(stage);
    }
    this.setTime(0);
  }

  private applyShift(): void {
    if (!this.strip) return;
    // Làm tròn tới 1/100 px: đủ mượt, chuỗi transform ngắn
    const tx = Math.round((this.frac[0] - this.shift * this.px) * 100) / 100;
    const ty = Math.round(this.frac[1] * 100) / 100;
    this.strip.move.style.transform = `translate3d(${tx}px,${ty}px,0)`;
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

  /** Vị trí x của một phách trên trang đang hiện (băng chuyền: trên dải nhạc, trước khi dịch). */
  private xOf(beat: number): number {
    return X0 + (spaceAt(this.spacing, beat) - this.origin) * this.scale;
  }

  private drawRange(from: number, to: number): void {
    const bpm = beatsPerMeasure(this.tune);
    for (let m = from; m <= to; m++) {
      if (m === 0 && this.o.mode === 'page') continue;
      const x = this.xOf(m * bpm) - 14;
      for (const s of this.staves) {
        this.content.append(el('line', { x1: x, x2: x, y1: this.y(s, 8), y2: this.y(s, 0), class: 'staff-bar' }));
      }
    }
    const dynAt = new Set<number>();
    for (const s of this.staves) {
      // Gạch nối trước: biết hướng & độ dài đuôi của từng nốt trong nhóm
      const stems = new Map<number, StemInfo>();
      const beamLayer = el('g', { class: 'staff-beams' });
      for (const g of s.beams) {
        if (g[0].measure < from || g[0].measure >= to) continue;
        this.drawBeam(s, g, stems, beamLayer);
      }
      for (const n of s.notes) {
        if (n.measure < from || n.measure >= to) continue;
        const x = this.xOf(n.start);
        this.content.append(this.drawNote(s, n, x, stems.get(n.index)));
        // v4: chữ sắc thái ở nốt có ghi `dyn` (khuông kép: một hàng chung giữa hai khuông)
        const key = Math.round(n.start * 1000);
        if (n.dyn && !dynAt.has(key)) {
          dynAt.add(key);
          const t = el('text', { x: x - 2, y: s.dynY, class: 'staff-dyn' });
          t.textContent = n.dyn;
          this.content.append(t);
        }
      }
      this.content.append(beamLayer);
      this.drawSlurs(s, from, to);
    }
    if (to >= measureCount(this.tune)) {
      const end = this.xOf(measureCount(this.tune) * bpm) - 14;
      const top = this.y(this.staves[0], 8);
      const bottom = this.y(this.staves[this.staves.length - 1], 0);
      this.content.append(el('line', { x1: end + 4, x2: end + 4, y1: top, y2: bottom, class: 'staff-bar end' }));
    }
  }

  /**
   * Một nhóm gạch nối: hướng đuôi chung (nốt xa vạch giữa nhất quyết định), gạch hơi nghiêng theo giai điệu
   * (tối đa nửa khoảng vạch; nốt giữa vượt ra ngoài → gạch nằm ngang), mọi đuôi đủ dài.
   */
  private drawBeam(s: Stave, g: TimedNote[], stems: Map<number, StemInfo>, layer: SVGGElement): void {
    const steps = g.map((n) => pitchesOf(n).map((p) => staffStep(p, s.clef)));
    const up = groupStemUp(steps.flat());
    const sx = g.map((n) => this.xOf(n.start) + (up ? 7.6 : -7.6));
    const levels = Math.max(...g.map((n) => flagCount(n.beats)));
    const len = BEAM_STEM + (levels - 1) * BEAM_GAP * 0.6;
    // Đầu đuôi "lý tưởng" của từng nốt
    const tip = steps.map((st) => (up ? this.y(s, Math.max(...st)) - len : this.y(s, Math.min(...st)) + len));
    const last = g.length - 1;
    let dy = tip[last] - tip[0];
    const ends = up ? Math.min(tip[0], tip[last]) : Math.max(tip[0], tip[last]);
    if (tip.slice(1, -1).some((t) => (up ? t < ends : t > ends))) dy = 0;
    dy = Math.max(-GAP / 2, Math.min(GAP / 2, dy / 2));
    const dx = sx[last] - sx[0];
    const slope = dx > 0 ? dy / dx : 0;
    const shifted = tip.map((t, i) => t - slope * (sx[i] - sx[0]));
    const c = up ? Math.min(...shifted) : Math.max(...shifted);
    const lineY = (x: number) => c + slope * (x - sx[0]);
    g.forEach((n, i) => stems.set(n.index, { up, tipY: lineY(sx[i]) }));

    for (const seg of beamSegments(g)) {
      const off = (seg.level - 1) * BEAM_GAP * (up ? 1 : -1);
      let xa = sx[seg.from] - 1;
      let xb = sx[seg.to] + 1;
      if (seg.stub) {
        const i = seg.from;
        const nb = sx[i + seg.stub] ?? sx[i] + seg.stub * 24;
        const stubLen = Math.min(13, Math.abs(nb - sx[i]) * 0.45);
        if (seg.stub < 0) xa = sx[i] - stubLen;
        else xb = sx[i] + stubLen;
      }
      const t = up ? BEAM_T : -BEAM_T;
      const ya = lineY(xa) + off;
      const yb = lineY(xb) + off;
      layer.append(
        el('path', {
          d: `M${xa},${ya} L${xb},${yb} L${xb},${yb + t} L${xa},${ya + t} Z`,
          class: 'staff-beam',
        }),
      );
    }
  }

  private drawRest(s: Stave, n: TimedNote, x: number, g: SVGGElement): void {
    const bpm = beatsPerMeasure(this.tune);
    const shape = noteShape(n.beats);
    // Lặng cả ô nhịp: dấu lặng tròn ở giữa ô (như bản in), mọi nhịp
    const wholeBar = Math.abs(n.beats - bpm) < 1e-6 && Math.abs(n.start / bpm - Math.round(n.start / bpm)) < 1e-6;
    if (wholeBar || shape.base >= 4) {
      const cx = wholeBar ? (this.xOf(n.start) - 14 + this.xOf(n.start + bpm) - 14) / 2 : x;
      g.append(el('rect', { x: cx - 8, y: this.y(s, 6), width: 16, height: 6, class: 'staff-rest' }));
      return;
    }
    const y4 = this.y(s, 4);
    const y5 = this.y(s, 5);
    if (shape.base >= 2) {
      g.append(el('rect', { x: x - 8, y: y4 - 6, width: 16, height: 6, class: 'staff-rest' }));
    } else if (shape.base >= 1) {
      g.append(el('path', { d: `M${x - 3},${y4 - 18} l7,9 l-7,7 l7,9 c-6,-3 -10,1 -5,6`, class: 'staff-rest-q' }));
    } else {
      // Lặng móc đơn / móc kép: chấm tròn + nét chéo (mỗi móc thêm một chấm)
      const flags = flagCount(n.beats);
      const top = y5 - 2;
      const bottom = y5 + 20 + (flags - 1) * 9;
      const slope = 7 / (bottom - top); // nét chéo đi xuống sang trái
      const rx = x + 6; // đỉnh nét chéo (cả hình nằm giữa vị trí x)
      const parts = [`M${rx},${top} L${rx - slope * (bottom - top)},${bottom}`];
      for (let k = 0; k < flags; k++) {
        const yy = top + k * 9;
        const xe = rx - slope * (yy - top);
        g.append(el('circle', { cx: xe - 7, cy: yy + 1.5, r: 3.2, class: 'staff-rest' }));
        parts.push(`M${xe - 7},${yy + 3} Q${xe - 3},${yy + 5} ${xe},${yy}`);
      }
      g.append(el('path', { d: parts.join(' '), class: 'staff-rest-q' }));
    }
    for (let k = 0; k < shape.dots; k++) g.append(el('circle', { cx: x + 12 + k * 6, cy: y5, r: 2.4, class: 'staff-dot' }));
  }

  private drawNote(s: Stave, n: TimedNote, x: number, beam?: StemInfo): SVGGElement {
    const g = el('g', { class: this.o.dimHand && n.hand === this.o.dimHand ? 'staff-note dim' : 'staff-note' });
    this.noteEls.set(n.index, g);
    if (n.rest) {
      this.drawRest(s, n, x, g);
      return g;
    }
    const pitches = pitchesOf(n);
    const steps = pitches.map((p) => staffStep(p, s.clef));
    const shape = noteShape(n.beats);
    const hollow = shape.base >= 2;
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
          // Kiểm thử tự động (scripts/e2e.mjs) đọc nốt trên khuông — không ảnh hưởng hiển thị
          'data-e2e-pitch': p,
        }),
      );
      const acc = pitchInfo(p).accidental;
      if (acc) {
        const t = el('text', { x: x - 17, y: y + 6, class: 'staff-acc' });
        t.textContent = acc === '#' ? '♯' : '♭';
        g.append(t);
      }
      for (let k = 0; k < shape.dots; k++) {
        g.append(el('circle', { cx: x + 14 + k * 6, cy: step % 2 === 0 ? y - 4 : y, r: 2.4, class: 'staff-dot' }));
      }
    }
    const lo = Math.min(...steps);
    const hi = Math.max(...steps);
    const up = beam ? beam.up : stemUp((lo + hi) / 2);
    this.stemDir.set(n.index, up);
    if (n.stac) {
      // v4: chấm ngắt tiếng — phía đầu nốt (ngược phía đuôi nốt), tránh nằm đè lên dòng kẻ
      const step = up ? lo - 2 : hi + 2;
      const yy = this.y(s, step % 2 === 0 ? step + (up ? -1 : 1) : step);
      g.append(el('circle', { cx: x, cy: yy, r: 3.8, class: 'staff-stac' }));
    }
    if (shape.base < 4) {
      const sx = up ? x + 7.6 : x - 7.6;
      const y1 = up ? this.y(s, lo) : this.y(s, hi);
      const flags = beam ? 0 : flagCount(n.beats);
      // Nốt móc kép đứng riêng: đuôi dài thêm cho đủ chỗ hai móc
      const y2 = beam ? beam.tipY : up ? this.y(s, hi) - STEM - (flags - 1) * 4 : this.y(s, lo) + STEM + (flags - 1) * 4;
      g.append(el('line', { x1: sx, x2: sx, y1, y2, class: 'staff-stem' }));
      for (let k = 0; k < flags; k++) {
        const fy = up ? y2 + k * 10 : y2 - k * 10;
        g.append(
          el('path', { d: up ? `M${sx},${fy} c4,8 12,10 10,22` : `M${sx},${fy} c4,-8 12,-10 10,-22`, class: 'staff-flag' }),
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

  /**
   * v4 — Dấu luyến: đường cong từ nốt đầu tới nốt cuối, phía đầu nốt (ngược đuôi nốt), vượt qua các nốt ở giữa.
   * Đuôi nốt trong dấu luyến không cùng hướng → dấu luyến nằm trên (như bản in).
   * Trang chỉ có một nửa dấu luyến (câu vắt qua trang) → vẽ tới mép trang.
   */
  private drawSlurs(s: Stave, from: number, to: number): void {
    const bpm = beatsPerMeasure(this.tune);
    const byIndex = new Map(s.notes.map((n) => [n.index, n]));
    for (const [a, b] of slurSpans(s.notes)) {
      const na = byIndex.get(a)!;
      const nb = byIndex.get(b)!;
      if (nb.measure < from || na.measure >= to) continue;
      const span = s.notes.filter((n) => !n.rest && n.index >= a && n.index <= b && n.measure >= from && n.measure < to);
      if (!span.length) continue;
      const below = span.every((n) => this.stemDir.get(n.index) ?? true); // mọi đuôi hướng lên → dấu luyến nằm dưới
      const headY = (n: TimedNote) => {
        const st = pitchesOf(n).map((p) => staffStep(p, s.clef));
        return this.y(s, below ? Math.min(...st) : Math.max(...st));
      };
      const aIn = na.measure >= from;
      const bIn = nb.measure < to;
      const x1 = aIn ? this.xOf(na.start) + 2 : X0 - 8;
      const x2 = bIn ? this.xOf(nb.start) - 2 : this.xOf(to * bpm) - 22;
      if (x2 - x1 < 8) continue;
      const off = below ? 13 : -13;
      const y1 = (aIn ? headY(na) : headY(span[0])) + off;
      const y2 = (bIn ? headY(nb) : headY(span[span.length - 1])) + off;
      const ys = span.map(headY);
      const bulge = Math.min(34, 14 + (x2 - x1) * 0.06);
      const cy = below ? Math.max(...ys) + 13 + bulge : Math.min(...ys) - 13 - bulge;
      const cx = (x1 + x2) / 2;
      const th = below ? -4.5 : 4.5; // độ dày ở giữa (hình lưỡi liềm cho dễ nhìn)
      this.content.append(
        el('path', {
          d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2} Q${cx},${cy + th} ${x1},${y1} Z`,
          class: 'staff-slur',
        }),
      );
    }
  }

  private clear(): void {
    this.cursorKey = '';
    this.content.replaceChildren();
    this.noteEls.clear();
    this.stemDir.clear();
  }

  private drawAll(): void {
    this.clear();
    this.origin = 0;
    this.scale = 1;
    this.drawRange(0, measureCount(this.tune));
  }

  private showPage(p: number): void {
    if (p === this.page) return;
    this.page = p;
    this.clear();
    const per = this.o.measuresPerPage;
    const bpm = beatsPerMeasure(this.tune);
    const from = p * per;
    const to = Math.min(from + per, measureCount(this.tune));
    // Giãn trang cho kín bề ngang (trang cuối ít ô nhịp: chỉ chiếm phần tương ứng)
    const a = spaceAt(this.spacing, from * bpm);
    const w = spaceAt(this.spacing, to * bpm) - a;
    this.origin = a;
    this.scale = w > 0 ? (this.avail * Math.max(1, to - from)) / per / w : 1;
    this.drawRange(from, to);
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
    // Gọi mỗi khung hình (theo nhịp / xem mẫu) → chỉ đổi lớp CSS khi con trỏ sang nhóm nốt khác
    const key = idx.join(',');
    if (key === this.cursorKey) return;
    this.cursorKey = key;
    this.noteEls.forEach((g) => g.classList.remove('now'));
    for (const i of idx) this.noteEls.get(i)?.classList.add('now');
  }

  /** Băng chuyền: đặt vị trí theo phách hiện tại (nốt trôi về vạch đỏ — đúng lúc kể cả khi giãn cách không đều). */
  setTime(beat: number): void {
    if (this.o.mode === 'scroll') {
      this.shift = spaceAt(this.spacing, beat);
      this.applyShift();
    } else {
      const bpm = beatsPerMeasure(this.tune);
      this.showPage(Math.floor(Math.max(0, beat) / bpm / this.o.measuresPerPage));
    }
  }

  mark(index: number, m: NoteMark): void {
    const g = this.noteEls.get(index);
    if (!g) return;
    this.cursorKey = '';
    g.classList.toggle('now', m === 'now');
    g.classList.toggle('hit', m === 'hit');
    g.classList.toggle('miss', m === 'miss');
  }

  clearMarks(): void {
    this.cursorKey = '';
    this.noteEls.forEach((g) => g.classList.remove('now', 'hit', 'miss'));
  }
}
