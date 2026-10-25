import { ledgerSteps, staffStep, stemUp, type Clef } from '../../music/staff';
import {
  accidentalPath,
  beamGroupsIn,
  beamSegments,
  bracePath,
  clefPath,
  durationGap,
  flagCount,
  groupStemUp,
  makeSpacing,
  noteLetter,
  noteShape,
  spaceAt,
  type Spacing,
} from '../../music/engrave';
import {
  beatsPerMeasure,
  expressionUsed,
  hairpinSpans,
  isCompound,
  lhTimeline,
  measureCount,
  noteUnit,
  pedalSpans,
  pitchesOf,
  slurSpans,
  timeline,
  type TimedNote,
  type Tune,
} from '../../music/tune';
import type { Hand } from '../../piano/fingering';
import { pitchInfo, viName } from '../../piano/pitchTable';

const SVG = 'http://www.w3.org/2000/svg';
/** Khoảng cách 2 vạch (đơn vị viewBox). Mọi kích thước dưới đây tính theo nó. */
const GAP = 14;
/** (+ 2026-10-15) Đầu nốt to hơn (bán trục elip, nghiêng −20°) — đọc rõ từ giá nhạc 50–70 cm */
const HEAD_RX = 9;
const HEAD_RY = 6.6;
/** Đuôi nốt dính mép đầu nốt */
const STEM_DX = 8.1;
/** Độ dài đuôi nốt đơn lẻ */
const STEM = 46;
/** Đuôi nốt có gạch nối: khoảng tối thiểu từ đầu nốt gần gạch nhất tới mép ngoài gạch */
const BEAM_STEM = 42;
/** Độ dày gạch nối & khoảng giữa hai gạch (móc kép) */
const BEAM_T = 6;
const BEAM_GAP = 9.5;
/** Khoảng tối thiểu giữa hai mốc nốt liền nhau (móc kép không dính nhau; có tên nốt: chữ không chạm nhau) */
const MIN_GAP = 30;
const MIN_GAP_NAMES = 36;
/** Chừa thêm trước vạch nhịp / trước nốt có dấu thăng-giáng */
const BAR_PAD = 8;
const ACC_PAD = 12;
/** Vạch nhịp cách nốt đầu ô (nốt đầu ô có dấu hóa: lùi thêm cho dấu hóa) */
const BAR_DX = 14;
const BAR_DX_ACC = 32;
/** Dấu luyến: độ cong tối đa (để biết trước chỗ cần chừa — số ngón / tên nốt không đè lên dấu luyến) */
const SLUR_MAX = 22;
/** Cỡ chữ (khớp CSS .staff-finger / .staff-name) — để xếp hàng chữ không chồng nhau */
const FINGER_ASC = 16; // phần chữ số nằm trên đường chân chữ (cỡ 21)
const NAME_ASC = 15; // tên nốt cỡ 18 + dấu tiếng Việt (ô, ê)
const ROW_PAD = 6;

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
  /** Ghi rõ → giãn cách TUYẾN TÍNH đúng số px mỗi phách (khuông nhỏ trò chơi/thẻ). Bỏ trống → giãn cách kiểu bản in. */
  pxPerBeat?: number;
  /** v5 — Tập tách tay: bè của tay này vẽ MỜ (app đàn thay / không chấm) */
  dimHand?: Hand | null;
  /** (+ 2026-10-15) 🎨 Nốt màu: tô đầu nốt + tên nốt theo tên nốt (đổi được sau bằng setColors) */
  colors?: boolean;
}

/** hit = app NGHE/thấy đúng (xanh) · miss = trượt · parent = bé chạm "Đi tiếp" (đã qua nhưng app không xác nhận — không tô xanh) */
export type NoteMark = 'now' | 'hit' | 'miss' | 'parent' | null;

/**
 * (+ 2026-10-09) "Nhận xét kiểu thầy giáo" — màu từng nốt sau lượt chơi: ok xanh · wrong đỏ (+ tên nốt bé đàn nhầm) ·
 * missed xám rỗng · early/late cam (+ mũi tên ←/→) · helped = bé chạm "Đi tiếp" (trung tính).
 */
export interface ReviewMark {
  kind: 'ok' | 'wrong' | 'missed' | 'early' | 'late' | 'helped';
  /** Chữ nhỏ phía trên khuông (vd tên nốt bé đàn nhầm, "←" sớm, "→" muộn) */
  tag?: string;
}
const RV_CLASSES = ['rv-ok', 'rv-wrong', 'rv-missed', 'rv-early', 'rv-late', 'rv-helped'];

