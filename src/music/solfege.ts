import { noteShape } from './engrave';
import { isValidPitch, pitchToMidi, type Pitch } from '../piano/pitchTable';

/**
 * "📝 Bố mẹ thêm bài" — CÁCH GÕ NỐT BẰNG CHỮ (ký âm Đô Rê Mi), hàm thuần, có test (tests/solfege.test.ts).
 *
 *   Tên nốt   Đô Rê Mi Fa Sol La Si — có dấu hay không đều được (do re mi fa sol la si; "pha", "son", "xi" cũng hiểu),
 *             hoặc tên chữ cái viết HOA: C D E F G A B (C4, F#4, Bb4).
 *   Quãng tám mặc định quãng của Đô giữa (Đô4). Thêm ' = cao hơn một quãng (Đô' = Đô5, Đô'' = Đô6),
 *             , = thấp hơn (Sol, = Sol3) — hoặc ghi số: Đô4, Sol3, Mi5.
 *   Thăng/giáng  # / b ngay sau tên: Fa#, Sib, Mib' (♯ ♭ cũng được).
 *   Độ dài    mặc định 1 phách (nốt đen). Mỗi "-" thêm 1 phách: Mi- = 2, Mi-- = 3, Mi--- = 4.
 *             "/" = nửa phách (móc đơn), "//" = ¼ phách (móc kép). "." = chấm dôi (×1,5): Mi. = 1,5 · Mi/. = ¾.
 *   Dấu lặng  "_" (1 phách), dùng cùng hậu tố: _- = lặng 2 phách, _/ = lặng nửa phách.
 *   Vạch nhịp "|" (không bắt buộc) — có thì app kiểm tra mỗi ô đủ phách theo số chỉ nhịp.
 *   Xuống dòng = câu nhạc mới (nút "Câu 1, Câu 2…" của màn bài hát).
 *
 * iPad hay tự đổi "--" thành "—" và ' thành ’ (dấu câu thông minh) → app hiểu cả hai.
 */

export interface SolfegeNote {
  pitch?: Pitch;
  beats: number;
  rest?: boolean;
  finger?: number;
}

export interface SolfegeIssue {
  /** Dòng (từ 1) */
  line: number;
  /** Từ (chữ) thứ mấy trên dòng (từ 1) */
  word: number;
  token: string;
  message: string;
}

export interface SolfegeResult {
  notes: SolfegeNote[];
  /** Lỗi — chưa lưu được bài */
  errors: SolfegeIssue[];
  /** Nhắc nhở — vẫn lưu được */
  warnings: SolfegeIssue[];
  /** Ô nhịp bắt đầu mỗi câu (mỗi dòng), sau khi đã thêm dấu lặng lấy đà (nếu có) */
  phrases: number[];
  /** Số phách dấu lặng thêm vào ĐẦU bài cho tròn ô nhịp lấy đà (0 = không) */
  pickupRest: number;
}

/** Dải nốt bố mẹ được nhập (khớp bàn phím ảo rộng nhất của trình soạn: Đô3–Đô6). */
export const LOWEST: Pitch = 'C3';
export const HIGHEST: Pitch = 'C6';

const SYLLABLES: Array<[RegExp, string]> = [
  [/^(do|đo)/, 'C'],
  [/^re/, 'D'],
  [/^mi/, 'E'],
  [/^(fa|pha)/, 'F'],
  [/^(sol|son|so)/, 'G'],
  [/^la/, 'A'],
  [/^(si|xi|ti)/, 'B'],
];
const LETTER_VI: Record<string, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** Bỏ dấu tiếng Việt, chữ thường (đ → d), giữ nguyên ký hiệu. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

