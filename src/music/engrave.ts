/**
 * Quy tắc "khắc bản" (ghi nhạc như sách in) — hàm thuần, có test:
 * - Hình nốt theo trường độ (tròn/trắng/đen/móc đơn/móc kép, chấm dôi).
 * - Gạch nối (beam): gom các nốt móc đơn/móc kép liền nhau trong cùng một phách; dấu lặng cắt gạch nối;
 *   nhịp 4/4: bốn móc đơn trong nửa ô (phách 1–2 hoặc 3–4) nối chung; nhịp 3/4: các cặp móc đơn trong ô nối chung.
 * - Giãn cách theo trường độ, có khoảng tối thiểu giữa hai nốt (móc kép không dính nhau).
 */

export interface NoteShape {
  /** Trường độ gốc (không tính chấm): 4 tròn, 2 trắng, 1 đen, 0.5 móc đơn, 0.25 móc kép, 0.125 móc ba */
  base: number;
  dots: 0 | 1 | 2;
}

const BASES = [4, 2, 1, 0.5, 0.25, 0.125];
const EPS = 1e-6;

export function noteShape(beats: number): NoteShape {
  for (const b of BASES) {
    if (Math.abs(beats - b) < EPS) return { base: b, dots: 0 };
    if (Math.abs(beats - b * 1.5) < EPS) return { base: b, dots: 1 };
    if (Math.abs(beats - b * 1.75) < EPS) return { base: b, dots: 2 };
  }
  // Trường độ lạ (vd 5 phách): lấy hình nốt lớn nhất không vượt quá
  return { base: BASES.find((b) => b <= beats + EPS) ?? 0.125, dots: 0 };
}

/** Số móc / gạch nối: móc đơn 1, móc kép 2, móc ba 3; nốt đen trở lên 0. */
export function flagCount(beats: number): number {
  const b = noteShape(beats).base;
  return b >= 1 ? 0 : Math.round(Math.log2(1 / b));
}

export interface BeamNote {
  start: number;
  beats: number;
  rest?: boolean;
}

/**
 * Nhóm gạch nối của MỘT bè: trả về các nhóm (≥ 2 nốt) chỉ số trong mảng `notes` (theo thứ tự thời gian).
 * Nốt đứng một mình giữ móc (không có trong kết quả).
 * `start`/`beats` tính theo NỐT ĐEN. Cấp 4 — `compoundGroup` (nhịp ghép, vd 6/8 → 1.5 = đen chấm):
 * gom các nốt có móc liền nhau trong cùng một nhịp lớn (3 móc đơn); bỏ qua thì như cũ (2/4, 3/4, 4/4).
 */