interface Stave {
  clef: Clef;
  bottomY: number;
  notes: TimedNote[];
  /** Nhóm gạch nối (mỗi nhóm: các nốt theo thứ tự thời gian) */
  beams: TimedNote[][];
  /** y chân chữ hàng số ngón (0 = không có hàng) */
  fingerY: number;
  /** y chân chữ hàng tên nốt (0 = không có hàng) */
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

/** Cấp 4 — hàng chữ tốc độ / "rit." trên cùng (chỉ khi bài có) */
const TOP_PAD = 26;

/**
 * Giãn cách TUYẾN TÍNH (băng chuyền — trôi đều): px mỗi phách theo nhịp. 2/4 (dân ca, nhiều móc kép) giãn rộng gấp đôi;
 * x/8 (phách = móc đơn): 34 px mỗi móc đơn → ô 6/8 rộng như ô 3/4.
 */
function linearPxPerBeat(bpm: number, unit = 1): number {
  if (unit !== 1) return 34;
  return bpm === 3 ? 68 : bpm === 2 ? 110 : 56;
}

/**
 * (+ 2026-10-15) Giãn cách kiểu bản in (trang): px mỗi NỐT ĐEN (khoảng = px × trường độ^0,72 — engrave.durationGap).
 * Nhỏ hơn bản tuyến tính cũ → trang hẹp hơn → khuông phóng to hơn trên iPad.
 */
function pagePxPerQuarter(bpm: number, unit = 1): number {
  if (unit !== 1) return 50;
  return bpm === 3 ? 52 : bpm === 2 ? 76 : 46;
}

/**
 * Khuông nhạc SVG: khuông đơn (Sol hoặc Fa) hoặc khuông KÉP cho bài hai tay.
 * Vẽ nốt (tròn/trắng/đen/móc đơn/móc kép, chấm dôi, dấu thăng/giáng, hợp âm, dấu lặng),
 * gạch nối theo phách (như sách in), vạch nhịp, con trỏ.
 * Giãn cách theo trường độ có khoảng tối thiểu: mọi vị trí x đi qua `xOf` (nốt, vạch nhịp, dấu luyến, băng chuyền).
 *
 * (+ 2026-10-15) "Khuông nhạc đẹp & dễ đọc hơn": khóa Sol/Fa, dấu hóa, ngoặc khuông kép là HÌNH VẼ (không phụ thuộc
 * phông); các hàng số ngón (tay phải: trên · tay trái: dưới) / tên nốt / sắc thái / pedal xếp theo nội dung thật của
 * bài (đuôi nốt, gạch nối, dấu luyến) → không chồng nhau và không phí chỗ trống; nốt màu; con trỏ trượt mượt
 * (setTime — chỉ đổi transform, không vẽ lại); nốt sắp đàn sáng lên (chế độ chờ: nhịp nhẹ).
 */
export class StaffView {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private content: SVGGElement;
  private noteEls = new Map<number, SVGGElement>();
  /** Hướng đuôi nốt (tính trước cho cả bài: gạch nối, dấu luyến, chỗ chừa cho hàng chữ) */
  private stemUpOf = new Map<number, boolean>();
  private staves: Stave[];
  private page = -1;
  private readonly o: Required<Omit<StaffOptions, 'pxPerBeat'>> & { pxPerBeat: number };
  private readonly height: number;
  /** Cấp 4 — nốt đen mỗi phách (x/8: 0.5) — hình nốt vẽ theo beats × unit */
  private readonly unit: number;
  /** Cấp 4 — y hàng chữ tốc độ / "rit." và y vạch pedal (0 = bài không có) */
  private readonly topRowY: number;
  private readonly pedY: number;
  private readonly spacing: Spacing;
  /** Phách có nốt mang dấu hóa (vạch nhịp lùi thêm) */
  private readonly accAt: Set<number>;
  /** Mép trái dòng kẻ & vị trí nốt đầu tiên */
  private readonly left: number;
  private readonly x0: number;
  /** Bề ngang dành cho nốt (từ x0) của một trang đầy */
  private readonly avail: number;
  /** Ánh xạ của trang đang hiện: x = x0 + (spaceAt(phách) − origin) × scale */
  private origin = 0;
  private scale = 1;
  /** Con trỏ đang vẽ (khóa các chỉ số nốt) — chỉ đụng tới DOM khi con trỏ thật sự đổi nhóm */
  private cursorKey = '';
  private cursorIdx: number[] = [];
  /**
   * Băng chuyền (mode 'scroll'): dải nốt là một <svg> riêng nằm trong khung HTML cắt hai bên; chạy ngang bằng
   * CSS `transform: translate3d()` trên lớp HTML (GPU ghép lớp — không vẽ lại khuông mỗi khung hình, nhẹ cho iPad cũ).
   */
  private strip: { clip: HTMLDivElement; move: HTMLDivElement; svg: SVGSVGElement; x0: number; w: number } | null = null;
  /** Băng chuyền: vạch đỏ đứng ở x0 + lead (nốt vừa đàn còn thấy bên trái — ô nhịp đang chơi nằm ở 1/3 bên trái) */
  private lead = 0;
  /** px màn hình trên mỗi đơn vị viewBox (đo bằng ResizeObserver, không đọc bố cục mỗi khung hình) */
  private px = 0;
  /** Độ dịch hiện tại (đơn vị viewBox) */
  private shift = 0;
  /** Phần lẻ (px) của vị trí khung cắt — cộng vào transform */
  private frac: [number, number] = [0, 0];
  private ro: ResizeObserver | null = null;
  /** (+ 2026-10-09) Màu nhận xét từng nốt (giữ qua lật trang — vẽ lại trang thì tô lại) */
  private review = new Map<number, ReviewMark>();
  /** y hàng chữ nhận xét của từng nốt (phía trên khuông của nốt đó) */
  private tagY = new Map<number, number>();
  /** (+ 2026-10-15) Tâm các đầu nốt đã vẽ (quầng sáng con trỏ) */
  private heads = new Map<number, Array<[number, number]>>();
  private glowLayer: SVGGElement;
  /** (+ 2026-10-15) Chế độ trang + theo nhịp: vạch con trỏ trượt theo thời gian (chỉ đổi transform) */
  private playhead: SVGLineElement | null = null;
  private playheadX = Number.NaN;
  private colors: boolean;

