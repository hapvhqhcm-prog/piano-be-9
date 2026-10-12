/**
 * NHẠC LÝ NHẸ NHÀNG (OWNER duyệt 2026-10-12, theo góp ý của chuyên gia sư phạm): app đã cho bé "làm" nhiều thứ (bước/nhảy,
 * to/nhỏ, liền/ngắt, 3/4, phím đen…) nhưng chưa gọi TÊN. Mỗi khái niệm là MỘT thẻ "📘 Biết thêm" đặt ở tuần khái niệm được
 * DÙNG lần đầu (hoặc tuần sau) — thêm vào CUỐI bài ở tuần 1–5 (tiến độ đã lưu giữ nguyên nghĩa) — kèm 2 câu hỏi nhanh;
 * "📘 Từ điển nhạc nhỏ" (Thư viện) liệt kê mọi khái niệm đã mở; "📘 Đố vui nhạc lý" là khởi động thỉnh thoảng (vài tuần).
 *
 * Lời cho bé: tiếng Việt, ≤ 12 chữ mỗi dòng (test curriculum-theory). Module này CHỈ được nạp bởi màn nạp muộn
 * (ui/screens/theory.ts, glossary.ts) và test — không nằm trong gói chính.
 */
import type { TuneNote } from '../music/tune';
import { diatonic } from '../music/staff';
import type { Pitch } from '../piano/pitchTable';
import type { AppData } from '../progress/schema';
import { WEEKS, activityDoneId } from './curriculum';
import type { TheoryId } from './types';

/** Hình minh họa: khuông nhạc (StaffView) · bàn phím nhỏ có phím đánh dấu · ký hiệu chữ to. */
export type TheoryPic =
  | {
      kind: 'staff';
      clef?: 'treble' | 'bass';
      timeSignature?: '4/4' | '3/4' | '2/4';
      notes: TuneNote[];
      /** Hiện tên nốt dưới khuông */
      names?: boolean;
      tempoTerm?: string;
    }
  | { kind: 'keys'; low: Pitch; high: Pitch; marks: Array<{ pitch: Pitch; label: string }> }
  | { kind: 'signs'; items: Array<{ sign: string; label: string }> };

/** Âm "Nghe thử": từng bước một nốt / một hợp âm; d = giây vang, v = âm lượng 0–1 (mặc định 0,8), gap = nghỉ sau (giây). */
export interface TheorySoundStep {
  p: Pitch | Pitch[];
  d: number;
  v?: number;
  gap?: number;
}

export interface TheoryCheck {
  q: string;
  /** Lựa chọn (2–3); đáp án đúng là `choices[answer]` — màn hiển thị tự xáo thứ tự */
  choices: string[];
  answer: number;
  pic?: TheoryPic;
}

export interface TheoryConcept {
  id: TheoryId;
  emoji: string;
  /** Tên thẻ (≤ 8 chữ) */
  title: string;
  /** 1–3 dòng cho bé (≤ 12 chữ mỗi dòng) */
  lines: string[];
  /** Một dòng cho Từ điển nhạc nhỏ (≤ 12 chữ) */
  short: string;
  /** Các thuật ngữ (chip trong Từ điển) */
  terms: string[];
  pic: TheoryPic;
  sound?: TheorySoundStep[];
  checks: TheoryCheck[];
  /** Tuần có thẻ (= tuần mở trong Từ điển) và bài chứa thẻ — test kiểm khớp với giáo trình */
  week: number;
  lesson: string;
}

const n = (pitch: Pitch, beats: number, extra: Partial<TuneNote> = {}): TuneNote => ({ pitch, beats, ...extra });
const rest = (beats: number): TuneNote => ({ rest: true, beats });
const seq = (ps: Pitch[], d: number, gap = 0.12, v?: number): TheorySoundStep[] => ps.map((p) => ({ p, d, gap, v }));
/** Đếm phách: phách đầu ô nhịp to hơn */
const pulse = (ps: Pitch[], per: number): TheorySoundStep[] => ps.map((p, i) => ({ p, d: 0.45, gap: 0.2, v: i % per === 0 ? 1 : 0.45 }));
const pair = (a: Pitch, b: Pitch): TheoryPic => ({ kind: 'staff', notes: [n(a, 2), n(b, 2)] });

