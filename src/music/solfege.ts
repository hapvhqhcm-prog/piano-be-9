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
 *   Dây nối  "~" nối hai nốt CÙNG cao độ: Mi-~Mi, Mi~Mi, Mi- ~Mi (cả qua xuống dòng) → gộp thành một nốt dài
 *             nếu ghi được (không vắt qua vạch nhịp); không thì giữ hai nốt và báo (định dạng bài chưa vẽ dây nối).
 *   Vạch nhịp "|" (không bắt buộc) — có thì app kiểm tra mỗi ô đủ phách theo số chỉ nhịp.
 *   Xuống dòng = câu nhạc mới (nút "Câu 1, Câu 2…" của màn bài hát).
 *
 * iPad hay tự đổi "--" thành "—" và ' thành ’ (dấu câu thông minh) → app hiểu cả hai.
 *
 * DỄ TÍNH với cách gõ quen tay của bố mẹ (rà soát hành trình phụ huynh 2026-10-06):
 * - "Đô-Rê-Mi" / "Sol/La/Sol" (gạch, gạch chéo NỐI các tên nốt) → tách nốt + thông báo (notices).
 *   "Mi-Fa-Sol-" → Mi Fa Sol- (gạch cuối là kéo dài); "Sol/La/" (chỉ "/", tận cùng cũng "/") → hai móc đơn.
 * - "-" hoặc "/" đứng riêng giữa các nốt ("do re mi / do re mi") → bỏ qua + thông báo.
 * - "Đô." như dấu chấm hết câu (cuối dòng, hoặc làm lệch phách mà nốt sau không phải móc đơn) → bỏ qua + thông báo.
 * - "Đô, Rê, Mi" (phẩy để ngăn cách) → LỖI chặn lưu, kèm sửa một chạm `stripSeparatorCommas` (fix: 'commas').
 * - Mọi nốt đều 1 phách / app tự hiểu nhịp lấy đà → thông báo để bố mẹ "Nghe thử" kiểm tra.
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
  /** Có sửa một chạm (trình soạn hiện nút): 'commas' = bỏ dấu phẩy ngăn cách (stripSeparatorCommas) */
  fix?: 'commas';
}

export interface SolfegeResult {
  notes: SolfegeNote[];
  /** Lỗi — chưa lưu được bài */
  errors: SolfegeIssue[];
  /** Nhắc nhở — vẫn lưu được */
  warnings: SolfegeIssue[];
  /** Thông báo (ℹ️) — app đã tự hiểu cách gõ quen tay / gợi ý kiểm tra; không phải lỗi */
  notices: SolfegeIssue[];
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
    if (c === '-' || c === '–') dashes++;
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
  if (!drawable(beats)) return `“${raw}”: ${fmtBeats(beats)} phách không ghi được thành một nốt — ${splitHint(raw, beats)}`;
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

/** Gợi ý tách một nốt quá dài, theo ĐÚNG tên nốt bố mẹ gõ: "Mi----" → "Mi--- Mi", "Sol,-----" → "Sol,--- Sol,-". */
function splitHint(raw: string, beats: number): string {
  const name = raw.trim().replace(/[-–—/.]+$/, '') || 'Mi';
  const a = largestDrawable(beats);
  const b = beats - a;
  if (b > 1e-9 && drawable(b)) return `tách thành hai nốt: ${name}${durationSuffix(a)} ${name}${durationSuffix(b)}`;
  return `tách thành nhiều nốt ngắn hơn (dài nhất là ${name}--- = 4 phách)`;
}

/** Phần còn lại của chữ bắt đầu bằng một tên nốt (hoặc dấu lặng "_")? */
function startsNote(raw: string): boolean {
  if (!raw) return false;
  if (raw[0] === '_' || /^[A-G]/.test(raw)) return true;
  const f = fold(raw);
  return SYLLABLES.some(([re]) => re.test(f));
}

/**
 * Tách chữ có gạch / gạch chéo NỐI các tên nốt: "Đô-Rê-Mi" → Đô Rê Mi (gạch là dấu ngăn cách).
 * Nếu chữ chỉ nối bằng "/" và tận cùng cũng là "/" ("Sol/La/") thì đó là hậu tố độ dài của từng nốt → "Sol/" "La/".
 */
export function splitJoined(word: string): { parts: string[]; joined: boolean } {
  const cuts: number[] = [];
  const runs: string[] = [];
  const re = /[-–—/]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(word))) {
    const end = m.index + m[0].length;
    if (m.index > 0 && end < word.length && startsNote(word.slice(end))) {
      cuts.push(end);
      runs.push(m[0][m[0].length - 1]);
    }
  }
  if (!cuts.length) return { parts: [word], joined: false };
  const pieces: string[] = [];
  let from = 0;
  for (const c of cuts) {
    pieces.push(word.slice(from, c));
    from = c;
  }
  pieces.push(word.slice(from));
  // Chỉ "/" mới có thể là hậu tố từng nốt ("Sol/La/Sol/Fa/" = 4 móc đơn). Gạch "-" nối tên nốt luôn là dấu ngăn
  // ("Mi-Fa-Sol-" kiểu sách bài hát = Mi Fa Sol- — gạch cuối mới là kéo dài).
  const tail = /\/$/.test(pieces[pieces.length - 1]);
  const suffixMode = tail && runs.every((r) => r === '/');
  return { parts: suffixMode ? pieces : pieces.map((p, i) => (i < pieces.length - 1 ? p.slice(0, -1) : p)), joined: true };
}