  constructor(
    private readonly tune: Tune,
    opts: StaffOptions = {},
  ) {
    const bpm = beatsPerMeasure(tune);
    const unit = noteUnit(tune);
    const compound = isCompound(tune);
    this.unit = unit;
    const mode = opts.mode ?? 'page';
    // Giãn cách: khuông nhỏ (pxPerBeat ghi rõ) & băng chuyền → tuyến tính; trang → kiểu bản in
    const linear = opts.pxPerBeat !== undefined || mode === 'scroll';
    this.o = {
      clef: opts.clef ?? (tune.hand === 'LH' ? 'bass' : 'treble'),
      names: opts.names ?? true,
      fingers: opts.fingers ?? true,
      mode,
      measuresPerPage: opts.measuresPerPage ?? 4,
      pxPerBeat: opts.pxPerBeat ?? linearPxPerBeat(bpm, unit),
      dimHand: opts.dimHand ?? null,
      colors: opts.colors ?? false,
    };
    this.colors = this.o.colors;
    const used = expressionUsed(tune);
    const dynRow = !!(used.dyn || used.hairpin);
    // Cấp 4: chữ tốc độ / "rit." → một hàng trên cùng; pedal → một hàng dưới cùng
    const T = tune.tempoTerm || [...tune.notes, ...(tune.lh ?? [])].some((n) => n.rit) ? TOP_PAD : 0;
    this.topRowY = T ? 20 : 0;
    const voice = (notes: TimedNote[]) => {
      const groups = beamGroupsIn(notes, bpm, unit, compound).map((g) => g.map((i) => notes[i]));
      return { notes, beams: groups };
    };
    const hasFinger = (ns: TimedNote[]) => this.o.fingers && ns.some((n) => !!n.finger || (n.also ?? []).some((a) => !!a.finger));
    const parts: Array<{ clef: Clef; notes: TimedNote[]; beams: TimedNote[][]; fingersBelow: boolean }> = [];
    if (tune.lh) {
      // Bè tay trái nằm trọn từ Đô giữa trở lên (vd "Lý ngựa ô": Rê4–Fa4) → khóa Sol như bản piano thật, khỏi vạch phụ
      const lhNotes = lhTimeline(tune);
      const lhLow = Math.min(...lhNotes.flatMap(pitchesOf).map((p) => staffStep(p, 'treble')));
      const lhClef: Clef = Number.isFinite(lhLow) && lhLow >= -2 ? 'treble' : 'bass';
      parts.push({ clef: 'treble', ...voice(timeline(tune)), fingersBelow: false });
      parts.push({ clef: lhClef, ...voice(lhNotes), fingersBelow: true });
    } else {
      parts.push({ clef: this.o.clef, ...voice(timeline(tune)), fingersBelow: tune.hand === 'LH' });
    }

    // ---- Giãn cách chung cho mọi khuông (nốt cùng lúc thẳng hàng dọc)
    const total = measureCount(tune);
    const all = parts.flatMap((p) => p.notes);
    const bars = new Set<number>();
    for (let m = 0; m <= total; m++) bars.add(m * bpm);
    this.accAt = new Set(
      all.filter((n) => !n.rest && pitchesOf(n).some((p) => pitchInfo(p).accidental)).map((n) => Math.round(n.start * 1e6) / 1e6),
    );
    const pxQ = pagePxPerQuarter(bpm, unit);
    this.spacing = makeSpacing(
      [...all.map((n) => n.start), ...bars],
      linear ? this.o.pxPerBeat : pxQ * unit,
      this.o.names ? MIN_GAP_NAMES : MIN_GAP,
      (t) => (bars.has(t) ? BAR_PAD : 0) + (this.accAt.has(t) ? ACC_PAD : 0),
      linear ? undefined : (dt) => durationGap(dt * unit, pxQ),
    );
    // Bề ngang trang: đủ cho trang dày nốt nhất (trang thưa được giãn đều ra cho kín — như bản in)
    const per = this.o.measuresPerPage;
    let avail = per * bpm * (linear ? this.o.pxPerBeat : durationGap(unit, pxQ));
    if (this.o.mode === 'page') {
      for (let from = 0; from < total; from += per) {
        const to = Math.min(from + per, total);
        const w = spaceAt(this.spacing, to * bpm) - spaceAt(this.spacing, from * bpm);
        avail = Math.max(avail, (w * per) / (to - from));
      }
    }
    this.avail = avail;
    // ---- Xếp hàng theo chiều dọc (y hướng xuống): [tốc độ] [số ngón TP] khuông [tên nốt] [số ngón TT] [sắc thái] … [pedal]
    let y = T;
    this.staves = [];
    parts.forEach((p, i) => {
      const ext = this.extents(p.clef, p.notes, p.beams);
      const fingers = hasFinger(p.notes);
      let fingerY = 0;
      if (fingers && !p.fingersBelow) {
        fingerY = y + ROW_PAD + FINGER_ASC;
        y = fingerY + 2;
      }
      const bottomY = y + ROW_PAD - ext.top;
      y = bottomY + ext.bottom;
      let nameY = 0;
      if (this.o.names) {
        nameY = y + ROW_PAD + NAME_ASC;
        y = nameY + 5;
      }
      if (fingers && p.fingersBelow) {
        fingerY = y + (this.o.names ? 2 : ROW_PAD) + FINGER_ASC;
        y = fingerY + 3;
      }
      // Sắc thái: khuông kép → một hàng chung giữa hai khuông (như bản piano thật); khuông đơn → dưới cùng
      let dynY = 0;
      if (dynRow && (parts.length === 1 || i === 0)) {
        dynY = y + 4 + 21;
        y = dynY + 8;
      }
      this.staves.push({ clef: p.clef, bottomY, notes: p.notes, beams: p.beams, fingerY, nameY, dynY });
    });
    if (this.staves.length === 2) this.staves[1].dynY = this.staves[0].dynY;
    this.pedY = used.ped ? y + 22 : 0;
    if (used.ped) y = this.pedY + 4;
    this.height = Math.ceil(y + 4);

    this.left = tune.lh ? 18 : 8;
    this.x0 = this.left + 92;

    this.el = document.createElement('div');
    this.el.className = `staff staff-${this.o.mode}${tune.lh ? ' grand' : ''} pulse`;
    const width = this.x0 + avail + 24;
    this.svg = el('svg', {
      viewBox: `0 0 ${width} ${this.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `Khuông nhạc: ${tune.titleVi}`,
    });
    for (const s of this.staves) this.drawFrame(s, width);
    if (tune.lh) {
      // Ngoặc nhọn + vạch nối khuông kép
      const yTop = this.y(this.staves[0], 8);
      const yBot = this.y(this.staves[1], 0);
      this.svg.append(
        el('path', { d: bracePath(this.left - 3, yTop, yBot), class: 'staff-brace' }),
        el('line', { x1: this.left, x2: this.left, y1: yTop, y2: yBot, class: 'staff-bar' }),
      );
    }
    this.content = el('g', { class: 'staff-content' });
    this.glowLayer = el('g', { class: 'staff-glows' });
    this.applyColors();
    if (this.o.mode === 'scroll') {
      this.buildStrip(width);
    } else {
      this.svg.append(this.content);
      this.showPage(0);
      this.el.append(this.svg);
    }
    this.fitCard(width);
  }

  /**
   * (+ 2026-10-15) Thẻ khuông ở màn bài hát (.song-staff) ôm vừa nội dung: đo khung cha (ResizeObserver — không đọc
   * bố cục mỗi khung hình), tính tỉ lệ "meet" rồi đặt đúng bề ngang/cao cho thẻ → không còn khoảng trắng thừa trong thẻ.
   */
  private fitCard(width: number): void {
    if (typeof ResizeObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
    let ro: ResizeObserver | null = null;
    const start = () => {
      const box = this.el.parentElement;
      if (!box) return;
      if (!box.classList.contains('song-staff')) return;
      let last = '';
      const refit = () => {
        if (!this.el.isConnected) return void (ro?.disconnect(), mo?.disconnect(), (ro = null));
        const cs = getComputedStyle(this.el);
        const px = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : Infinity);
        const pad = (st: CSSStyleDeclaration, a: 'Left' | 'Top', b: 'Right' | 'Bottom') => (parseFloat(st[`padding${a}`]) || 0) + (parseFloat(st[`padding${b}`]) || 0);
        // Hàng phụ trong thẻ (vd chú thích nhận xét .rv-row) — cộng thêm chiều cao của nó
        let extra = 0;
        for (const ch of Array.from(this.el.children)) if (!(ch instanceof SVGElement) && !ch.classList.contains('staff-stage')) extra += (ch as HTMLElement).offsetHeight;
        const padX = pad(cs, 'Left', 'Right');
        const padY = pad(cs, 'Top', 'Bottom') + extra;
        const bs = getComputedStyle(box);
        const W = Math.min(box.clientWidth - pad(bs, 'Left', 'Right'), px(cs.maxWidth)) - padX;
        const H = Math.min(box.clientHeight - pad(bs, 'Top', 'Bottom'), px(cs.maxHeight)) - padY;
        if (!(W > 0)) return;
        // (+ 2026-10-16, OWNER duyệt — "bàn phím to hơn khi còn chỗ") Chiều cao thẻ CẦN khi trải hết bề ngang → biến CSS
        // --staff-want trên khung: khung khuông chỉ xin chừng đó, phần dư nhường bàn phím lớn lên (theme.css). Chỉ phụ
        // thuộc bề ngang + nội dung (không phụ thuộc chiều cao khung) → không vòng lặp đo / đặt.
        const want = `${Math.ceil(Math.min(this.height * (W / width) + padY, px(cs.maxHeight)) + pad(bs, 'Top', 'Bottom')) + 1}px`;
        if (box.style.getPropertyValue('--staff-want') !== want) box.style.setProperty('--staff-want', want);
        if (!(H > 0)) return;
        const k = Math.min(W / width, H / this.height);
        const key = `${Math.floor(width * k + padX)}x${Math.floor(this.height * k + padY)}`;
        if (key === last) return;
        last = key;
        const [w, h] = key.split('x');
        this.el.style.width = `${w}px`;
        this.el.style.height = `${h}px`;
      };
      // (+ 2026-10-17) Ghi --staff-want / kích thước thẻ làm KHUNG đang theo dõi đổi cỡ → nếu ghi ngay trong lời gọi của
      // ResizeObserver, WebKit báo "ResizeObserver loop completed with undelivered notifications" → dời sang khung hình sau.
      let rafId = 0;
      ro = new ResizeObserver(() => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          refit();
        });
      });
      ro.observe(box);
      const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(refit) : null;
      mo?.observe(this.el, { childList: true });
    };
    requestAnimationFrame(start);
  }

  /**
   * Phần nhô ra trên / dưới khuông (y tương đối vạch dưới cùng, hướng xuống) của cả bè: đầu nốt, vạch phụ, đuôi nốt,
   * gạch nối, chấm ngắt tiếng, dấu luyến. Đồng thời ghi hướng đuôi nốt (stemUpOf) dùng lúc vẽ.
   */
  private extents(clef: Clef, notes: TimedNote[], beams: TimedNote[][]): { top: number; bottom: number } {
    const yr = (step: number) => (-step * GAP) / 2;
    const stepsOf = (n: TimedNote) => pitchesOf(n).map((p) => staffStep(p, clef));
    let top = -4 * GAP;
    let bottom = 0;
    for (const g of beams) {
      const steps = g.map(stepsOf);
      const up = groupStemUp(steps.flat());
      const levels = Math.max(...g.map((n) => flagCount(n.beats * this.unit)));
      const len = BEAM_STEM + (levels - 1) * BEAM_GAP * 0.6;
      if (up) top = Math.min(top, Math.min(...steps.map((st) => yr(Math.max(...st)))) - len - GAP / 2);
      else bottom = Math.max(bottom, Math.max(...steps.map((st) => yr(Math.min(...st)))) + len + GAP / 2);
      for (const n of g) this.stemUpOf.set(n.index, up);
    }
    for (const n of notes) {
      if (n.rest) continue;
      const st = stepsOf(n);
      const lo = Math.min(...st);
      const hi = Math.max(...st);
      top = Math.min(top, yr(hi) - HEAD_RY - 1);
      bottom = Math.max(bottom, yr(lo) + HEAD_RY + 1);
      if (!this.stemUpOf.has(n.index)) this.stemUpOf.set(n.index, stemUp((lo + hi) / 2));
      const up = this.stemUpOf.get(n.index)!;
      const shape = noteShape(n.beats * this.unit);
      if (shape.base < 4 && !beams.some((g) => g.includes(n))) {
        const flags = flagCount(n.beats * this.unit);
        const len = STEM + Math.max(0, flags - 1) * 4;
        if (up) top = Math.min(top, yr(hi) - len);
        else bottom = Math.max(bottom, yr(lo) + len);
      }
      if (n.stac) {
        if (up) bottom = Math.max(bottom, yr(lo - 3) + 4);
        else top = Math.min(top, yr(hi + 3) - 4);
      }
    }
    const byIndex = new Map(notes.map((n) => [n.index, n]));
    for (const [a, b] of slurSpans(notes)) {
      const span = notes.filter((n) => !n.rest && n.index >= a && n.index <= b);
      if (!span.length || !byIndex.has(a)) continue;
      const below = span.every((n) => this.stemUpOf.get(n.index) ?? true);
      const ys = span.map((n) => {
        const st = stepsOf(n);
        return yr(below ? Math.min(...st) : Math.max(...st));
      });
      // Đỉnh đường cong bậc hai ≈ nửa đường tới điểm điều khiển (+ nửa độ dày) — cùng công thức với drawSlurs
      const reach = 13 + this.slurBulge(byIndex.get(a)!, byIndex.get(b) ?? span[span.length - 1]) / 2 + 4;
      if (below) bottom = Math.max(bottom, Math.max(...ys) + reach);
      else top = Math.min(top, Math.min(...ys) - reach);
    }
    return { top, bottom };
  }

  /** Độ cong dấu luyến (đơn vị viewBox) theo bề ngang thật trên trang của nó — dùng chung khi xếp hàng và khi vẽ. */
  private slurBulge(na: TimedNote, nb: TimedNote): number {
    const dx = (spaceAt(this.spacing, nb.start) - spaceAt(this.spacing, na.start)) * this.pageScaleAt(na.measure) - 4;
    return Math.min(SLUR_MAX, 10 + Math.max(0, dx) * 0.05);
  }

  /** Hệ số giãn của trang chứa ô nhịp `m` (băng chuyền: 1) — như showPage. */
  private pageScaleAt(m: number): number {
    if (this.o.mode !== 'page') return 1;
    const per = this.o.measuresPerPage;
    const bpm = beatsPerMeasure(this.tune);
    const from = Math.floor(m / per) * per;
    const to = Math.min(from + per, measureCount(this.tune));
    const w = spaceAt(this.spacing, to * bpm) - spaceAt(this.spacing, from * bpm);
    return w > 0 ? (this.avail * Math.max(1, to - from)) / per / w : 1;
  }

  /**
   * Băng chuyền: [khung khuông (svg tĩnh)] + [khung cắt HTML ▸ lớp chạy (will-change: transform) ▸ svg dải nốt]
   * + [svg vạch đỏ ở trên cùng]. Ba lớp cùng hệ toạ độ viewBox (meet, căn giữa) → hình y hệt bản một-svg cũ.
   * Cắt hai bên: nốt chỉ hiện giữa (mép khóa nhạc) và mép phải khuông. Vạch đỏ đứng lùi vào trong (`lead`):
   * nốt vừa đàn còn thấy bên trái, ô nhịp đang chơi nằm ở 1/3 bên trái màn.
   */
  private buildStrip(width: number): void {
    const stage = document.createElement('div');
    stage.className = 'staff-stage';
    this.drawAll();
    const total = beatsPerMeasure(this.tune) * measureCount(this.tune);
    const x0 = this.x0 - 16;
    this.lead = Math.round(Math.min(this.avail * 0.18, 4 * GAP * 4));
    // Dải đủ dài cho cả bài (+ chỗ vạch kết, dấu luyến cuối, số ngón) và chỗ trống trước nốt đầu (vạch đỏ lùi vào)
    const w = this.x0 + spaceAt(this.spacing, total) + 60 - x0;
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
    const xp = this.x0 + this.lead;
    top.append(el('line', { x1: xp, x2: xp, ...this.playheadSpan(), class: 'staff-playhead' }));
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
      const tp = oy;
      this.frac = [left - Math.round(left), tp - Math.round(tp)];
      const cs = this.strip.clip.style;
      cs.left = `${Math.round(left)}px`;
      cs.top = `${Math.round(tp)}px`;
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
    this.shift = -this.lead;
    this.applyShift();
  }

  /** Chiều dọc của vạch con trỏ: từ trên khuông đầu tới dưới khuông cuối (thêm một khoảng vạch mỗi đầu). */
  private playheadSpan(): { y1: number; y2: number } {
    return { y1: this.y(this.staves[0], 8) - GAP * 1.5, y2: this.y(this.staves[this.staves.length - 1], 0) + GAP * 1.5 };
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
      this.svg.append(el('line', { x1: this.left, x2: width - 8, y1: y, y2: y, class: 'staff-line' }));
    }
    // Khóa nhạc: hình vẽ tô kín (engrave.clefPath) — gốc = vạch dưới cùng
    const cx = s.clef === 'treble' ? this.left + 24 : this.left + 9;
    this.svg.append(
      el('path', { class: `staff-clef staff-${s.clef}`, transform: `translate(${cx} ${s.bottomY})`, d: clefPath(s.clef, GAP) }),
    );
    const [top, bottom] = this.tune.timeSignature.split('/');
    const tx = this.left + 68;
    const ts = el('text', { x: tx, y: this.y(s, 6) + 10, class: 'staff-time' });
    ts.textContent = top;
    const ts2 = el('text', { x: tx, y: this.y(s, 2) + 10, class: 'staff-time' });
    ts2.textContent = bottom;
    this.svg.append(ts, ts2);
  }

  /** Vị trí x của một phách trên trang đang hiện (băng chuyền: trên dải nhạc, trước khi dịch). */
  private xOf(beat: number): number {
    return this.x0 + (spaceAt(this.spacing, beat) - this.origin) * this.scale;
  }

  /** Vạch nhịp trước phách `beat` (nốt đầu ô có dấu hóa → lùi thêm, dấu hóa không đè vạch nhịp). */
  private barX(beat: number): number {
    return this.xOf(beat) - (this.accAt.has(Math.round(beat * 1e6) / 1e6) ? BAR_DX_ACC : BAR_DX);
  }

  /** (+ 2026-10-15) Vị trí x (viewBox) của phách — trang đang hiện / dải băng chuyền. Kiểm thử: thời gian → x đơn điệu. */
  xAtBeat(beat: number): number {
    return this.xOf(beat);
  }

  private drawRange(from: number, to: number): void {
    const bpm = beatsPerMeasure(this.tune);
    this.glowLayer = el('g', { class: 'staff-glows' });
    this.content.append(this.glowLayer);
    for (let m = from; m <= to; m++) {
      if (m === 0 && this.o.mode === 'page') continue;
      if (m === measureCount(this.tune)) continue; // vạch kết vẽ riêng
      const x = this.barX(m * bpm);
      for (const s of this.staves) {
        this.content.append(el('line', { x1: x, x2: x, y1: this.y(s, 8), y2: this.y(s, 0), class: 'staff-bar' }));
      }
      // Số ô nhịp nhỏ: đầu mỗi trang (trang) / mỗi ô (băng chuyền)
      if (m > 0 && (this.o.mode === 'scroll' || m === from)) {
        const t = el('text', { x: m === from && this.o.mode === 'page' ? this.x0 - 30 : x, y: this.y(this.staves[0], 8) - 7, class: 'staff-barno' });
        t.textContent = String(m + 1);
        this.content.append(t);
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
        if (n.dyn && s.dynY && !dynAt.has(key)) {
          dynAt.add(key);
          const t = el('text', { x: x - 2, y: s.dynY, class: 'staff-dyn' });
          t.textContent = n.dyn;
          this.content.append(t);
        }
      }
      this.content.append(beamLayer);
      this.drawSlurs(s, from, to);
    }
    this.drawLevel4(from, to);
    if (to >= measureCount(this.tune)) {
      const end = this.xOf(measureCount(this.tune) * bpm) - 14;
      const top = this.y(this.staves[0], 8);
      const bottom = this.y(this.staves[this.staves.length - 1], 0);
      this.content.append(
        el('line', { x1: end - 4, x2: end - 4, y1: top, y2: bottom, class: 'staff-bar' }),
        el('line', { x1: end + 3, x2: end + 3, y1: top, y2: bottom, class: 'staff-bar end' }),
      );
    }
  }

  /**
   * Một nhóm gạch nối: hướng đuôi chung (nốt xa vạch giữa nhất quyết định), gạch hơi nghiêng theo giai điệu
   * (tối đa nửa khoảng vạch; nốt giữa vượt ra ngoài → gạch nằm ngang), mọi đuôi đủ dài.
   */
  private drawBeam(s: Stave, g: TimedNote[], stems: Map<number, StemInfo>, layer: SVGGElement): void {
    const steps = g.map((n) => pitchesOf(n).map((p) => staffStep(p, s.clef)));
    const up = this.stemUpOf.get(g[0].index) ?? groupStemUp(steps.flat());
    const sx = g.map((n) => this.xOf(n.start) + (up ? STEM_DX : -STEM_DX));
    const levels = Math.max(...g.map((n) => flagCount(n.beats * this.unit)));
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

    const u = this.unit;
    for (const seg of beamSegments(u === 1 ? g : g.map((n) => ({ start: n.start * u, beats: n.beats * u })))) {
      const off = (seg.level - 1) * BEAM_GAP * (up ? 1 : -1);
      let xa = sx[seg.from] - 1.3;
      let xb = sx[seg.to] + 1.3;
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
    const shape = noteShape(n.beats * this.unit);
    // Lặng cả ô nhịp: dấu lặng tròn ở giữa ô (như bản in), mọi nhịp
    const wholeBar = Math.abs(n.beats - bpm) < 1e-6 && Math.abs(n.start / bpm - Math.round(n.start / bpm)) < 1e-6;
    if (wholeBar || shape.base >= 4) {
      const a = n.start === 0 ? this.x0 - 14 : this.barX(n.start);
      const cx = wholeBar ? (a + this.barX(n.start + bpm)) / 2 : x;
      g.append(el('rect', { x: cx - 9, y: this.y(s, 6), width: 18, height: 7, class: 'staff-rest' }));
      return;
    }
    const y4 = this.y(s, 4);
    const y5 = this.y(s, 5);
    if (shape.base >= 2) {
      g.append(el('rect', { x: x - 9, y: y4 - 7, width: 18, height: 7, class: 'staff-rest' }));
    } else if (shape.base >= 1) {
      g.append(el('path', { d: `M${x - 3},${y4 - 18} l7,9 l-7,7 l7,9 c-6,-3 -10,1 -5,6`, class: 'staff-rest-q' }));
    } else {
      // Lặng móc đơn / móc kép: chấm tròn + nét chéo (mỗi móc thêm một chấm)
      const flags = flagCount(n.beats * this.unit);
      const top = y5 - 2;
      const bottom = y5 + 20 + (flags - 1) * 9;
      const slope = 7 / (bottom - top); // nét chéo đi xuống sang trái
      const rx = x + 6; // đỉnh nét chéo (cả hình nằm giữa vị trí x)
      const parts = [`M${rx},${top} L${rx - slope * (bottom - top)},${bottom}`];
      for (let k = 0; k < flags; k++) {
        const yy = top + k * 9;
        const xe = rx - slope * (yy - top);
        g.append(el('circle', { cx: xe - 7, cy: yy + 1.5, r: 3.4, class: 'staff-rest' }));
        parts.push(`M${xe - 7},${yy + 3} Q${xe - 3},${yy + 5} ${xe},${yy}`);
      }
      g.append(el('path', { d: parts.join(' '), class: 'staff-rest-q' }));
    }
    for (let k = 0; k < shape.dots; k++) g.append(el('circle', { cx: x + 13 + k * 7, cy: y5, r: 2.7, class: 'staff-dot' }));
  }

  private drawNote(s: Stave, n: TimedNote, x: number, beam?: StemInfo): SVGGElement {
    const g = el('g', { class: this.o.dimHand && n.hand === this.o.dimHand ? 'staff-note dim' : 'staff-note' });
    this.noteEls.set(n.index, g);
    if (n.rest) {
      this.drawRest(s, n, x, g);
      return g;
    }
    // Chữ nhận xét (tên nốt nhầm / ← →) nằm ở hàng số ngón (số ngón của nốt đó ẩn đi) — không chồng lên nhau
    this.tagY.set(n.index, s.fingerY && s.fingerY < s.bottomY ? s.fingerY : this.y(s, 8) - 12);
    const pitches = pitchesOf(n);
    const steps = pitches.map((p) => staffStep(p, s.clef));
    const shape = noteShape(n.beats * this.unit);
    const hollow = shape.base >= 2;
    const centers: Array<[number, number]> = [];
    for (const [i, p] of pitches.entries()) {
      const step = steps[i];
      const y = this.y(s, step);
      for (const ls of ledgerSteps(step)) {
        g.append(el('line', { x1: x - 14.5, x2: x + 14.5, y1: this.y(s, ls), y2: this.y(s, ls), class: 'staff-ledger' }));
      }
      const L = noteLetter(p);
      g.append(
        el('ellipse', {
          cx: x,
          cy: y,
          rx: HEAD_RX,
          ry: HEAD_RY,
          transform: `rotate(-20 ${x} ${y})`,
          class: `${hollow ? 'staff-head hollow' : 'staff-head'}${L ? ` nc-${L}` : ''}`,
          // Kiểm thử tự động (scripts/e2e.mjs) đọc nốt trên khuông — không ảnh hưởng hiển thị
          'data-e2e-pitch': p,
        }),
      );
      centers.push([x, y]);
      const acc = pitchInfo(p).accidental;
      if (acc) g.append(el('path', { d: accidentalPath(acc === '#' ? '#' : 'b', x - 19, y, GAP), class: 'staff-acc' }));
      for (let k = 0; k < shape.dots; k++) {
        g.append(el('circle', { cx: x + 15 + k * 7, cy: step % 2 === 0 ? y - 4 : y, r: 2.7, class: 'staff-dot' }));
      }
    }
    this.heads.set(n.index, centers);
    const lo = Math.min(...steps);
    const hi = Math.max(...steps);
    const up = beam ? beam.up : (this.stemUpOf.get(n.index) ?? stemUp((lo + hi) / 2));
    if (n.stac) {
      // v4: chấm ngắt tiếng — phía đầu nốt (ngược phía đuôi nốt), tránh nằm đè lên dòng kẻ
      const step = up ? lo - 2 : hi + 2;
      const yy = this.y(s, step % 2 === 0 ? step + (up ? -1 : 1) : step);
      g.append(el('circle', { cx: x, cy: yy, r: 3.8, class: 'staff-stac' }));
    }
    if (shape.base < 4) {
      const sx = up ? x + STEM_DX : x - STEM_DX;
      const y1 = up ? this.y(s, lo) : this.y(s, hi);
      const flags = beam ? 0 : flagCount(n.beats * this.unit);
      // Nốt móc kép đứng riêng: đuôi dài thêm cho đủ chỗ hai móc
      const y2 = beam ? beam.tipY : up ? this.y(s, hi) - STEM - (flags - 1) * 4 : this.y(s, lo) + STEM + (flags - 1) * 4;
      g.append(el('line', { x1: sx, x2: sx, y1, y2, class: 'staff-stem' }));
      for (let k = 0; k < flags; k++) {
        const fy = up ? y2 + k * 10 : y2 - k * 10;
        g.append(
          el('path', {
            d: up ? `M${sx},${fy} c1,7 11,9 10,22 c3,-9 -4,-14 -10,-17 z` : `M${sx},${fy} c1,-7 11,-9 10,-22 c3,9 -4,14 -10,17 z`,
            class: 'staff-flag',
          }),
        );
      }
    }
    if (this.o.fingers && s.fingerY) {
      const fs = [n.finger, ...(n.also ?? []).map((a) => a.finger)].filter((f): f is number => !!f);
      if (fs.length) {
        const t = el('text', { x, y: s.fingerY, class: `staff-finger${n.hand === 'LH' ? ' lh' : ''}` });
        t.textContent = fs.join('');
        g.append(t);
      }
    }
    if (this.o.names && s.nameY) {
      const L = noteLetter(n.pitch);
      const t = el('text', { x, y: s.nameY, class: `staff-name${L ? ` nc-${L}` : ''}` });
      t.textContent = viName(n.pitch!).replace(' thăng', '♯').replace(' giáng', '♭');
      g.append(t);
    }
    this.drawReview(n.index, g);
    return g;
  }

  /** Tô màu nhận xét cho một nốt đã vẽ (và chữ nhỏ phía trên khuông: tên nốt nhầm / ← sớm / → muộn). */
  private drawReview(index: number, g: SVGGElement): void {
    g.classList.remove(...RV_CLASSES);
    g.querySelectorAll('.staff-rv-tag').forEach((t) => t.remove());
    g.classList.remove('rv-tagged');
    const m = this.review.get(index);
    if (!m) return;
    g.classList.add(`rv-${m.kind}`);
    if (!m.tag) return;
    g.classList.add('rv-tagged');
    const heads = this.heads.get(index);
    if (!heads?.length) return;
    const cx = heads[0][0];
    const top = Math.min(...heads.map((h) => h[1]));
    const t = el('text', { x: cx, y: Math.min(this.tagY.get(index) ?? top - 16, top - 16), class: `staff-rv-tag rv-${m.kind}` });
    t.textContent = m.tag;
    g.append(t);
  }

  /** (+ 2026-10-09) Màu nhận xét từng nốt sau lượt chơi (null = bỏ). Giữ qua lật trang. Đang nhận xét → tắt nốt màu. */
  setReview(marks: ReadonlyMap<number, ReviewMark> | null): void {
    this.review = new Map(marks ?? []);
    this.noteEls.forEach((g, i) => this.drawReview(i, g));
    this.applyColors();
  }

  /** (+ 2026-10-15) 🎨 Nốt màu bật/tắt (chỉ đổi một lớp CSS — không vẽ lại). */
  setColors(on: boolean): void {
    this.colors = on;
    this.applyColors();
  }

  /** Nhận xét kiểu thầy giáo (xanh/đỏ/xám/cam) thay màu tên nốt — chú giải không đổi, màu không lẫn nhau. */
  private applyColors(): void {
    this.el.classList.toggle('ncol', this.colors && this.review.size === 0);
  }

  /** Số trang (chế độ trang); băng chuyền = 1 */
  pageCount(): number {
    return this.o.mode === 'page' ? Math.max(1, Math.ceil(measureCount(this.tune) / this.o.measuresPerPage)) : 1;
  }

  /** Trang đang hiện (từ 0) */
  currentPage(): number {
    return Math.max(0, this.page);
  }

  /** Lật tới trang chứa ô nhịp `m` (chế độ trang) */
  showMeasure(m: number): void {
    if (this.o.mode !== 'page') return;
    this.showPage(Math.max(0, Math.min(this.pageCount() - 1, Math.floor(m / this.o.measuresPerPage))));
  }

  /** Lật trang trước / sau (chế độ trang). Trả về trang mới. */
  turnPage(delta: number): number {
    if (this.o.mode === 'page') this.showPage(Math.max(0, Math.min(this.pageCount() - 1, this.currentPage() + delta)));
    return this.currentPage();
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
      // Cùng quy tắc với extents(): mọi đuôi hướng lên → dấu luyến nằm dưới (xét cả câu, kể cả phần ở trang khác)
      const whole = s.notes.filter((n) => !n.rest && n.index >= a && n.index <= b);
      const below = whole.every((n) => this.stemUpOf.get(n.index) ?? true);
      const headY = (n: TimedNote) => {
        const st = pitchesOf(n).map((p) => staffStep(p, s.clef));
        return this.y(s, below ? Math.min(...st) : Math.max(...st));
      };
      const aIn = na.measure >= from;
      const bIn = nb.measure < to;
      const x1 = aIn ? this.xOf(na.start) + 2 : this.x0 - 8;
      const x2 = bIn ? this.xOf(nb.start) - 2 : this.barX(to * bpm) - 8;
      if (x2 - x1 < 8) continue;
      const off = below ? 13 : -13;
      const y1 = (aIn ? headY(na) : headY(span[0])) + off;
      const y2 = (bIn ? headY(nb) : headY(span[span.length - 1])) + off;
      const ys = span.map(headY);
      const bulge = Math.min(SLUR_MAX, 10 + Math.max(0, x2 - x1) * 0.05);
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

  /** Cấp 4 — chữ tốc độ, "rit.", nêm to dần / nhỏ dần, pedal của đoạn ô nhịp [from, to). */
  private drawLevel4(from: number, to: number): void {
    const bpm = beatsPerMeasure(this.tune);
    if (this.topRowY) {
      if (from === 0 && this.tune.tempoTerm) {
        const t = el('text', { x: this.x0 - 14, y: this.topRowY, class: 'staff-tempo' });
        t.textContent = this.tune.tempoTerm;
        this.content.append(t);
      }
      const ritAt = new Set<number>();
      for (const s of this.staves) {
        for (const n of s.notes) {
          if (!n.rit || n.measure < from || n.measure >= to) continue;
          const key = Math.round(n.start * 1000);
          if (ritAt.has(key)) continue;
          ritAt.add(key);
          const t = el('text', { x: this.xOf(n.start) - 6, y: this.topRowY, class: 'staff-rit' });
          t.textContent = 'rit.';
          this.content.append(t);
        }
      }
    }
    this.drawHairpins(from, to, bpm);
    if (this.pedY) for (const s of this.staves) this.drawPedals(s, from, to, bpm);
  }

  /**
   * Cấp 4 — Nêm to dần (<) / nhỏ dần (>) ở hàng sắc thái của bè chính, từ nốt đầu tới hết nốt cuối.
   * Nêm vắt qua trang: vẽ phần trong trang, độ mở theo tỉ lệ thời gian (nửa sau trang sau mở tiếp).
   */
  private drawHairpins(from: number, to: number, bpm: number): void {
    const s = this.staves[0];
    if (!s.dynY) return;
    const by = new Map(s.notes.map((n) => [n.index, n]));
    for (const hp of hairpinSpans(s.notes)) {
      const na = by.get(hp.from)!;
      const nb = by.get(hp.to)!;
      if (nb.measure < from || na.measure >= to) continue;
      const A = na.start;
      const B = nb.start + nb.beats;
      const aIn = na.measure >= from;
      const bIn = nb.measure < to;
      const x1 = aIn ? this.xOf(A) + (na.dyn ? 22 : -4) : this.x0 - 8;
      const x2 = bIn ? Math.max(this.xOf(nb.start) + 12, this.xOf(B) - 22) : this.barX(to * bpm) - 8;
      if (x2 - x1 < 8) continue;
      const open = (beat: number) => {
        const f = B > A ? Math.min(1, Math.max(0, (beat - A) / (B - A))) : 1;
        return hp.kind === 'cresc' ? f : 1 - f;
      };
      const H = 8;
      const c = s.dynY - 10;
      const h1 = H * open(aIn ? A : from * bpm);
      const h2 = H * open(bIn ? B : to * bpm);
      this.content.append(
        el('path', {
          d: `M${x1},${c - h1} L${x2},${c - h2} M${x1},${c + h1} L${x2},${c + h2}`,
          class: `staff-hairpin ${hp.kind}`,
        }),
      );
    }
  }

  /**
   * Cấp 4 — Pedal (kiểu móc vuông): "Ped." ở nốt đạp, vạch ngang dọc theo đáy khuông thấp nhất, khấc ∧ ở mỗi lần thay pedal,
   * móc đứng ở cuối nốt nhả. Vắt qua trang: vẽ tới mép trang / từ mép trang (không chữ, không móc).
   */
  private drawPedals(s: Stave, from: number, to: number, bpm: number): void {
    const by = new Map(s.notes.map((n) => [n.index, n]));
    const y = this.pedY;
    for (const sp of pedalSpans(s.notes)) {
      const na = by.get(sp.start)!;
      const nb = by.get(sp.end)!;
      if (nb.measure < from || na.measure >= to) continue;
      const aIn = na.measure >= from;
      const bIn = nb.measure < to;
      const x1 = aIn ? this.xOf(na.start) - 8 : this.x0 - 10;
      const x2 = bIn ? Math.max(this.xOf(nb.start) + 10, this.xOf(nb.start + nb.beats) - 18) : this.barX(to * bpm);
      let d = `M${x1},${y}`;
      for (const ci of sp.changes) {
        const nc = by.get(ci)!;
        if (nc.measure < from || nc.measure >= to) continue;
        const xc = this.xOf(nc.start);
        d += ` L${xc - 6},${y} L${xc},${y - 11} L${xc + 6},${y}`;
      }
      d += ` L${x2},${y}`;
      if (bIn) d += ` L${x2},${y - 13}`;
      this.content.append(el('path', { d, class: 'staff-ped-line' }));
      if (aIn) {
        const t = el('text', { x: x1, y: y - 4, class: 'staff-ped' });
        t.textContent = 'Ped.';
        this.content.append(t);
      }
    }
  }

  private clear(): void {
    this.cursorKey = '';
    this.content.replaceChildren();
    this.noteEls.clear();
    this.tagY.clear();
    this.heads.clear();
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
    // Vẽ lại trang → con trỏ (quầng sáng) vẽ lại theo nhóm nốt đang chờ
    if (this.cursorIdx.length) this.paintCursor(this.cursorIdx);
  }

  private measureOf(index: number): number | undefined {
    for (const s of this.staves) {
      const n = s.notes.find((x) => x.index === index);
      if (n) return n.measure;
    }
    return undefined;
  }

  /** Quầng sáng sau đầu các nốt đang tới (một lớp riêng dưới nốt — chỉ đổi khi con trỏ sang nhóm khác). */
  private paintCursor(idx: number[]): void {
    this.noteEls.forEach((g) => g.classList.remove('now'));
    const glows: SVGEllipseElement[] = [];
    for (const i of idx) {
      this.noteEls.get(i)?.classList.add('now');
      for (const [x, y] of this.heads.get(i) ?? []) {
        glows.push(el('ellipse', { cx: x, cy: y, rx: HEAD_RX + 7, ry: HEAD_RY + 7, class: 'staff-glow' }));
      }
    }
    this.glowLayer.replaceChildren(...glows);
  }

  /** Đưa (các) nốt lên màn — lật trang nếu cần — và đánh dấu "đang tới". */
  setCursor(index: number | number[]): void {
    const idx = Array.isArray(index) ? index : [index];
    const m = idx.length ? this.measureOf(idx[0]) : undefined;
    if (m === undefined) return;
    this.cursorIdx = idx;
    if (this.o.mode === 'page') this.showPage(Math.floor(m / this.o.measuresPerPage));
    // Gọi mỗi khung hình (theo nhịp / xem mẫu) → chỉ đổi lớp CSS khi con trỏ sang nhóm nốt khác
    const key = idx.join(',');
    if (key === this.cursorKey) return;
    this.cursorKey = key;
    this.paintCursor(idx);
  }

  /**
   * Theo nhịp: đặt vị trí theo phách hiện tại (gọi mỗi khung hình; phách đã làm mượt — music/playhead.ts GlideClock).
   * Băng chuyền: dải nốt trôi về vạch đỏ (chỉ đổi transform của lớp HTML). Trang: lật trang khi sang trang mới
   * (cùng dung sai 0,05 phách với con trỏ nốt — không lật qua lật lại) + vạch con trỏ trượt (chỉ đổi transform).
   */
  setTime(beat: number): void {
    if (this.el.classList.contains('pulse')) this.el.classList.replace('pulse', 'gliding');
    if (this.o.mode === 'scroll') {
      this.shift = spaceAt(this.spacing, beat) - this.lead;
      this.applyShift();
      return;
    }
    const bpm = beatsPerMeasure(this.tune);
    const total = bpm * measureCount(this.tune);
    this.showPage(Math.min(this.pageCount() - 1, Math.floor((Math.max(0, beat) + 0.05) / bpm / this.o.measuresPerPage)));
    if (!this.playhead) {
      this.playhead = el('line', { x1: 0, x2: 0, ...this.playheadSpan(), class: 'staff-playhead glide' });
      this.svg.append(this.playhead);
    }
    const done = beat > total + 0.25;
    this.playhead.style.visibility = done ? 'hidden' : '';
    if (done) return;
    const x = Math.round(Math.max(this.x0 - 18, this.xOf(Math.max(0, beat))) * 10) / 10;
    if (x === this.playheadX) return;
    this.playheadX = x;
    this.playhead.setAttribute('transform', `translate(${x} 0)`);
  }

  mark(index: number, m: NoteMark): void {
    const g = this.noteEls.get(index);
    if (!g) return;
    this.cursorKey = '';
    g.classList.toggle('now', m === 'now');
    g.classList.toggle('hit', m === 'hit');
    g.classList.toggle('miss', m === 'miss');
    g.classList.toggle('parent', m === 'parent');
  }

  clearMarks(): void {
    this.cursorKey = '';
    this.noteEls.forEach((g) => g.classList.remove('now', 'hit', 'miss', 'parent'));
    this.glowLayer.replaceChildren();
  }
}