export function beamGroups(notes: BeamNote[], beatsPerMeasure: number, compoundGroup?: number): number[][] {
  // 1) Theo phách: nốt có móc, liền nhau, bắt đầu trong cùng một phách (nhịp ghép: cùng một nhịp lớn)
  const pulse = compoundGroup && compoundGroup > 0 ? compoundGroup : 1;
  const byBeat: Array<{ beat: number; idx: number[] }> = [];
  let cur: { beat: number; idx: number[] } | null = null;
  const flush = () => {
    if (cur && cur.idx.length) byBeat.push(cur);
    cur = null;
  };
  notes.forEach((n, i) => {
    if (n.rest || flagCount(n.beats) === 0) return flush();
    const beat = Math.floor(n.start / pulse + EPS);
    if (cur && cur.beat !== beat) flush();
    if (!cur) cur = { beat, idx: [] };
    cur.idx.push(i);
  });
  flush();
  if (pulse !== 1) return byBeat.map((g) => g.idx).filter((g) => g.length >= 2);

  // 2) Nối chung các phách "hai móc đơn tròn phách" liền nhau (4/4: trong nửa ô; 3/4: trong cả ô)
  const plainPair = (g: { beat: number; idx: number[] }) =>
    g.idx.length === 2 &&
    g.idx.every((i) => Math.abs(notes[i].beats - 0.5) < EPS) &&
    Math.abs(notes[g.idx[0]].start - g.beat) < EPS;
  const span = (beat: number): number | null => {
    const inBar = ((beat % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
    const bar = Math.floor(beat / beatsPerMeasure + EPS);
    if (beatsPerMeasure === 4) return bar * 2 + Math.floor(inBar / 2);
    if (beatsPerMeasure === 3) return bar;
    return null; // 2/4 (dân ca): mỗi phách một nhóm như bản ký âm gốc
  };
  const out: number[][] = [];
  for (let k = 0; k < byBeat.length; k++) {
    const g = byBeat[k];
    const prev = byBeat[k - 1];
    const last = out[out.length - 1];
    const merge =
      prev &&
      last &&
      plainPair(g) &&
      plainPair(prev) &&
      prev.beat === g.beat - 1 &&
      span(g.beat) !== null &&
      span(g.beat) === span(prev.beat) &&
      last[last.length - 1] === prev.idx[prev.idx.length - 1];
    if (merge) last.push(...g.idx);
    else out.push([...g.idx]);
  }
  return out.filter((g) => g.length >= 2);
}

/**
 * Cấp 4 — Gạch nối cho bè tính phách theo `unit` nốt đen (x/4: 1; x/8: 0.5 — phách = móc đơn): đổi sang nốt đen rồi
 * gọi beamGroups. `compound` (6/8, 9/8, 12/8) → nhóm theo đen chấm. unit = 1 và không ghép → y hệt beamGroups(notes, bpm).
 */
export function beamGroupsIn(notes: BeamNote[], beatsPerMeasure: number, unit = 1, compound = false): number[][] {
  const q = unit === 1 ? notes : notes.map((n) => ({ start: n.start * unit, beats: n.beats * unit, rest: n.rest }));
  return beamGroups(q, beatsPerMeasure * unit, compound ? 1.5 : undefined);
}

export interface BeamSegment {
  /** 1 = gạch chính, 2 = gạch thứ hai (móc kép), … */
  level: number;
  /** Chỉ số trong nhóm */
  from: number;
  to: number;
  /** Gạch cụt (một nốt): -1 chĩa trái, 1 chĩa phải */
  stub?: -1 | 1;
}

/** Các đoạn gạch nối của một nhóm: gạch chính suốt nhóm; gạch phụ nối các nốt ngắn liền nhau, nốt lẻ có gạch cụt. */
export function beamSegments(group: BeamNote[]): BeamSegment[] {
  const levels = group.map((n) => flagCount(n.beats));
  const out: BeamSegment[] = [{ level: 1, from: 0, to: group.length - 1 }];
  const max = Math.max(...levels);
  for (let L = 2; L <= max; L++) {
    let i = 0;
    while (i < group.length) {
      if (levels[i] < L) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < group.length && levels[j + 1] >= L) j++;
      if (j > i) out.push({ level: L, from: i, to: j });
      else {
        // Gạch cụt: nốt đầu → phải, nốt cuối → trái; ở giữa: bắt đầu đúng phân nhịp (móc đơn với L=2) → phải
        const unit = 2 ** (2 - L);
        const onSub = Math.abs(group[i].start / unit - Math.round(group[i].start / unit)) < EPS;
        const stub: -1 | 1 = i === 0 ? 1 : i === group.length - 1 ? -1 : onSub ? 1 : -1;
        out.push({ level: L, from: i, to: i, stub });
      }
      i = j + 1;
    }
  }
  return out;
}

/** Hướng đuôi chung của nhóm gạch nối: nốt xa vạch giữa nhất quyết định (dưới vạch giữa → đuôi lên). */
export function groupStemUp(steps: number[]): boolean {
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  return 4 - lo > hi - 4;
}

/**
 * Giãn cách: vị trí x (px, từ phách 0) của từng mốc thời gian (nốt, dấu lặng, vạch nhịp — gộp mọi bè).
 * Mỗi đoạn = max(trường độ × pxPerBeat, khoảng tối thiểu + phần đệm của mốc sau).
 */
export interface Spacing {
  t: number[];
  x: number[];
  pxPerBeat: number;
}

export function makeSpacing(
  times: number[],
  pxPerBeat: number,
  minGap: number,
  padBefore: (t: number) => number = () => 0,
  /** (+ 2026-10-15) Bề rộng "tự nhiên" của một khoảng `dt` phách (mặc định tuyến tính dt × pxPerBeat) */
  gapOf: (dt: number) => number = (dt) => dt * pxPerBeat,
): Spacing {
  const t = [...new Set(times.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
  if (!t.length || t[0] > 0) t.unshift(0);
  const x = [0];
  for (let i = 1; i < t.length; i++) {
    x.push(x[i - 1] + Math.max(gapOf(t[i] - t[i - 1]), minGap + padBefore(t[i])));
  }
  return { t, x, pxPerBeat };
}

/** Vị trí x của phách bất kỳ (nội suy tuyến tính giữa các mốc; ngoài mốc cuối: theo pxPerBeat). */
export function spaceAt(s: Spacing, beat: number): number {
  const { t, x } = s;
  if (beat <= t[0]) return x[0] + (beat - t[0]) * s.pxPerBeat;
  const n = t.length - 1;
  if (beat >= t[n]) return x[n] + (beat - t[n]) * s.pxPerBeat;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= beat) lo = mid;
    else hi = mid;
  }
  return x[lo] + ((beat - t[lo]) / (t[hi] - t[lo])) * (x[hi] - x[lo]);
}

/**
 * (+ 2026-10-15) Giãn cách tỉ lệ theo trường độ kiểu bản in (không tuyến tính): khoảng sau một nốt = pxPerQuarter × d^0.72
 * (d tính theo nốt đen) — nốt trắng ≈ 1,65 × nốt đen, nốt tròn ≈ 2,7 × (thay vì 2× / 4×) → trang gọn, khuông to hơn.
 * Băng chuyền không dùng (cần tốc độ trôi đều = tuyến tính).
 */
export const SPACING_POWER = 0.72;
export function durationGap(quarters: number, pxPerQuarter: number, power = SPACING_POWER): number {
  return quarters <= 0 ? 0 : pxPerQuarter * quarters ** power;
}

// ---------------- Khóa nhạc: hình vẽ bằng đường viền (không phụ thuộc phông chữ) ----------------

/** Điểm đường tâm [x, y, độ dày] tính theo khoảng cách 2 vạch; y = 0 ở vạch dưới cùng, hướng LÊN. */
type Pt = [number, number, number];
const TREBLE_CL: Pt[] = [
  [0.25, 1.02, 0.1], [0.72, 1.4, 0.15], [0.62, 2.02, 0.22], [-0.05, 2.18, 0.28], [-0.78, 1.58, 0.38],
  [-0.78, 0.5, 0.44], [0.05, -0.08, 0.32], [1.05, 0.25, 0.22], [1.38, 1.12, 0.17], [1.05, 2.02, 0.22],
  [0.25, 2.85, 0.32], [-0.38, 3.85, 0.38], [-0.25, 5.0, 0.26], [0.32, 5.62, 0.16], [0.7, 5.15, 0.15],
  [0.55, 4.35, 0.15], [0.28, 3.4, 0.15], [0.28, 1.5, 0.15], [0.45, -0.6, 0.16], [0.42, -1.38, 0.19],
  [0, -1.75, 0.19], [-0.4, -1.5, 0.2],
];
const BASS_CL: Pt[] = [
  [0.35, 3, 0.1], [0.55, 3.55, 0.22], [1.15, 3.95, 0.3], [1.95, 3.55, 0.4], [2.05, 2.55, 0.42],
  [1.55, 1.4, 0.34], [0.8, 0.55, 0.22], [0.05, 0.02, 0.1],
];
/** Chấm tròn của khóa: [x, y, bán kính] */
const TREBLE_DOTS: Array<[number, number, number]> = [[-0.38, -1.42, 0.38], [0.22, 1.02, 0.08]];
const BASS_DOTS: Array<[number, number, number]> = [[0.52, 3, 0.48], [2.75, 3.5, 0.2], [2.75, 2.5, 0.2]];

/** Đường viền nét bút có độ dày thay đổi quanh một đường cong Catmull-Rom (đơn vị: khoảng 2 vạch, y hướng lên). */
function strokeOutline(pts: Pt[], n = 8): Array<[number, number]> {
  const c: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const f = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t);
      c.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  c.push(pts[pts.length - 1]);
  const L: Array<[number, number]> = [];
  const R: Array<[number, number]> = [];
  c.forEach((p, i) => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    L.push([p[0] + (nx * p[2]) / 2, p[1] + (ny * p[2]) / 2]);
    R.push([p[0] - (nx * p[2]) / 2, p[1] - (ny * p[2]) / 2]);
  });
  return [...L, ...R.reverse()];
}