export const THEORY: readonly TheoryConcept[] = [
  {
    id: 'octave',
    emoji: '🎯',
    title: 'Quãng 8: hai bạn Đô',
    lines: ['Đô trầm, Đô giữa, Đô cao — cùng tên Đô.', 'Từ Đô đếm lên 8 phím trắng: lại gặp Đô.', 'Cách nhau như thế gọi là QUÃNG 8.'],
    short: 'Hai nốt cùng tên, cách nhau 8 phím trắng.',
    terms: ['quãng 8'],
    pic: { kind: 'keys', low: 'C3', high: 'C5', marks: [{ pitch: 'C3', label: 'Đô' }, { pitch: 'C4', label: 'Đô' }, { pitch: 'C5', label: 'Đô' }] },
    sound: seq(['C3', 'C4', 'C5'], 0.8, 0.2),
    checks: [
      { q: 'Từ Đô đi lên quãng 8 là nốt gì?', choices: ['Đô', 'Sol', 'Mi'], answer: 0 },
      { q: 'Quãng 8 đếm được mấy phím trắng?', choices: ['8 phím', '3 phím', '5 phím'], answer: 0 },
    ],
    week: 1,
    lesson: 'w1-l3',
  },
  {
    id: 'step-skip',
    emoji: '👣',
    title: 'Quãng 2 và quãng 3',
    lines: ['Bước 👣: hai phím sát nhau — gọi là QUÃNG 2.', 'Nhảy 🐸: cách một phím — gọi là QUÃNG 3.'],
    short: 'Bước là quãng 2, nhảy là quãng 3.',
    terms: ['quãng 2', 'quãng 3'],
    pic: { kind: 'keys', low: 'C4', high: 'G4', marks: [{ pitch: 'C4', label: 'Đô' }, { pitch: 'D4', label: '2' }, { pitch: 'E4', label: '3' }] },
    sound: [{ p: 'C4', d: 0.6, gap: 0.1 }, { p: 'D4', d: 0.8, gap: 0.6 }, { p: 'C4', d: 0.6, gap: 0.1 }, { p: 'E4', d: 0.8 }],
    checks: [
      {
        q: 'Mi lên Fa: quãng mấy?',
        choices: ['Quãng 2', 'Quãng 3'],
        answer: 0,
        pic: { kind: 'keys', low: 'C4', high: 'G4', marks: [{ pitch: 'E4', label: 'Mi' }, { pitch: 'F4', label: 'Fa' }] },
      },
      {
        q: 'Đô nhảy lên Mi: quãng mấy?',
        choices: ['Quãng 2', 'Quãng 3'],
        answer: 1,
        pic: { kind: 'keys', low: 'C4', high: 'G4', marks: [{ pitch: 'C4', label: 'Đô' }, { pitch: 'E4', label: 'Mi' }] },
      },
    ],
    week: 4,
    lesson: 'w4-l4',
  },
  {
    id: 'note-values',
    emoji: '⏱️',
    title: 'Nốt đen, nốt trắng, nốt tròn',
    lines: ['Nốt đen dài 1 phách: “Đi”.', 'Nốt trắng 2 phách “Đi-i”, nốt tròn 4 phách.', 'Móc đơn nửa phách “Chạy”. Dấu lặng: “Suỵt”.'],
    short: 'Nốt dài ngắn khác nhau: đen 1, trắng 2, tròn 4 phách.',
    terms: ['nốt đen', 'nốt trắng', 'nốt tròn', 'móc đơn', 'dấu lặng'],
    pic: { kind: 'staff', notes: [n('C4', 1), n('D4', 0.5), n('E4', 0.5), rest(1), n('F4', 1), n('E4', 2), n('D4', 2), n('C4', 4)] },
    sound: [
      { p: 'C4', d: 0.55, gap: 0.15 },
      { p: 'D4', d: 0.28, gap: 0.07 },
      { p: 'E4', d: 0.28, gap: 0.77 },
      { p: 'F4', d: 0.55, gap: 0.15 },
      { p: 'E4', d: 1.3, gap: 0.1 },
      { p: 'D4', d: 1.3, gap: 0.1 },
      { p: 'C4', d: 2.6 },
    ],
    checks: [
      { q: 'Nốt trắng dài mấy phách?', choices: ['1 phách', '2 phách', '4 phách'], answer: 1 },
      { q: 'Nốt nào dài 4 phách?', choices: ['Nốt đen', 'Nốt tròn', 'Móc đơn'], answer: 1 },
    ],
    week: 5,
    lesson: 'w5-l1',
  },
  {
    id: 'time-44',
    emoji: '🔢',
    title: 'Số chỉ nhịp 4/4',
    lines: ['Đầu bài có hai số: SỐ CHỈ NHỊP.', 'Số 4 ở trên: mỗi ô nhịp có 4 phách.', 'VẠCH NHỊP chia bài thành từng ô nhịp.'],
    short: 'Nhịp 4/4: mỗi ô nhịp có 4 phách.',
    terms: ['số chỉ nhịp', '4/4', 'ô nhịp', 'vạch nhịp'],
    pic: { kind: 'staff', timeSignature: '4/4', notes: [n('C4', 1), n('D4', 1), n('E4', 1), n('C4', 1), n('E4', 1), n('F4', 1), n('G4', 2)] },
    sound: pulse(['C4', 'D4', 'E4', 'C4', 'E4', 'F4', 'G4', 'G4'], 4),
    checks: [
      { q: 'Nhịp 4/4: mỗi ô có mấy phách?', choices: ['2 phách', '3 phách', '4 phách'], answer: 2 },
      { q: 'Vạch nhịp dùng để làm gì?', choices: ['Chia ô nhịp', 'Đàn to lên', 'Nghỉ một chút'], answer: 0 },
    ],
    week: 5,
    lesson: 'w5-l2',
  },
  {
    id: 'legato',
    emoji: '🌊',
    title: 'Legato: đàn liền',
    lines: ['LEGATO là đàn LIỀN, êm như nước chảy.', 'Giữ phím tới khi nốt sau vang lên.', 'Vòng cung trên các nốt là DẤU LUYẾN.'],
    short: 'Legato: đàn liền. Dấu luyến (vòng cung) nhắc đàn liền.',
    terms: ['legato', 'dấu luyến'],
    pic: { kind: 'staff', notes: [n('C4', 1, { slur: 'start' }), n('D4', 1), n('E4', 1), n('F4', 1), n('G4', 4, { slur: 'end' })] },
    sound: [...seq(['C4', 'D4', 'E4', 'F4'], 0.62, 0), { p: 'G4', d: 1.4 }],
    checks: [
      { q: 'Legato nghĩa là gì?', choices: ['Đàn liền', 'Đàn thật to', 'Nghỉ'], answer: 0 },
      {
        q: 'Vòng cung trên các nốt gọi là gì?',
        choices: ['Dấu luyến', 'Vạch nhịp', 'Dấu lặng'],
        answer: 0,
        pic: { kind: 'staff', notes: [n('E4', 1, { slur: 'start' }), n('D4', 1), n('C4', 2, { slur: 'end' })] },
      },
    ],
    week: 5,
    lesson: 'w5-l4',
  },
  {
    id: 'dynamics',
    emoji: '🦁',
    title: 'p, mf, f: nhỏ, vừa, to',
    lines: ['p (piano) 🐭 là NHỎ. f (forte) 🦁 là TO.', 'mf (mezzo forte) là VỪA VỪA.', 'Chữ nghiêng dưới khuông nhắc con đàn to hay nhỏ.'],
    short: 'p nhỏ 🐭 · mf vừa · f to 🦁.',
    terms: ['p (piano)', 'mf (mezzo forte)', 'f (forte)'],
    pic: { kind: 'signs', items: [{ sign: 'p', label: 'nhỏ 🐭' }, { sign: 'mf', label: 'vừa' }, { sign: 'f', label: 'to 🦁' }] },
    sound: [
      { p: 'E4', d: 0.7, v: 0.25, gap: 0.3 },
      { p: 'E4', d: 0.7, v: 0.6, gap: 0.3 },
      { p: 'E4', d: 0.7, v: 1 },
    ],
    checks: [
      { q: 'Chữ f nghĩa là gì?', choices: ['To 🦁', 'Nhỏ 🐭', 'Chậm lại'], answer: 0 },
      { q: 'Muốn đàn nhỏ, bản nhạc ghi chữ gì?', choices: ['p', 'f', 'mf'], answer: 0 },
    ],
    week: 6,
    lesson: 'w6-l1',
  },
  {
    id: 'dotted-half',
    emoji: '⚪',
    title: 'Nốt trắng chấm: 3 phách',
    lines: ['Dấu chấm bên phải nốt làm nốt DÀI THÊM.', 'Nốt trắng chấm dài 3 phách: “Đi-i-i”.'],
    short: 'Nốt trắng chấm dài 3 phách.',
    terms: ['nốt trắng chấm'],
    pic: { kind: 'staff', notes: [n('G4', 3), n('E4', 1), n('C4', 4)] },
    sound: [{ p: 'G4', d: 1.9, gap: 0.1 }, { p: 'E4', d: 0.55, gap: 0.1 }, { p: 'C4', d: 2.4 }],
    checks: [
      { q: 'Nốt trắng chấm dài mấy phách?', choices: ['2 phách', '3 phách', '4 phách'], answer: 1 },
      { q: 'Dấu chấm làm nốt thế nào?', choices: ['Dài hơn', 'Ngắn hơn', 'To hơn'], answer: 0 },
    ],
    week: 6,
    lesson: 'w6-l4',
  },
  {
    id: 'staff-treble',
    emoji: '🎼',
    title: 'Khuông nhạc và khóa Sol',
    lines: ['Khuông nhạc có 5 dòng kẻ, đếm từ dưới lên.', 'Nốt ngồi TRÊN DÒNG hoặc trong KHE.', 'Khóa Sol cuộn quanh dòng 2: nốt Sol ở đó.'],
    short: 'Khuông 5 dòng; khóa Sol đánh dấu nốt Sol ở dòng 2.',
    terms: ['khuông nhạc', 'khóa Sol', 'dòng & khe'],
    pic: { kind: 'staff', names: true, notes: [n('C4', 1), n('D4', 1), n('E4', 1), n('F4', 1), n('G4', 4)] },
    sound: seq(['C4', 'D4', 'E4', 'F4', 'G4'], 0.5),
    checks: [
      { q: 'Khuông nhạc có mấy dòng kẻ?', choices: ['4 dòng', '5 dòng', '6 dòng'], answer: 1 },
      { q: 'Khóa Sol cuộn quanh nốt nào?', choices: ['Sol', 'Đô', 'Mi'], answer: 0 },
    ],
    week: 8,
    lesson: 'w8-l3',
  },
  {
    id: 'time-24',
    emoji: '⛵',
    title: 'Nhịp 2/4',
    lines: ['Số chỉ nhịp 2/4: mỗi ô nhịp có 2 phách.', 'Đếm “MỘT-hai, MỘT-hai” — phách MỘT mạnh.'],
    short: 'Nhịp 2/4: mỗi ô có 2 phách, phách một mạnh.',
    terms: ['2/4', 'phách mạnh'],
    pic: { kind: 'staff', timeSignature: '2/4', notes: [n('C4', 1), n('E4', 1), n('D4', 1), n('F4', 1), n('E4', 2)] },
    sound: pulse(['C4', 'E4', 'D4', 'F4', 'E4', 'E4'], 2),
    checks: [
      { q: 'Nhịp 2/4: mỗi ô có mấy phách?', choices: ['2 phách', '3 phách', '4 phách'], answer: 0 },
      { q: 'Phách nào mạnh nhất?', choices: ['Phách MỘT', 'Phách hai'], answer: 0 },
    ],
    week: 9,
    lesson: 'w9-l1',
  },
  {
    id: 'bass-clef',
    emoji: '🐝',
    title: 'Khóa Fa cho nốt thấp',
    lines: ['Khóa Fa có hai chấm ôm dòng 4: nốt Fa.', 'Khóa Sol cho nốt cao, khóa Fa cho nốt thấp.', 'Đô giữa nằm giữa hai khóa.'],
    short: 'Khóa Fa: hai chấm ôm dòng Fa — cho nốt thấp, tay trái.',
    terms: ['khóa Fa'],
    pic: { kind: 'staff', clef: 'bass', names: true, notes: [n('C3', 1), n('E3', 1), n('F3', 2), n('G3', 2), n('C4', 2)] },
    sound: [...seq(['C3', 'E3'], 0.5), { p: 'F3', d: 1, gap: 0.15 }, { p: 'G3', d: 0.8, gap: 0.15 }, { p: 'C4', d: 1 }],
    checks: [
      { q: 'Khóa Fa thường dành cho tay nào?', choices: ['Tay trái', 'Tay phải'], answer: 0 },
      { q: 'Hai chấm của khóa Fa ôm nốt nào?', choices: ['Fa', 'Sol', 'Đô'], answer: 0 },
    ],
    week: 11,
    lesson: 'w11-l1',
  },
  {
    id: 'time-34',
    emoji: '💃',
    title: 'Nhịp 3/4: điệu valse',
    lines: ['Số chỉ nhịp 3/4: mỗi ô nhịp có 3 phách.', 'Đếm “MỘT-hai-ba” như đung đưa xích đu.'],
    short: 'Nhịp 3/4: mỗi ô có 3 phách — MỘT-hai-ba.',
    terms: ['3/4'],
    pic: { kind: 'staff', timeSignature: '3/4', notes: [n('C4', 1), n('E4', 1), n('G4', 1), n('G4', 3)] },
    sound: pulse(['C4', 'E4', 'G4', 'G4', 'E4', 'C4'], 3),
    checks: [
      { q: 'Nhịp 3/4: mỗi ô có mấy phách?', choices: ['2 phách', '3 phách', '4 phách'], answer: 1 },
      { q: 'Nốt nào vừa đủ một ô nhịp 3/4?', choices: ['Nốt trắng chấm', 'Nốt tròn'], answer: 0 },
    ],
    week: 11,
    lesson: 'w11-l4',
  },
  {
    id: 'staccato',
    emoji: '🏀',
    title: 'Staccato: đàn ngắt',
    lines: ['STACCATO là đàn NGẮT, nảy như quả bóng.', 'Chấm nhỏ trên hoặc dưới đầu nốt: chạm rồi nhấc ngay.'],
    short: 'Staccato: chấm nhỏ ở đầu nốt — đàn ngắt, nảy.',
    terms: ['staccato'],
    pic: { kind: 'staff', notes: [n('C4', 1, { stac: true }), n('E4', 1, { stac: true }), n('G4', 1, { stac: true }), n('E4', 1, { stac: true }), n('C4', 4)] },
    sound: [...seq(['C4', 'E4', 'G4', 'E4'], 0.14, 0.38), { p: 'C4', d: 1 }],
    checks: [
      { q: 'Chấm nhỏ ở đầu nốt nghĩa là gì?', choices: ['Đàn ngắt', 'Đàn liền', 'Đàn thật to'], answer: 0 },
      { q: 'Ngược với staccato là gì?', choices: ['Legato', 'Forte'], answer: 0 },
    ],
    week: 12,
    lesson: 'w12-l1',
  },
  {
    id: 'interval-45',
    emoji: '🦘',
    title: 'Quãng 4 và quãng 5',
    lines: ['Đếm cả nốt đầu và nốt cuối.', 'Đô lên Fa: 4 nốt — QUÃNG 4.', 'Đô lên Sol: 5 nốt — QUÃNG 5.'],
    short: 'Đô–Fa là quãng 4, Đô–Sol là quãng 5.',
    terms: ['quãng 4', 'quãng 5'],
    pic: { kind: 'staff', names: true, notes: [n('C4', 2), n('F4', 2), n('C4', 2), n('G4', 2)] },
    sound: [{ p: 'C4', d: 0.6, gap: 0.1 }, { p: 'F4', d: 0.8, gap: 0.5 }, { p: 'C4', d: 0.6, gap: 0.1 }, { p: 'G4', d: 0.8 }],
    checks: [
      { q: 'Quãng mấy?', choices: ['Quãng 3', 'Quãng 4', 'Quãng 5'], answer: 2, pic: pair('C4', 'G4') },
      { q: 'Quãng mấy?', choices: ['Quãng 3', 'Quãng 4', 'Quãng 5'], answer: 1, pic: pair('D4', 'G4') },
    ],
    week: 13,
    lesson: 'w13-l4',
  },
  {
    id: 'sharp-flat',
    emoji: '⬛',
    title: 'Dấu thăng ♯ và dấu giáng ♭',
    lines: ['Thăng ♯: lên phím sát bên PHẢI.', 'Giáng ♭: xuống phím sát bên TRÁI.', 'Fa♯ là phím đen ngay bên phải Fa.'],
    short: '♯ lên phím sát bên phải, ♭ xuống phím sát bên trái.',
    terms: ['dấu thăng ♯', 'dấu giáng ♭'],
    pic: {
      kind: 'keys',
      low: 'C4',
      high: 'A4',
      marks: [{ pitch: 'Eb4', label: 'Mi♭' }, { pitch: 'E4', label: 'Mi' }, { pitch: 'F4', label: 'Fa' }, { pitch: 'F#4', label: 'Fa♯' }],
    },
    sound: [{ p: 'F4', d: 0.6, gap: 0.1 }, { p: 'F#4', d: 0.8, gap: 0.5 }, { p: 'E4', d: 0.6, gap: 0.1 }, { p: 'Eb4', d: 0.8 }],
    checks: [
      { q: 'Dấu thăng ♯ đưa nốt đi đâu?', choices: ['Lên phím bên phải', 'Xuống phím bên trái'], answer: 0 },
      { q: 'Mi♭ ở bên nào của Mi?', choices: ['Bên trái', 'Bên phải'], answer: 0 },
    ],
    week: 16,
    lesson: 'w16-l1',
  },
  {
    id: 'natural',
    emoji: '♮',
    title: 'Dấu bình ♮',
    lines: ['Dấu bình ♮ xóa dấu thăng, dấu giáng.', 'Mi♭ gặp dấu bình thì về lại Mi.'],
    short: 'Dấu bình ♮ trả nốt về phím trắng như cũ.',
    terms: ['dấu bình ♮'],
    pic: { kind: 'signs', items: [{ sign: '♯', label: 'thăng' }, { sign: '♭', label: 'giáng' }, { sign: '♮', label: 'bình' }] },
    sound: [{ p: 'Eb4', d: 0.8, gap: 0.3 }, { p: 'E4', d: 1 }],
    checks: [
      { q: 'Dấu ♮ gọi là gì?', choices: ['Dấu bình', 'Dấu thăng', 'Dấu giáng'], answer: 0 },
      { q: 'Fa♯ gặp dấu bình thành nốt gì?', choices: ['Fa', 'Sol', 'Mi'], answer: 0 },
    ],
    week: 16,
    lesson: 'w16-l4',
  },
  {
    id: 'dotted',
    emoji: '🐪',
    title: 'Dấu chấm dôi',
    lines: ['Dấu CHẤM DÔI: nốt dài thêm MỘT NỬA.', 'Nốt đen chấm = 1 phách rưỡi: “Đi-chấm”.'],
    short: 'Chấm dôi: nốt dài thêm một nửa. Đen chấm = 1 phách rưỡi.',
    terms: ['chấm dôi', 'nốt đen chấm'],
    pic: { kind: 'staff', notes: [n('C4', 1.5), n('D4', 0.5), n('E4', 2), n('E4', 1.5), n('D4', 0.5), n('C4', 2)] },
    sound: [
      { p: 'C4', d: 0.85, gap: 0.1 },
      { p: 'D4', d: 0.25, gap: 0.07 },
      { p: 'E4', d: 1.2, gap: 0.1 },
      { p: 'E4', d: 0.85, gap: 0.1 },
      { p: 'D4', d: 0.25, gap: 0.07 },
      { p: 'C4', d: 1.4 },
    ],
    checks: [
      { q: 'Nốt đen chấm dài bao nhiêu?', choices: ['1 phách rưỡi', '2 phách', '1 phách'], answer: 0 },
      { q: 'Nốt trắng chấm dài mấy phách?', choices: ['3 phách', '4 phách'], answer: 0 },
    ],
    week: 17,
    lesson: 'w17-l1',
  },
  {
    id: 'tie',
    emoji: '🔗',
    title: 'Dấu nối hay dấu luyến?',
    lines: ['DẤU NỐI: vòng cung nối hai nốt GIỐNG nhau.', 'Đánh MỘT lần, giữ đủ cả hai nốt.', 'Dấu luyến nối nốt KHÁC nhau: đàn liền.'],
    short: 'Dấu nối: hai nốt giống nhau, đánh một lần, giữ đủ.',
    terms: ['dấu nối'],
    pic: { kind: 'staff', notes: [n('G4', 2, { slur: 'start' }), n('G4', 2, { slur: 'end' }), n('C4', 1, { slur: 'start' }), n('D4', 1), n('E4', 2, { slur: 'end' })] },
    sound: [{ p: 'G4', d: 2.6, gap: 0.3 }, ...seq(['C4', 'D4'], 0.6, 0), { p: 'E4', d: 1.2 }],
    checks: [
      { q: 'Vòng cung nối hai nốt giống nhau là gì?', choices: ['Dấu nối', 'Dấu luyến'], answer: 0 },
      { q: 'Hai nốt có dấu nối: đánh mấy lần?', choices: ['1 lần', '2 lần'], answer: 0 },
    ],
    week: 19,
    lesson: 'w19-l3',
  },
  {
    id: 'half-whole',
    emoji: '🪜',
    title: 'Cung và nửa cung',
    lines: ['NỬA CUNG: hai phím sát nhau, không phím nào ở giữa.', 'Mi–Fa và Si–Đô chỉ cách nửa cung.', 'MỘT CUNG bằng hai nửa cung, như Đô–Rê.'],
    short: 'Nửa cung: hai phím sát nhau. Một cung: hai nửa cung.',
    terms: ['nửa cung', 'một cung'],
    pic: {
      kind: 'keys',
      low: 'C4',
      high: 'C5',
      marks: [{ pitch: 'C4', label: 'Đô' }, { pitch: 'D4', label: 'Rê' }, { pitch: 'E4', label: 'Mi' }, { pitch: 'F4', label: 'Fa' }, { pitch: 'B4', label: 'Si' }, { pitch: 'C5', label: 'Đô' }],
    },
    sound: [{ p: 'E4', d: 0.6, gap: 0.1 }, { p: 'F4', d: 0.8, gap: 0.5 }, { p: 'C4', d: 0.6, gap: 0.1 }, { p: 'D4', d: 0.8 }],
    checks: [
      { q: 'Mi–Fa cách bao nhiêu?', choices: ['Nửa cung', 'Một cung'], answer: 0 },
      { q: 'Đô–Rê cách bao nhiêu?', choices: ['Một cung', 'Nửa cung'], answer: 0 },
    ],
    week: 20,
    lesson: 'w20-l3',
  },
  {
    id: 'chords',
    emoji: '🎹',
    title: 'Hợp âm Đô, Fa, Sol',
    lines: ['HỢP ÂM: ba nốt cách quãng 3, đàn cùng lúc.', 'Đô (C) là I, Fa (F) là IV, Sol (G) là V.', 'Bài Đô trưởng dùng ba hợp âm này nhiều nhất.'],
    short: 'Hợp âm Đô (C) · Fa (F) · Sol (G) = I · IV · V.',
    terms: ['hợp âm', 'C · F · G', 'I – IV – V'],
    pic: {
      kind: 'staff',
      names: false,
      notes: [
        n('C4', 4, { also: [{ pitch: 'E4' }, { pitch: 'G4' }] }),
        n('F4', 4, { also: [{ pitch: 'A4' }, { pitch: 'C5' }] }),
        n('G4', 4, { also: [{ pitch: 'B4' }, { pitch: 'D5' }] }),
      ],
    },
    sound: [
      { p: ['C4', 'E4', 'G4'], d: 1.1, gap: 0.2 },
      { p: ['F4', 'A4', 'C5'], d: 1.1, gap: 0.2 },
      { p: ['G4', 'B4', 'D5'], d: 1.1, gap: 0.2 },
      { p: ['C4', 'E4', 'G4'], d: 1.4 },
    ],
    checks: [
      { q: 'Hợp âm Đô gồm những nốt nào?', choices: ['Đô – Mi – Sol', 'Đô – Rê – Mi'], answer: 0 },
      { q: 'Trong Đô trưởng, hợp âm V là gì?', choices: ['Sol (G)', 'Fa (F)', 'Đô (C)'], answer: 0 },
    ],
    week: 22,
    lesson: 'w22-l1',
  },
  {
    id: 'ledger',
    emoji: '🪜',
    title: 'Dòng kẻ phụ',
    lines: ['Nốt ra ngoài khuông thì mượn DÒNG KẺ PHỤ.', 'Đô giữa đội mũ một dòng kẻ phụ.', 'La, Si dưới khuông cũng cần dòng kẻ phụ.'],
    short: 'Dòng kẻ phụ: vạch ngắn cho nốt ra ngoài khuông.',
    terms: ['dòng kẻ phụ'],
    pic: { kind: 'staff', names: true, notes: [n('A3', 1), n('B3', 1), n('C4', 2), n('G5', 2), n('A5', 2)] },
    sound: [...seq(['A3', 'B3'], 0.5), { p: 'C4', d: 0.8, gap: 0.3 }, { p: 'G5', d: 0.6, gap: 0.1 }, { p: 'A5', d: 0.8 }],
    checks: [
      { q: 'Đô giữa trên khóa Sol có mấy dòng kẻ phụ?', choices: ['1 dòng', '2 dòng', 'Không có'], answer: 0 },
      { q: 'Dòng kẻ phụ dùng khi nào?', choices: ['Nốt ra ngoài khuông', 'Khi đàn to'], answer: 0 },
    ],
    week: 23,
    lesson: 'w23-l1',
  },
  {
    id: 'major-minor',
    emoji: '😊',
    title: 'Hợp âm trưởng và thứ',
    lines: ['TRƯỞNG nghe vui 😊: Đô – Mi – Sol.', 'THỨ nghe buồn 😢: Đô – Mi♭ – Sol.', 'Chỉ khác nốt giữa: thấp xuống nửa cung.'],
    short: 'Trưởng nghe vui 😊, thứ nghe buồn 😢.',
    terms: ['hợp âm trưởng', 'hợp âm thứ'],
    pic: {
      kind: 'keys',
      low: 'C4',
      high: 'A4',
      marks: [{ pitch: 'C4', label: 'Đô' }, { pitch: 'Eb4', label: 'Mi♭' }, { pitch: 'E4', label: 'Mi' }, { pitch: 'G4', label: 'Sol' }],
    },
    sound: [
      { p: ['C4', 'E4', 'G4'], d: 1.3, gap: 0.5 },
      { p: ['C4', 'Eb4', 'G4'], d: 1.5 },
    ],
    checks: [
      { q: 'Hợp âm thứ nghe thế nào?', choices: ['Buồn 😢', 'Vui 😊'], answer: 0 },
      { q: 'Trưởng và thứ khác nhau ở nốt nào?', choices: ['Nốt giữa', 'Nốt thấp nhất'], answer: 0 },
    ],
    week: 25,
    lesson: 'w25-l1',
  },
  {
    id: 'key-sig-g',
    emoji: '🗝️',
    title: 'Dấu hóa theo khóa',
    lines: ['Gam Sol trưởng cần Fa♯ mới nghe đúng.', 'Nên ghi sẵn ♯ ngay sau khóa: DẤU HÓA THEO KHÓA.', 'Mọi nốt Fa trong bài đều đàn Fa♯.'],
    short: 'Dấu hóa theo khóa: ♯/♭ ghi sẵn, đúng cho cả bài.',
    terms: ['dấu hóa theo khóa', 'Sol trưởng: Fa♯'],
    pic: {
      kind: 'keys',
      low: 'G4',
      high: 'G5',
      marks: [{ pitch: 'G4', label: 'Sol' }, { pitch: 'F#5', label: 'Fa♯' }, { pitch: 'G5', label: 'Sol' }],
    },
    sound: seq(['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'], 0.4, 0.06),
    checks: [
      { q: 'Sol trưởng có dấu hóa nào?', choices: ['Fa♯', 'Si♭', 'Không có'], answer: 0 },
      { q: 'Dấu hóa theo khóa đúng cho những nốt nào?', choices: ['Mọi nốt cùng tên', 'Chỉ nốt đầu'], answer: 0 },
    ],
    week: 32,
    lesson: 'w32-l1',
  },
  {
    id: 'key-sig-f',
    emoji: '🗝️',
    title: 'Fa trưởng có Si♭',
    lines: ['Gam Fa trưởng cần Si♭ — một phím đen.', 'Bài Fa trưởng ghi sẵn ♭ sau khóa.', 'Đô trưởng không có dấu hóa nào.'],
    short: 'Fa trưởng: Si♭. Sol trưởng: Fa♯. Đô trưởng: không có.',
    terms: ['Fa trưởng: Si♭'],
    pic: {
      kind: 'keys',
      low: 'F4',
      high: 'F5',
      marks: [{ pitch: 'F4', label: 'Fa' }, { pitch: 'Bb4', label: 'Si♭' }, { pitch: 'F5', label: 'Fa' }],
    },
    sound: seq(['F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5'], 0.4, 0.06),
    checks: [
      { q: 'Fa trưởng có dấu hóa nào?', choices: ['Si♭', 'Fa♯', 'Không có'], answer: 0 },
      { q: 'Đô trưởng có mấy dấu hóa?', choices: ['Không có', '1 dấu', '2 dấu'], answer: 0 },
    ],
    week: 33,
    lesson: 'w33-l1',
  },
  {
    id: 'tempo',
    emoji: '🐎',
    title: 'Chữ chỉ tốc độ',
    lines: ['Andante 🚶 thong thả. Moderato: vừa phải.', 'Allegro 🐎: nhanh và vui.', 'rit. 🐢: chậm dần lại.'],
    short: 'Andante thong thả · Moderato vừa · Allegro nhanh · rit. chậm dần.',
    terms: ['Andante', 'Moderato', 'Allegro', 'rit.'],
    pic: {
      kind: 'signs',
      items: [{ sign: 'Andante', label: '🚶 thong thả' }, { sign: 'Moderato', label: 'vừa phải' }, { sign: 'Allegro', label: '🐎 nhanh' }, { sign: 'rit.', label: '🐢 chậm dần' }],
    },
    sound: [...seq(['C4', 'E4', 'G4', 'E4'], 0.6, 0.15), ...seq(['C4', 'E4', 'G4', 'E4', 'C4', 'E4', 'G4'], 0.2, 0.05), { p: 'C5', d: 1 }],
    checks: [
      { q: 'Allegro nghĩa là gì?', choices: ['Nhanh và vui', 'Thong thả', 'Chậm dần'], answer: 0 },
      { q: 'Chữ rit. bảo con làm gì?', choices: ['Chậm dần', 'Nhanh lên', 'Đàn to'], answer: 0 },
    ],
    week: 39,
    lesson: 'w39-l3',
  },
  {
    id: 'cresc-dim',
    emoji: '🌅',
    title: 'To dần, nhỏ dần',
    lines: ['cresc. (dấu mở rộng) 🌅: TO DẦN lên.', 'dim. (dấu khép lại) 🌙: NHỎ DẦN đi.'],
    short: 'cresc. to dần 🌅 · dim. nhỏ dần 🌙.',
    terms: ['cresc.', 'dim.'],
    pic: { kind: 'signs', items: [{ sign: '<', label: 'cresc. to dần' }, { sign: '>', label: 'dim. nhỏ dần' }] },
    sound: [0.2, 0.35, 0.5, 0.7, 0.9, 1, 0.8, 0.6, 0.4, 0.25].map((v, i) => ({ p: 'E4' as Pitch, d: 0.4, gap: 0.12, v: i === 9 ? 0.2 : v })),
    checks: [
      { q: 'cresc. nghĩa là gì?', choices: ['To dần', 'Nhỏ dần'], answer: 0 },
      { q: 'dim. nghĩa là gì?', choices: ['Nhỏ dần', 'Nhanh dần'], answer: 0 },
    ],
    week: 39,
    lesson: 'w39-l3',
  },
];