const UP = /['’‘′`^]/;
const DOWN = /,/;

interface Parsed {
  pitch?: Pitch;
  rest?: boolean;
  beats: number;
  /** Hạ quãng bằng dấu phẩy */
  comma?: boolean;
}

/** Đọc một "từ" (một nốt hoặc dấu lặng). Lỗi → chuỗi thông báo. */
export function parseToken(raw: string): Parsed | string {
  const t = fold(raw.trim());
  if (!t) return 'Trống';
  let rest = false;
  let letter = '';
  let i = 0;
  if (t[0] === '_') {
    rest = true;
    i = 1;
  } else {
    for (const [re, l] of SYLLABLES) {
      const m = re.exec(t);
      if (m) {
        letter = l;
        i = m[0].length;
        break;
      }
    }
    // Tên chữ cái — chỉ khi viết HOA (tránh nhầm "b" giáng)
    if (!letter && /^[A-G]/.test(raw.trim())) {
      letter = raw.trim()[0];
      i = 1;
    }
    if (!letter) return `Không hiểu “${raw}” — tên nốt là Đô Rê Mi Fa Sol La Si (hoặc _ cho dấu lặng)`;
  }
  let acc = '';
  let octave: number | null = null;
  let shift = 0;
  let comma = false;
  const takeAcc = () => {
    const c = t[i];
    if (c === '#' || c === '♯' || c === 'b' || c === '♭') {
      if (acc) return 'Hai dấu thăng/giáng';
      acc = c === '♯' ? '#' : c === '♭' ? 'b' : c;
      i++;
    }
    return '';
  };
  if (!rest) {
    const e1 = takeAcc();
    if (e1) return `“${raw}”: ${e1}`;
    if (/\d/.test(t[i] ?? '')) {
      const m = /^\d+/.exec(t.slice(i))!;
      octave = Number(m[0]);
      i += m[0].length;
    } else {
      while (i < t.length && (UP.test(t[i]) || DOWN.test(t[i]))) {
        if (DOWN.test(t[i])) {
          shift--;
          comma = true;
        } else shift++;
        i++;
      }
    }
    const e2 = takeAcc();
    if (e2) return `“${raw}”: ${e2}`;
  }
  // Độ dài
  let dashes = 0;
  let slashes = 0;
  let dots = 0;
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === '-' || c === '–' || c === '~') dashes++;
    else if (c === '—') dashes += 2;
    else if (c === '/') slashes++;
    else if (c === '.') dots++;
    else if (/\d/.test(c)) return `“${raw}”: số quãng tám phải viết ngay sau tên nốt (vd Sol3-)`;
    else if (UP.test(c) || DOWN.test(c)) return `“${raw}”: dấu ' hoặc , phải viết ngay sau tên nốt (vd Đô'-)`;
    else return `“${raw}”: không hiểu ký tự “${c}”`;
  }
  if (dashes && slashes) return `“${raw}”: không dùng cả "-" và "/" trong một nốt`;
  if (slashes > 2) return `“${raw}”: ngắn nhất là "//" (¼ phách)`;
  if (dots > 1) return `“${raw}”: chỉ dùng một dấu chấm dôi`;
  const beats = ((1 + dashes) / 2 ** slashes) * (dots ? 1.5 : 1);
  if (!drawable(beats)) {
    return `“${raw}”: ${fmtBeats(beats)} phách không ghi được thành một nốt — tách thành hai nốt (vd Mi--- Mi)`;
  }
  if (rest) return { rest: true, beats };
  const oct = octave ?? 4 + shift;
  const pitch = `${letter}${acc}${oct}`;
  if (!/^[A-G](#|b)?\d$/.test(pitch)) return `“${raw}”: quãng tám ${oct} không có`;
  if (!isValidPitch(pitch)) {
    const midi = pitchToMidi(pitch);
    const same = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((midi % 12) + 12) % 12];
    return `“${raw}”: ${LETTER_VI[letter]}${acc} trùng phím ${LETTER_VI[same[0]]}${same.slice(1)} — hãy gõ ${LETTER_VI[same[0]]}${same.slice(1)}`;
  }
  const m = pitchToMidi(pitch);
  if (m < pitchToMidi(LOWEST) || m > pitchToMidi(HIGHEST)) {
    return `“${raw}”: nốt ${LETTER_VI[letter]}${acc}${oct} ngoài dải của app (Đô3 – Đô6) — bớt dấu ' hoặc , nhé`;
  }
  return { pitch, beats, comma };
}

/** Độ dài ghi được thành MỘT nốt trên khuông (tròn/trắng/đen/móc, có hoặc không chấm dôi). */
export function drawable(beats: number): boolean {
  const sh = noteShape(beats);
  return Math.abs(sh.base * (sh.dots === 1 ? 1.5 : sh.dots === 2 ? 1.75 : 1) - beats) < 1e-6;
}

/** Độ dài ghi được lớn nhất không vượt quá `beats` (≥ ¼ phách). */
export function largestDrawable(beats: number): number {
  for (const b of [6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25]) if (b <= beats + 1e-9) return b;
  return 0.25;
}

export function fmtBeats(b: number): string {
  return String(Math.round(b * 1000) / 1000).replace('.', ',');
}

/**
 * Đọc cả bài. Luôn trả về các nốt đọc được (để xem trước), kèm lỗi/nhắc nhở có số dòng.
 * `beatsPerBar` = số trên của số chỉ nhịp (4/4 → 4).
 */
