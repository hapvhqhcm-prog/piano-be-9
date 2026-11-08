/**
 * (+ 2026-11-08, OWNER "thêm bài hát … có tính năng 2 tay hợp âm") TAY TRÁI ĐỆM HỢP ÂM cho bài tự thêm.
 *
 * - Gõ hợp âm theo ô nhịp: "C | G | Am | F" (chữ cái) hoặc "Đô | Sol | La thứ | Fa" (tên Việt). Không có "|" thì
 *   mỗi chữ là một ô; trong một ô có thể ghi 2–3 hợp âm ("C G" = mỗi hợp âm nửa ô); "_" = ô nghỉ; "-" = giữ hợp âm trước.
 * - suggestChords(): app tự chọn hợp âm theo giai điệu (tìm giọng trưởng, mỗi ô chọn I / IV / V / vi / ii hợp nhất).
 * - buildChordLh(): dựng bè tay trái (nốt + số ngón) — 3 kiểu: 'root' một nốt gốc · 'block' hợp âm giữ cả ô ·
 *   'pulse' hợp âm đánh theo phách. Hợp âm xếp thế gần nhau (đảo) để tay ít phải nhảy, quanh Đô3, ngón 5-3-1 / 5-2-1.
 * Phần thuần (không DOM). Không dùng lookbehind (Safari 15).
 */
import { autoFinger } from './autoFinger';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';

export type ChordQuality = 'maj' | 'min' | 'dim' | '7' | 'm7';
export type ChordStyle = 'root' | 'block' | 'pulse';

export interface Chord {
  /** Lớp cao độ của nốt gốc (0 = Đô) */
  root: number;
  /** Chữ cái nốt gốc A–G */
  letter: string;
  /** Dấu hóa của nốt gốc */
  acc: '' | '#' | 'b';
  quality: ChordQuality;
}

export interface ChordSlot {
  chord: Chord | null;
  beats: number;
}

export interface ChordIssue {
  token: string;
  message: string;
}

export interface ChordNote {
  pitch?: Pitch;
  beats: number;
  finger?: number;
  rest?: boolean;
  also?: Array<{ pitch: Pitch; finger?: number }>;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFA: Array<[string, string]> = [
  ['sol', 'G'],
  ['do', 'C'],
  ['re', 'D'],
  ['mi', 'E'],
  ['fa', 'F'],
  ['la', 'A'],
  ['si', 'B'],
];
const VI_LETTER: Record<string, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** Khoảng cách (nửa cung) các nốt của hợp âm tính từ nốt gốc — hợp âm 7 bỏ quãng 5 (tay bé chỉ cần 3 ngón). */
const INTERVALS: Record<ChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], '7': [0, 4, 10], m7: [0, 3, 10] };
/** Bậc chữ (quãng 3 = +2 chữ, quãng 5 = +4, quãng 7 = +6) — để viết đúng tên nốt (Si giáng chứ không La thăng). */
const DEGREES: Record<ChordQuality, number[]> = { maj: [0, 2, 4], min: [0, 2, 4], dim: [0, 2, 4], '7': [0, 2, 6], m7: [0, 2, 6] };

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Đọc một tên hợp âm ("Am", "F#", "Bb7", "Đô", "La thứ" (đã ghép), "Sol7", "Si giáng"). null = không hiểu. */
export function parseChordName(raw: string): Chord | null {
  let s = strip(raw.trim()).replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!s) return null;
  let letter = '';
  const sol = SOLFA.find(([vi]) => s.startsWith(vi));
  if (sol) {
    letter = sol[1];
    s = s.slice(sol[0].length);
  } else if (/^[a-g]/.test(s)) {
    letter = s[0].toUpperCase();
    s = s.slice(1);
  } else return null;
  let acc: Chord['acc'] = '';
  if (s.startsWith('#') || s.startsWith('thang')) {
    acc = '#';
    s = s.slice(s[0] === '#' ? 1 : 5);
  } else if (s.startsWith('giang')) {
    acc = 'b';
    s = s.slice(5);
  } else if (s.startsWith('b')) {
    acc = 'b';
    s = s.slice(1);
  }
  let quality: ChordQuality;
  if (s === '' || s === 'truong' || s === 'maj' || s === 'maj7' || s === 'major') quality = 'maj';
  else if (s === 'm' || s === 'thu' || s === 'min' || s === '-') quality = 'min';
  else if (s === '7') quality = '7';
  else if (s === 'm7' || s === 'thu7' || s === 'min7') quality = 'm7';
  else if (s === 'dim' || s === '°' || s === 'o') quality = 'dim';
  else return null;
  const root = (LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  return { root, letter, acc, quality };
}