export function theoryConcept(id: TheoryId): TheoryConcept {
  const c = THEORY.find((x) => x.id === id);
  if (!c) throw new Error(`Không có khái niệm nhạc lý: ${id}`);
  return c;
}

/** Vị trí thẻ trong giáo trình: [mã bài, chỉ số hoạt động] (null nếu chưa đặt). */
export function theoryCardAt(id: TheoryId): { lessonId: string; index: number; week: number } | null {
  for (const w of WEEKS)
    for (const l of w.lessons) {
      const i = l.activities.findIndex((a) => a.kind === 'theory' && a.ids.includes(id));
      if (i >= 0) return { lessonId: l.id, index: i, week: w.week };
    }
  return null;
}

/**
 * Khái niệm đã MỞ trong Từ điển nhạc nhỏ: thẻ ở tuần TRƯỚC tuần hiện tại (đã qua), hoặc thẻ ở tuần hiện tại/sau mà bé đã
 * học tới (bài chứa thẻ đã xong, hoặc chính hoạt động thẻ đã xong). Bé nhảy tuần (bố mẹ đổi tuần) → mọi tuần trước coi như đã qua.
 */
export function theoryUnlocked(data: Readonly<AppData>): TheoryConcept[] {
  const week = data.progress.currentWeek;
  const done = new Set(data.progress.lessonsCompleted);
  return THEORY.filter((c) => {
    if (c.week < week) return true;
    const at = theoryCardAt(c.id);
    return !!at && (done.has(at.lessonId) || done.has(activityDoneId(at.lessonId, at.index)));
  });
}