export function parseSolfege(text: string, beatsPerBar: number): SolfegeResult {
  const errors: SolfegeIssue[] = [];
  const warnings: SolfegeIssue[] = [];
  const notes: Array<SolfegeNote & { line: number; word: number; token: string }> = [];
  /** Phách bắt đầu mỗi dòng có nốt */
  const lineStarts: number[] = [];
  /** Vạch nhịp bố mẹ gõ: phách tại vạch + vị trí (để báo lỗi) */
  const bars: Array<{ at: number; line: number; word: number }> = [];
  /** Phách tại các chỗ xuống dòng (vạch nhịp "mềm") */
  const breaks: number[] = [];
  let beat = 0;
  /** Nốt có dấu phẩy ở CUỐI chữ (kiểu "Đô, Rê, Mi") / dấu phẩy nằm giữa chữ ("Sol,/." — bố mẹ biết cách gõ) */
  let commaEnd = 0;
  let commaInside = 0;
  let pitched = 0;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((ln, li) => {
    if (li > 0) breaks.push(beat);
    // Vạch nhịp dính liền nốt ("Mi|Fa") vẫn tách được; dấu phẩy/chấm phẩy đứng riêng bỏ qua
    const words = ln.replace(/\|/g, ' | ').split(/\s+/).filter((w) => w && !/^[,;]+$/.test(w));
    let first = true;
    words.forEach((w, wi) => {
      const pos = { line: li + 1, word: wi + 1, token: w };
      if (w === '|' || w === '||') {
        bars.push({ at: beat, line: li + 1, word: wi + 1 });
        return;
      }
      const p = parseToken(w);
      if (typeof p === 'string') {
        errors.push({ ...pos, message: p });
        return;
      }
      if (first) {
        lineStarts.push(beat);
        first = false;
      }
      if (p.pitch) {
        pitched++;
        if (p.comma && w.endsWith(',')) commaEnd++;
        else if (p.comma) commaInside++;
      }
      notes.push({ ...(p.rest ? { rest: true } : { pitch: p.pitch }), beats: p.beats, ...pos });
      beat += p.beats;
    });
  });
  const total = beat;
  if (commaEnd >= 3 && !commaInside && commaEnd / pitched >= 0.6) {
    warnings.push({
      line: 1,
      word: 1,
      token: ',',
      message: 'Dấu phẩy "," nghĩa là THẤP xuống một quãng tám. Muốn tách các nốt thì chỉ cần dấu cách.',
    });
  }

  // Vạch nhịp: ô nhịp đầu ngắn hơn = nhịp lấy đà → thêm dấu lặng ở đầu; các ô khác phải đủ phách
  let pickupRest = 0;
  const cuts = bars.map((b) => b.at).filter((a, i, xs) => a > 1e-9 && a < total - 1e-9 && xs.indexOf(a) === i);
  if (cuts.length) {
    const first = cuts[0];
    if (first < beatsPerBar - 1e-9) pickupRest = beatsPerBar - first;
    const bounds = [0, ...cuts, total];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const len = bounds[k + 1] - bounds[k];
      const isFirst = k === 0;
      const isLast = k + 2 === bounds.length;
      const where = bars.find((b) => Math.abs(b.at - bounds[k + 1]) < 1e-9) ?? bars[bars.length - 1];
      if (isFirst && len < beatsPerBar - 1e-9) continue; // lấy đà
      if (isLast && len < beatsPerBar - 1e-9) continue; // ô cuối thiếu → app thêm dấu lặng
      // Đoạn có chỗ xuống dòng mà thiếu "|" ở cuối dòng: chấp nhận nếu đủ một số ô tròn (vd 8 phách = 2 ô 4/4)
      const soft = breaks.some((b) => b > bounds[k] + 1e-9 && b < bounds[k + 1] - 1e-9);
      const whole = Math.abs(len / beatsPerBar - Math.round(len / beatsPerBar)) < 1e-9 && len > 0;
      if (soft && whole) continue;
      if (Math.abs(len - beatsPerBar) > 1e-9) {
        warnings.push({
          line: where.line,
          word: where.word,
          token: '|',
          message: `Ô nhịp ${k + 1} có ${fmtBeats(len)} phách — nhịp ${beatsPerBar}/4 cần ${beatsPerBar} phách`,
        });
      }
    }
  }
  // Nốt vắt qua vạch nhịp (sau khi tính lấy đà)
  let at = pickupRest;
  for (const n of notes) {
    const startBar = Math.floor(at / beatsPerBar + 1e-9);
    const endBar = Math.floor((at + n.beats) / beatsPerBar - 1e-9);
    if (endBar > startBar && !cuts.length) {
      warnings.push({
        line: n.line,
        word: n.word,
        token: n.token,
        message: `“${n.token}” vắt qua vạch nhịp (ô ${startBar + 1} → ô ${endBar + 1}) — nên tách thành hai nốt`,
      });
    }
    at += n.beats;
  }

  const phrases = [...new Set(lineStarts.map((b) => Math.floor((b + pickupRest) / beatsPerBar + 1e-9)))].sort((a, b) => a - b);
  return {
    notes: notes.map(({ line: _l, word: _w, token: _t, ...n }) => n),
    errors,
    warnings,
    phrases: phrases.length > 1 ? phrases : [],
    pickupRest,
  };
}