const clefCache = new Map<string, string>();
/**
 * Khóa Sol / khóa Fa dạng đường viền tô kín (một <path>, fill), gốc toạ độ (0, 0) = vạch dưới cùng tại thân khóa,
 * y hướng XUỐNG như SVG. `space` = khoảng cách 2 vạch (px). Khóa Sol cuộn quanh vạch 2 (Sol4), khóa Fa ôm vạch 4 (Fa3).
 */
export function clefPath(clef: 'treble' | 'bass', space = 14): string {
  const key = `${clef}${space}`;
  const hit = clefCache.get(key);
  if (hit) return hit;
  const r = (v: number) => Math.round(v * space * 10) / 10;
  const poly = strokeOutline(clef === 'treble' ? TREBLE_CL : BASS_CL);
  // Chấm tròn quay CÙNG chiều với đường viền (luật tô nonzero: chỗ chồng nhau không bị thủng)
  const area = poly.reduce((a, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return a + p[0] * -q[1] - q[0] * -p[1];
  }, 0);
  const sweep = area > 0 ? 1 : 0;
  let d = `M${poly.map(([x, y]) => `${r(x)},${r(-y)}`).join('L')}Z`;
  for (const [x, y, rad] of clef === 'treble' ? TREBLE_DOTS : BASS_DOTS) {
    const R = r(rad);
    d += `M${r(x) - R},${r(-y)}a${R},${R} 0 1 ${sweep} ${2 * R},0a${R},${R} 0 1 ${sweep} ${-2 * R},0Z`;
  }
  clefCache.set(key, d);
  return d;
}