/* ---------------- Đố vui nhạc lý (QuizSpec variant 'theory') ---------------- */

export interface TheoryQuestion {
  /** Mã câu (không ghi APP_ASSESSMENT): `${conceptId}:${i}` hoặc `iv:${a}-${b}` */
  key: string;
  q: string;
  choices: string[];
  answer: number;
  pic?: TheoryPic;
  /** Âm phát khi xem đáp án (Quãng mấy?: hai nốt) */
  play?: Pitch[];
}

/** Khái niệm dùng cho đố vui đến hết tuần `upTo` (mặc định: tất cả). */
export function theoryPool(upTo?: number): TheoryConcept[] {
  return THEORY.filter((c) => upTo === undefined || c.week <= upTo);
}

const INTERVAL_POOL: Pitch[] = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const IV_NAMES: Record<number, string> = { 1: 'Quãng 2', 2: 'Quãng 3', 3: 'Quãng 4', 4: 'Quãng 5', 7: 'Quãng 8' };

/** "Quãng mấy?" trên khuông — chỉ các quãng đã có thẻ (và đã học khuông nhạc). null nếu chưa đủ khái niệm. */
export function intervalNameQuestion(pool: readonly TheoryConcept[], rng: () => number): TheoryQuestion | null {
  const has = (id: TheoryId) => pool.some((c) => c.id === id);
  if (!has('staff-treble') || !has('step-skip')) return null;
  const dists = [1, 2, ...(has('interval-45') ? [3, 4] : []), ...(has('octave') ? [7] : [])];
  const d = dists[Math.floor(rng() * dists.length) % dists.length];
  const starts = INTERVAL_POOL.filter((p) => INTERVAL_POOL.some((q) => diatonic(q) - diatonic(p) === d));
  const a = starts[Math.floor(rng() * starts.length) % starts.length];
  const b = INTERVAL_POOL.find((q) => diatonic(q) - diatonic(a) === d)!;
  const names = dists.map((x) => IV_NAMES[x]);
  // ≤ 3 lựa chọn: đáp án + 2 quãng gần nhất
  const others = names.filter((x) => x !== IV_NAMES[d]).sort((x, y) => Math.abs(dists[names.indexOf(x)] - d) - Math.abs(dists[names.indexOf(y)] - d)).slice(0, 2);
  const choices = [IV_NAMES[d], ...others].sort((x, y) => dists[names.indexOf(x)] - dists[names.indexOf(y)]);
  return { key: `iv:${a}-${b}`, q: 'Quãng mấy?', choices, answer: choices.indexOf(IV_NAMES[d]), pic: pair(a, b), play: [a, b] };
}

/** Một câu đố nhạc lý (không lặp câu trước): ~1/3 là "Quãng mấy?" khi đã học đủ. */
export function theoryQuestion(upTo: number | undefined, rng: () => number = Math.random, prevKey?: string): TheoryQuestion {
  const pool = theoryPool(upTo);
  const checks = pool.flatMap((c) => c.checks.map((ch, i): TheoryQuestion => ({ key: `${c.id}:${i}`, ...ch })));
  for (let tries = 0; tries < 12; tries++) {
    const iv = rng() < 0.34 ? intervalNameQuestion(pool, rng) : null;
    const q = iv ?? checks[Math.floor(rng() * checks.length) % checks.length];
    if (q && q.key !== prevKey) return q;
  }
  return checks[0];
}