/** Sửa một chạm cho lỗi "Đô, Rê, Mi": bỏ MỘT dấu phẩy ở cuối mỗi chữ (dấu phẩy giữa chữ như "Sol,/" giữ nguyên). */
export function stripSeparatorCommas(text: string): string {
  return text.replace(/,(?=[ \t]|$)/gm, '').replace(/[ \t]+$/gm, '');
}

const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;

function noteNameVi(p: string): string {
  return LETTER_VI[p[0]] + (p[1] === '#' ? '#' : p[1] === 'b' ? 'b' : '');
}

/**
 * Đọc cả bài. Luôn trả về các nốt đọc được (để xem trước), kèm lỗi/nhắc nhở/thông báo có số dòng.
 * `beatsPerBar` = số trên của số chỉ nhịp (4/4 → 4).
 */
export function parseSolfege(text: string, beatsPerBar: number): SolfegeResult {
  const errors: SolfegeIssue[] = [];
  const warnings: SolfegeIssue[] = [];
  const notices: SolfegeIssue[] = [];
  type Note = SolfegeNote & { line: number; word: number; token: string; tieNext?: boolean };
  type Pos = { line: number; word: number; token: string };
  const notes: Note[] = [];
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
  let firstComma: Pos | undefined;
  // Thông báo gom lại (mỗi loại một dòng, kèm ví dụ đầu tiên)
  let joined: { pos: Pos; parts: string[]; n: number } | undefined;
  let loneSep: { pos: Pos; n: number } | undefined;
  let periods: { pos: Pos; n: number } | undefined;
  /** "~" vừa gặp → nốt kế tiếp nối dây với nốt trước */
  let tieNext = false;
  let tiePos: Pos | undefined;
  type Entry =
    | { kind: 'bar'; word: number }
    | { kind: 'note'; p: Parsed; pos: Pos; raw: string; tieFrom: boolean; dotEnd: boolean };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((ln, li) => {
    if (li > 0) breaks.push(beat);
    const entries: Entry[] = [];
    // Vạch nhịp dính liền nốt ("Mi|Fa") vẫn tách được; dấu phẩy/chấm phẩy đứng riêng bỏ qua
    const words = ln.replace(/\|/g, ' | ').split(/\s+/).filter((w) => w && !/^[,;]+$/.test(w));
    words.forEach((w, wi) => {
      const pos: Pos = { line: li + 1, word: wi + 1, token: w };
      if (w === '|' || w === '||') {
        entries.push({ kind: 'bar', word: wi + 1 });
        return;
      }
      if (/^[-–—/]+$/.test(w)) {
        loneSep = loneSep ? { ...loneSep, n: loneSep.n + 1 } : { pos, n: 1 };
        return;
      }
      w.split('~').forEach((seg, k) => {
        if (k > 0) {
          tieNext = true;
          tiePos = pos;
        }
        if (!seg) return;
        const sp = splitJoined(seg);
        if (sp.joined) joined = joined ? { ...joined, n: joined.n + 1 } : { pos, parts: sp.parts, n: 1 };
        for (const part of sp.parts) {
          const p = parseToken(part);
          if (typeof p === 'string') {
            errors.push({ ...pos, message: p });
            tieNext = false;
            continue;
          }
          entries.push({ kind: 'note', p, pos, raw: part, tieFrom: tieNext, dotEnd: /\.$/.test(part) });
          tieNext = false;
        }
      });
    });

    // "Đô." như dấu chấm hết câu: chấm dôi trên nốt nguyên phách làm lệch phách mà nốt sau là nốt nguyên phách thường,
    // hoặc ở cuối dòng làm lệch phách / làm dòng lệch ô nhịp → bỏ dấu chấm.
    const ns = entries.filter((e): e is Extract<Entry, { kind: 'note' }> => e.kind === 'note');
    let pos = 0;
    ns.forEach((e, k) => {
      const base = e.p.beats / 1.5;
      if (e.dotEnd && isInt(base) && base >= 1) {
        const after = pos + e.p.beats;
        const next = ns[k + 1];
        const lineWith = ns.reduce((s, x) => s + x.p.beats, 0);
        const lineWithout = lineWith - e.p.beats + base;
        const sentence = next
          ? !isInt(after) && !next.raw.includes('.') && isInt(next.p.beats) && next.p.beats >= 1 // nốt sau nguyên phách, không chấm (3+3+2 "Mi. Mi. Mi" vẫn giữ)
          : !isInt(after) || (isInt(lineWithout / beatsPerBar) && !isInt(lineWith / beatsPerBar));
        if (sentence) {
          e.p = { ...e.p, beats: base };
          periods = periods ? { ...periods, n: periods.n + 1 } : { pos: e.pos, n: 1 };
        }
      }
      pos += e.p.beats;
    });

    let first = true;
    for (const e of entries) {
      if (e.kind === 'bar') {
        bars.push({ at: beat, line: li + 1, word: e.word });
        continue;
      }
      const { p } = e;
      if (first) {
        lineStarts.push(beat);
        first = false;
      }
      if (p.pitch) {
        pitched++;
        if (p.comma && e.raw.endsWith(',')) {
          commaEnd++;
          firstComma ??= e.pos;
        } else if (p.comma) commaInside++;
      }
      if (e.tieFrom) {
        const prev = notes[notes.length - 1];
        if (!prev || prev.rest || p.rest || prev.pitch !== p.pitch) {
          errors.push({ ...e.pos, message: `“${e.pos.token}”: dây nối "~" chỉ nối hai nốt CÙNG cao độ (vd Mi-~Mi)` });
        } else prev.tieNext = true;
      }
      notes.push({ ...(p.rest ? { rest: true } : { pitch: p.pitch }), beats: p.beats, ...e.pos });
      beat += p.beats;
    }
  });
  if (tieNext && tiePos) notices.push({ ...tiePos, message: 'Dấu "~" ở cuối bài không có nốt sau để nối — đã bỏ qua.' });
  const total = beat;
  if (commaEnd >= 3 && !commaInside && commaEnd / pitched >= 0.6) {
    errors.push({
      ...(firstComma ?? { line: 1, word: 1, token: ',' }),
      message:
        'Có vẻ bố mẹ dùng dấu phẩy để tách nốt — nhưng "," nghĩa là THẤP xuống một quãng tám. Bấm “Bỏ dấu phẩy” (giữa các nốt chỉ cần dấu cách).',
      fix: 'commas',
    });
  }
  if (joined) {
    notices.push({
      ...joined.pos,
      message: `Hiểu “${joined.pos.token}” là “${joined.parts.join(' ')}”${joined.n > 1 ? ` (và ${joined.n - 1} chỗ nữa)` : ''} — dấu - hoặc / nối hai tên nốt được coi là dấu cách. Muốn kéo dài nốt thì gõ: Mi- Rê.`,
    });
  }
  if (loneSep) {
    notices.push({
      ...loneSep.pos,
      message: `Dấu “${loneSep.pos.token}” đứng riêng giữa các nốt được bỏ qua${loneSep.n > 1 ? ` (${loneSep.n} chỗ)` : ''}. Muốn chia ô nhịp thì dùng “|”.`,
    });
  }
  if (periods) {
    notices.push({
      ...periods.pos,
      message: `“${periods.pos.token}”: dấu chấm hết câu được bỏ qua${periods.n > 1 ? ` (${periods.n} chỗ)` : ''}. Dấu "." sau nốt là chấm dôi (×1,5) — vd Sol. La/`,
    });
  }

  // Vạch nhịp: ô nhịp đầu ngắn hơn = nhịp lấy đà → thêm dấu lặng ở đầu; các ô khác phải đủ phách
  let pickupRest = 0;
  const cuts = bars.map((b) => b.at).filter((a, i, xs) => a > 1e-9 && a < total - 1e-9 && xs.indexOf(a) === i);
  if (cuts.length) {
    const first = cuts[0];
    if (first < beatsPerBar - 1e-9) {
      pickupRest = beatsPerBar - first;
      const b0 = bars.find((b) => Math.abs(b.at - first) < 1e-9)!;
      notices.push({
        line: b0.line,
        word: b0.word,
        token: '|',
        message: `Ô đầu chỉ có ${fmtBeats(first)} phách → app hiểu là NHỊP LẤY ĐÀ (thêm lặng ${fmtBeats(pickupRest)} phách ở đầu). Nếu không phải, kiểm tra vạch “|” đầu tiên.`,
      });
    }
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

  // Dây nối "~": gộp thành MỘT nốt dài nếu ghi được và không vắt qua vạch nhịp; không thì giữ hai nốt + thông báo
  // (định dạng bài hát chưa vẽ dây nối — bé đàn lại nốt sau).
  let kept: Note | undefined;
  {
    let at = pickupRest;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      while (n.tieNext && i + 1 < notes.length) {
        const sum = n.beats + notes[i + 1].beats;
        const cross = Math.floor(at / beatsPerBar + 1e-9) !== Math.floor((at + sum) / beatsPerBar - 1e-9);
        if (!drawable(sum) || cross) {
          kept ??= n;
          break;
        }
        n.beats = sum;
        n.tieNext = notes[i + 1].tieNext;
        notes.splice(i + 1, 1);
      }
      at += n.beats;
    }
  }
  if (kept) {
    notices.push({
      line: kept.line,
      word: kept.word,
      token: kept.token,
      message: `Dây nối ở “${kept.token}”: nốt nối vắt qua vạch nhịp hoặc quá dài để ghi thành một nốt — app ghi thành hai nốt ${noteNameVi(kept.pitch ?? 'C')} liền nhau (bé đàn lại nốt sau).`,
    });
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

  // Mọi nốt đều 1 phách: hay gặp khi chép nốt mà quên trường độ → nhắc nghe thử so với bài hát
  if (notes.filter((n) => !n.rest).length >= 8 && notes.every((n) => Math.abs(n.beats - 1) < 1e-9)) {
    notices.push({
      line: 1,
      word: 1,
      token: '',
      message: 'Tất cả nốt 1 phách — bấm ▶ Nghe thử so với bài hát. Nốt ngân dài thêm "-" (Mi-), nốt nhanh thêm "/" (Rê/).',
    });
  }

  const phrases = [...new Set(lineStarts.map((b) => Math.floor((b + pickupRest) / beatsPerBar + 1e-9)))].sort((a, b) => a - b);
  return {
    notes: notes.map(({ line: _l, word: _w, token: _t, tieNext: _n, ...n }) => n),
    errors,
    warnings,
    notices,
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