/** Tên ngắn kiểu quốc tế: "Am", "F#", "Bb7". */
export function chordName(c: Chord): string {
  const q = c.quality === 'maj' ? '' : c.quality === 'min' ? 'm' : c.quality;
  return `${c.letter}${c.acc}${q}`;
}

/** Tên Việt cho bé: "Đô", "La thứ", "Sol 7", "Si giáng". */
export function chordViName(c: Chord): string {
  const r = `${VI_LETTER[c.letter]}${c.acc === '#' ? ' thăng' : c.acc === 'b' ? ' giáng' : ''}`;
  if (c.quality === 'maj') return r;
  if (c.quality === 'min') return `${r} thứ`;
  if (c.quality === 'dim') return `${r} giảm`;
  if (c.quality === '7') return `${r} 7`;
  return `${r} thứ 7`;
}

/** Ghép chữ rời "La thứ" → "Lathứ" trước khi tách (từ phụ đứng sau tên nốt). */
function joinWords(line: string): string {
  return line.replace(/\s+(thứ|thu|trưởng|truong|thăng|thang|giáng|giang)(?=\s|\||$|7)/gi, '$1');
}

/**
 * Chữ hợp âm → các ô nhịp. Mỗi ô = danh sách hợp âm (null = nghỉ, 'hold' = giữ hợp âm trước).
 * Dòng có "|" → tách ô theo "|"; dòng không có "|" → mỗi chữ một ô.
 */
export function parseChordText(text: string): { bars: Array<Array<Chord | null | 'hold'>>; errors: ChordIssue[] } {
  const bars: Array<Array<Chord | null | 'hold'>> = [];
  const errors: ChordIssue[] = [];
  const tok = (t: string): Chord | null | 'hold' => {
    if (t === '_' || t === 'x' || t === 'N.C.' || t === 'nc') return null;
    if (t === '-' || t === '%' || t === '.') return 'hold';
    const c = parseChordName(t);
    if (!c) {
      errors.push({ token: t, message: `không hiểu hợp âm “${t}” (ví dụ đúng: C, Am, G7, Đô, La thứ)` });
      return 'hold';
    }
    return c;
  };
  for (const raw of text.split('\n')) {
    const line = joinWords(raw.replace(/,/g, ' ').trim());
    if (!line) continue;
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      // bỏ ô rỗng ở hai đầu ("| C | G |")
      while (parts.length && !parts[0]) parts.shift();
      while (parts.length && !parts[parts.length - 1]) parts.pop();
      for (const p of parts) {
        const ts = p.split(/\s+/).filter(Boolean);
        bars.push(ts.length ? ts.map(tok) : ['hold']);
      }
    } else {
      for (const t of line.split(/\s+/).filter(Boolean)) bars.push([tok(t)]);
    }
  }
  return { bars, errors };
}

/** Ô → các khúc có độ dài nguyên phách (n hợp âm trong ô bpb phách: 4/4 + 2 → 2+2, 3/4 + 2 → 2+1). */
export function barSlots(items: ReadonlyArray<Chord | null | 'hold'>, bpb: number, prev: Chord | null): ChordSlot[] {
  const list = items.slice(0, bpb);
  const n = list.length || 1;
  const base = Math.floor(bpb / n);
  const out: ChordSlot[] = [];
  let last = prev;
  list.forEach((it, i) => {
    const beats = i === 0 ? bpb - base * (n - 1) : base;
    const chord = it === 'hold' ? last : it;
    // "-" trong cùng ô → nối dài khúc trước
    if (it === 'hold' && out.length) out[out.length - 1].beats += beats;
    else out.push({ chord, beats });
    last = chord;
  });
  if (!out.length) out.push({ chord: prev, beats: bpb });
  return out;
}