/** Thêm dấu lặng lấy đà ở đầu và lặng cho tròn ô nhịp cuối (định dạng bài hát đòi tổng phách tròn ô nhịp). */
export function padToBars(notes: readonly SolfegeNote[], beatsPerBar: number, pickupRest = 0): SolfegeNote[] {
  const out: SolfegeNote[] = notes.map((n) => ({ ...n }));
  if (pickupRest > 1e-9) out.unshift(...restsFor(pickupRest));
  const used = out.reduce((s, n) => s + n.beats, 0);
  const left = (beatsPerBar - (used % beatsPerBar)) % beatsPerBar;
  if (left > 1e-9 && notes.length) out.push(...restsFor(left));
  return out;
}

/** Tách một khoảng lặng thành các dấu lặng ghi được (vd 2,5 = 2 + ½). */
export function restsFor(beats: number): SolfegeNote[] {
  const out: SolfegeNote[] = [];
  let left = beats;
  for (const b of [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25]) {
    while (left >= b - 1e-9) {
      out.push({ rest: true, beats: b });
      left -= b;
    }
  }
  return out;
}

// ---------------- Ngược lại: nốt → chữ (đổi chế độ Chạm phím → Gõ chữ, sửa bài cũ) ----------------

const VI_OUT: Record<string, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** Hậu tố độ dài cho `beats` ("" = 1 phách). */
export function durationSuffix(beats: number): string {
  for (const dot of [false, true]) {
    const b = dot ? beats / 1.5 : beats;
    const d = dot ? '.' : '';
    // Nguyên phách: 1–4 không chấm; có chấm thì gốc 1, 2, 4 (1,5 · 3 · 6) — đúng các hình nốt khuông vẽ được
    if (Math.abs(b - Math.round(b)) < 1e-9 && (dot ? [1, 2, 4] : [1, 2, 3, 4]).includes(Math.round(b))) return '-'.repeat(Math.round(b) - 1) + d;
    if (Math.abs(b - 0.5) < 1e-9) return `/${d}`;
    if (Math.abs(b - 0.25) < 1e-9) return `//${d}`;
  }
  throw new Error(`Độ dài không ghi được: ${beats}`);
}

/** Một nốt → chữ: "Sol", "Fa#'", "Sib,", "_-". */
export function noteToSolfege(n: SolfegeNote): string {
  if (n.rest || !n.pitch) return `_${durationSuffix(n.beats)}`;
  const m = /^([A-G])(#|b)?(\d)$/.exec(n.pitch);
  if (!m) throw new Error(`Cao độ lạ: ${n.pitch}`);
  const oct = Number(m[3]) - 4;
  const marks = oct > 0 ? "'".repeat(oct) : oct < 0 ? ','.repeat(-oct) : '';
  return `${VI_OUT[m[1]]}${m[2] ?? ''}${marks}${durationSuffix(n.beats)}`;
}

/**
 * Cả bài → chữ: có vạch nhịp "|" ở chỗ tròn ô; xuống dòng ở đầu mỗi câu (`phrases`) hoặc mỗi 4 ô nếu không có câu.
 */
export function notesToSolfege(notes: readonly SolfegeNote[], beatsPerBar: number, phrases: readonly number[] = []): string {
  const lines: string[] = [];
  let cur: string[] = [];
  let beat = 0;
  const starts = new Set(phrases.length ? phrases : []);
  for (const n of notes) {
    cur.push(noteToSolfege(n));
    beat += n.beats;
    const atBar = Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < 1e-9;
    if (atBar && beat > 0) {
      const bar = Math.round(beat / beatsPerBar);
      const newLine = phrases.length ? starts.has(bar) : bar % 4 === 0;
      if (newLine) {
        lines.push(cur.join(' '));
        cur = [];
      } else cur.push('|');
    }
  }
  if (cur.length) lines.push(cur.join(' ').replace(/\s\|$/, ''));
  return lines.join('\n');
}