/** Dấu thăng / giáng dạng hình vẽ (tô kín), tâm (cx, cy) = tâm dấu; `s` = khoảng cách 2 vạch. */
export function accidentalPath(kind: '#' | 'b', cx: number, cy: number, s = 14): string {
  const f = (v: number) => Math.round(v * 10) / 10;
  if (kind === '#') {
    const w = 0.13 * s; // nét đứng
    const t = 0.3 * s; // nét ngang (dày, nghiêng lên phải)
    const xl = cx - 0.24 * s;
    const xr = cx + 0.2 * s;
    const bar = (y: number) =>
      `M${f(cx - 0.55 * s)},${f(y + 0.14 * s)}L${f(cx + 0.55 * s)},${f(y - 0.14 * s)}L${f(cx + 0.55 * s)},${f(y - 0.14 * s + t)}L${f(cx - 0.55 * s)},${f(y + 0.14 * s + t)}Z`;
    return (
      `M${f(xl - w / 2)},${f(cy - 1.3 * s)}h${f(w)}v${f(2.75 * s)}h${f(-w)}Z` +
      `M${f(xr - w / 2)},${f(cy - 1.45 * s)}h${f(w)}v${f(2.75 * s)}h${f(-w)}Z` +
      bar(cy - 0.62 * s) +
      bar(cy + 0.32 * s)
    );
  }
  // Giáng: thân đứng + bụng tròn hơi nhọn ở dưới (đầu nốt nằm ngang bụng)
  const x = cx - 0.32 * s;
  const w = 0.14 * s;
  return (
    `M${f(x)},${f(cy - 1.95 * s)}h${f(w)}v${f(2.5 * s)}h${f(-w)}Z` +
    `M${f(x + w)},${f(cy + 0.55 * s)}C${f(cx + 0.95 * s)},${f(cy - 0.05 * s)} ${f(cx + 0.7 * s)},${f(cy - 0.85 * s)} ${f(x + w)},${f(cy - 0.25 * s)}` +
    `L${f(x + w)},${f(cy + 0.02 * s)}C${f(cx + 0.35 * s)},${f(cy - 0.5 * s)} ${f(cx + 0.45 * s)},${f(cy - 0.05 * s)} ${f(x + w)},${f(cy + 0.36 * s)}Z`
  );
}