/** Tên nốt (đúng chữ theo bậc) cho một quãng của hợp âm, ở quãng tám `oct`. */
function spell(c: Chord, idx: number, midi: number): Pitch {
  const letter = LETTERS[(LETTERS.indexOf(c.letter) + DEGREES[c.quality][idx]) % 7];
  const pc = ((midi % 12) + 12) % 12;
  let d = pc - LETTER_PC[letter];
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  if (d < -1 || d > 1) {
    // dấu kép (hiếm) → dùng thăng
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[pc]}${Math.floor(midi / 12) - 1}`;
  }
  // quãng tám của tên nốt (Si thăng 2 = Đô 3 → octave theo chữ)
  const oct = Math.floor((midi - d) / 12) - 1;
  return `${letter}${d === 1 ? '#' : d === -1 ? 'b' : ''}${oct}`;
}

interface Voicing {
  midis: number[];
  pitches: Pitch[];
}

/** Các thế (gốc / đảo 1 / đảo 2) đặt quanh Đô3: nốt thấp nhất La2–Mi3, nốt cao nhất ≤ La3. */
function voicings(c: Chord): Voicing[] {
  const iv = INTERVALS[c.quality];
  const out: Voicing[] = [];
  for (let inv = 0; inv < 3; inv++) {
    const order = [...iv.slice(inv), ...iv.slice(0, inv).map((x) => x + 12)];
    const idxOrder = [...[0, 1, 2].slice(inv), ...[0, 1, 2].slice(0, inv)];
    for (let base = 36; base <= 60; base += 12) {
      const midis = order.map((x) => base + c.root + x);
      if (midis[0] < 45 || midis[0] > 52 || midis[2] > 57) continue;
      out.push({ midis, pitches: midis.map((m, k) => spell(c, idxOrder[k], m)) });
    }
  }
  if (!out.length) {
    // không thế nào vừa khung → thế gốc gần Đô3
    let base = 36 + c.root;
    while (base < 45) base += 12;
    const midis = iv.map((x) => base + x);
    out.push({ midis, pitches: midis.map((m, k) => spell(c, k, m)) });
  }
  return out;
}

/** Chọn thế gần thế trước nhất (ít nhảy); hợp âm đầu: thế gốc gần Đô3. Thế đảo bị trừ nhẹ để bài dễ đọc. */
function pickVoicing(c: Chord, prev: Voicing | null): Voicing {
  const all = voicings(c);
  let best = all[0];
  let bestCost = Infinity;
  for (const v of all) {
    const inv = (((v.midis[0] - c.root) % 12) + 12) % 12 !== 0;
    const cost = prev ? v.midis.reduce((s, m, i) => s + Math.abs(m - prev.midis[i]), 0) + (inv ? 1.5 : 0) : Math.abs(v.midis[0] - 48) + (inv ? 6 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

/** Số ngón tay trái cho hợp âm 3 nốt: thấp nhất 5, cao nhất 1, giữa 3 (cách nốt thấp ≤ 4 nửa cung) hoặc 2. */
function chordFingers(v: Voicing): number[] {
  return [5, v.midis[1] - v.midis[0] <= 4 ? 3 : 2, 1];
}

function chordNote(v: Voicing, beats: number): ChordNote {
  const f = chordFingers(v);
  return { pitch: v.pitches[0], beats, finger: f[0], also: [{ pitch: v.pitches[1], finger: f[1] }, { pitch: v.pitches[2], finger: f[2] }] };
}

/**
 * Dựng bè tay trái dài đúng `totalBars` ô (thiếu hợp âm → ô nghỉ; thừa → bỏ).
 * 'root': nốt gốc giữ cả khúc (số ngón tự ghi) · 'block': hợp âm giữ cả khúc · 'pulse': hợp âm theo phách
 * (4/4: 2 + 2 · 3/4 và 2/4: từng phách).
 */
export function buildChordLh(
  bars: ReadonlyArray<ReadonlyArray<Chord | null | 'hold'>>,
  bpb: number,
  totalBars: number,
  style: ChordStyle,
): ChordNote[] {
  const out: ChordNote[] = [];
  let prevChord: Chord | null = null;
  let prevV: Voicing | null = null;
  let prevRoot = 48;
  for (let b = 0; b < totalBars; b++) {
    const items = bars[b];
    const slots: ChordSlot[] = items ? barSlots(items, bpb, prevChord) : [{ chord: null, beats: bpb }];
    for (const s of slots) {
      prevChord = s.chord;
      if (!s.chord) {
        out.push({ rest: true, beats: s.beats });
        continue;
      }
      if (style === 'root') {
        // nốt gốc gần nốt gốc trước (Sol2–Fa#3)
        let m = 36 + s.chord.root;
        while (m < 43) m += 12;
        while (m > 54) m -= 12;
        if (Math.abs(m + 12 - prevRoot) < Math.abs(m - prevRoot) && m + 12 <= 54) m += 12;
        if (Math.abs(m - 12 - prevRoot) < Math.abs(m - prevRoot) && m - 12 >= 43) m -= 12;
        prevRoot = m;
        out.push({ pitch: spell(s.chord, 0, m), beats: s.beats });
        continue;
      }
      const v = pickVoicing(s.chord, prevV);
      prevV = v;
      const step = style === 'pulse' ? (bpb === 4 ? 2 : 1) : s.beats;
      let left = s.beats;
      while (left > 1e-9) {
        const d = Math.min(step, left);
        out.push(chordNote(v, d));
        left -= d;
      }
    }
  }
  if (style === 'root') {
    const f = autoFinger(out, 'LH');
    out.forEach((n, i) => {
      if (!n.rest && f[i]) n.finger = f[i];
      else if (!n.rest) n.finger = 5;
    });
  }
  return out;
}

// ---------------------------------------------------------------- app tự chọn hợp âm

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Giọng trưởng theo số dấu hóa tăng dần (hòa điểm → chọn giọng ít dấu). */
const KEYS = [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);
const SHARP_NAMES: Array<[string, Chord['acc']]> = [['C', ''], ['C', '#'], ['D', ''], ['D', '#'], ['E', ''], ['F', ''], ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['A', '#'], ['B', '']];
const FLAT_NAMES: Array<[string, Chord['acc']]> = [['C', ''], ['D', 'b'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''], ['G', 'b'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', '']];

function makeChord(pc: number, quality: ChordQuality, flats: boolean): Chord {
  const [letter, acc] = (flats ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12];
  return { root: ((pc % 12) + 12) % 12, letter, acc, quality };
}

export interface MelodyNote {
  pitch?: Pitch;
  beats: number;
  rest?: boolean;
}

/** Giọng trưởng của giai điệu (lớp cao độ chủ âm). */
export function guessKey(notes: readonly MelodyNote[]): number {
  const ps = notes.filter((n) => !n.rest && n.pitch).map((n) => ({ pc: pitchToMidi(n.pitch!) % 12, d: n.beats }));
  if (!ps.length) return 0;
  const last = ps[ps.length - 1].pc;
  let best = 0;
  let bestScore = -Infinity;
  for (const k of KEYS) {
    let sc = 0;
    for (const p of ps) sc += MAJOR.includes((p.pc - k + 12) % 12) ? p.d : -p.d;
    if (last === k) sc += 2;
    else if ((last - k + 12) % 12 === 4 || (last - k + 12) % 12 === 7) sc += 0.5;
    if (sc > bestScore + 1e-9) {
      bestScore = sc;
      best = k;
    }
  }
  return best;
}

/**
 * App tự chọn hợp âm cho từng ô (mỗi ô một hợp âm). `notes` = giai điệu đã thêm lặng lấy đà / tròn ô (padToBars).
 * Ô lấy đà (ô đầu bắt đầu bằng dấu lặng, ít nốt) → "_". Trả về chữ hợp âm, 4 ô một dòng.
 */
export function suggestChords(notes: readonly MelodyNote[], bpb: number): string {
  const key = guessKey(notes);
  const flats = FLAT_KEYS.has(key);
  const cands: Array<{ c: Chord; prior: number; deg: number }> = [
    { c: makeChord(key, 'maj', flats), prior: 0.35, deg: 1 },
    { c: makeChord(key + 7, 'maj', flats), prior: 0.25, deg: 5 },
    { c: makeChord(key + 7, '7', flats), prior: 0.17, deg: 5 },
    { c: makeChord(key + 5, 'maj', flats), prior: 0.2, deg: 4 },
    { c: makeChord(key + 9, 'min', flats), prior: 0, deg: 6 },
    { c: makeChord(key + 2, 'min', flats), prior: -0.1, deg: 2 },
  ];
  // nốt theo ô
  const bars: Array<Array<{ pc: number; d: number; at: number }>> = [];
  let t = 0;
  for (const n of notes) {
    const b = Math.floor(t / bpb + 1e-9);
    while (bars.length <= b) bars.push([]);
    if (!n.rest && n.pitch) bars[b].push({ pc: pitchToMidi(n.pitch) % 12, d: n.beats, at: t - b * bpb });
    t += n.beats;
  }
  const total = Math.ceil(t / bpb - 1e-9);
  while (bars.length < total) bars.push([]);
  const out: string[] = [];
  let prev: Chord | null = null;
  bars.forEach((bar, i) => {
    const sounding = bar.reduce((s, x) => s + x.d, 0);
    if (i === 0 && notes[0]?.rest && sounding < bpb / 2) {
      out.push('_');
      return;
    }
    if (!bar.length) {
      out.push(prev ? chordName(prev) : '_');
      return;
    }
    // điểm một khúc nốt cho từng hợp âm: tỉ lệ (theo độ dài × phách mạnh) nốt thuộc hợp âm + ưu tiên bậc
    const score = (seg: typeof bar, from: number, cd: (typeof cands)[number], whole: boolean, segStart: boolean) => {
      const tones = (cd.c.quality === '7' ? [0, 4, 7, 10] : INTERVALS[cd.c.quality]).map((x) => (cd.c.root + x) % 12);
      let sc = 0;
      let w = 0;
      for (const x of seg) {
        const at = x.at - from;
        const strong = at < 1e-9 ? 1.5 : whole && bpb === 4 && Math.abs(at - 2) < 1e-9 ? 1.4 : 1;
        const wt = x.d * strong;
        w += wt;
        if (tones.includes(x.pc)) sc += wt;
      }
      const fit = sc / (w || 1);
      let bonus = cd.prior;
      const lastBar = i === bars.length - 1;
      if (lastBar && cd.deg === 1 && !segStart) bonus += 0.6; // kết bài về chủ âm
      if (i === bars.length - 2 && cd.deg === 5 && !segStart) bonus += 0.25; // ô áp chót: át âm
      if (i === 0 && cd.deg === 1 && segStart) bonus += 0.3;
      return { fit, total: fit + bonus };
    };
    const bestFor = (seg: typeof bar, from: number, whole: boolean, segStart: boolean, before: Chord | null) => {
      let best = cands[0];
      let bestTotal = -Infinity;
      let bestFit = 0;
      for (const cd of cands) {
        const r = score(seg, from, cd, whole, segStart);
        const t = r.total + (before && chordName(before) === chordName(cd.c) ? 0.05 : 0); // ít đổi hợp âm hơn
        if (t > bestTotal + 1e-9) {
          bestTotal = t;
          best = cd;
          bestFit = r.fit;
        }
      }
      return { best, fit: bestFit };
    };
    const whole = bestFor(bar, 0, true, i === 0, prev);
    // 4/4: nửa ô đầu và nửa ô sau hợp hai hợp âm khác nhau hẳn → ghi 2 hợp âm trong ô (vd "Fa Fa Mi Mi" → F C)
    if (bpb === 4 && whole.fit < 0.8) {
      const h1 = bar.filter((x) => x.at < 2 - 1e-9);
      const h2 = bar.filter((x) => x.at >= 2 - 1e-9);
      if (h1.length && h2.length) {
        const a = bestFor(h1, 0, false, true, prev);
        const b = bestFor(h2, 2, false, false, a.best.c);
        if (a.fit >= 0.75 && b.fit >= 0.75 && (a.fit + b.fit) / 2 > whole.fit + 0.15 && chordName(a.best.c) !== chordName(b.best.c)) {
          prev = b.best.c;
          out.push(`${chordName(a.best.c)} ${chordName(b.best.c)}`);
          return;
        }
      }
    }
    const best = whole.best;
    prev = best.c;
    out.push(chordName(best.c));
  });
  const lines: string[] = [];
  for (let i = 0; i < out.length; i += 4) lines.push(out.slice(i, i + 4).join(' | '));
  return lines.join('\n');
}

/** Hợp âm đã dùng (không trùng) — để hiện bảng "C = Đô (Đô Mi Sol)". */
export function chordsUsed(bars: ReadonlyArray<ReadonlyArray<Chord | null | 'hold'>>): Chord[] {
  const seen = new Map<string, Chord>();
  for (const b of bars) for (const c of b) if (c && c !== 'hold' && !seen.has(chordName(c))) seen.set(chordName(c), c);
  return [...seen.values()];
}

/** Tên các nốt của hợp âm (tiếng Việt, từ nốt gốc): "Đô Mi Sol". */
export function chordToneNames(c: Chord): string {
  return INTERVALS[c.quality]
    .map((x, k) => {
      const p = spell(c, k, 48 + c.root + x);
      const l = p[0];
      const a = p[1] === '#' ? ' thăng' : p[1] === 'b' ? ' giáng' : '';
      return `${VI_LETTER[l]}${a}`;
    })
    .join(' – ');
}