/** Dấu ngoặc nhọn nối khuông kép (tô kín), mép phải ở x, từ y1 tới y2. */
export function bracePath(x: number, y1: number, y2: number, w = 10): string {
  const h = y2 - y1;
  const m = (y1 + y2) / 2;
  const f = (v: number) => Math.round(v * 10) / 10;
  const L = x - w;
  return (
    `M${f(x)},${f(y1)}C${f(L - w * 0.1)},${f(y1 + h * 0.06)} ${f(x - w * 0.15)},${f(m - h * 0.2)} ${f(L)},${f(m)}` +
    `C${f(x - w * 0.15)},${f(m + h * 0.2)} ${f(L - w * 0.1)},${f(y2 - h * 0.06)} ${f(x)},${f(y2)}` +
    `C${f(L + w * 0.55)},${f(y2 - h * 0.09)} ${f(x + w * 0.35)},${f(m + h * 0.17)} ${f(L + w * 0.12)},${f(m)}` +
    `C${f(x + w * 0.35)},${f(m - h * 0.17)} ${f(L + w * 0.55)},${f(y1 + h * 0.09)} ${f(x)},${f(y1)}Z`
  );
}

// ---------------- Nốt màu (tuỳ chọn "🎨 Nốt màu") ----------------

export type NoteLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const NOTE_LETTERS: readonly NoteLetter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/**
 * Bảng màu Okabe–Ito (an toàn cho người mù màu), xếp theo cầu vồng như chuông/ống màu trẻ em:
 * Đô đỏ cam · Rê cam · Mi vàng · Fa xanh lục lam · Sol xanh da trời · La xanh dương · Si tím hồng.
 * `text` = sắc đậm hơn cho chữ tên nốt (tương phản ≥ 4,5:1 trên nền trắng).
 */
export const NOTE_COLORS: Readonly<Record<NoteLetter, { fill: string; text: string }>> = {
  C: { fill: '#D55E00', text: '#A84A00' },
  D: { fill: '#E69F00', text: '#8F6200' },
  E: { fill: '#F0E442', text: '#6E6800' },
  F: { fill: '#009E73', text: '#00785A' },
  G: { fill: '#56B4E9', text: '#1D6E9E' },
  A: { fill: '#0072B2', text: '#0072B2' },
  B: { fill: '#CC79A7', text: '#A0477A' },
};
/** Chữ cái của cao độ ("F#4" → "F", "Bb3" → "B"); không phải nốt → null. Nốt thăng/giáng mang màu chữ cái của nó. */
export function noteLetter(pitch: string | undefined): NoteLetter | null {
  const c = pitch?.[0]?.toUpperCase();
  return c && (NOTE_LETTERS as readonly string[]).includes(c) ? (c as NoteLetter) : null;
}
