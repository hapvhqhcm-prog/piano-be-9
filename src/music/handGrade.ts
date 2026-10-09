/**
 * (+ 2026-10-09) CHẤM BÀI HAI TAY BẰNG MICRO — kết quả theo TỪNG TAY, TỪNG NỐT (OWNER duyệt "Chấm bài 2 tay bằng micro").
 *
 * Kiểu dữ liệu dùng chung giữa phần chấm (src/ui/screens/song.ts + src/audio/twoHand.ts) và màn kết quả / nhận xét
 * sau bài (tô màu khuông, phân tích nhịp). Hàm thuần — không Web Audio, không DOM.
 */
import type { Hand } from '../piano/fingering';

/**
 * Kết quả một tay ở một nhóm nốt (một thời điểm của bài):
 * - 'hit'     micro nghe thấy đủ nốt của tay này, vừa được đàn (không phải nốt cũ còn ngân)
 * - 'miss'    không nghe thấy (bé quên tay này / đàn quá nhẹ / quá trễ)
 * - 'wrong'   nghe thấy một phím KHÁC ở gần (lệch 1–2 phím) thay cho nốt cần đàn
 * - 'unknown' micro không kết luận được (tiếng nhỏ / phòng ồn / app đang phát) — không tính đúng, không tính sai
 * - 'parent'  bố mẹ bấm "👪 tiếp" (chế độ chờ) — trung tính
 */
export type HandVerdict = 'hit' | 'miss' | 'wrong' | 'unknown' | 'parent';

/** Một tay ở một nhóm nốt. */
export interface HandNoteResult {
  /** `TimedNote.index` của các nốt tay này trong nhóm (dùng để tô khuông: staff.mark(i, …)) */
  indices: number[];
  hand: Hand;
  /** Nốt cần đàn (MIDI) */
  midis: number[];
  /** Phách bắt đầu của nhóm (tính từ 0) */
  beat: number;
  /** Ô nhịp (0-based) */
  measure: number;
  verdict: HandVerdict;
  /** Theo nhịp: lệch so với phách (phách; dương = trễ). Chỉ có khi 'hit'. */
  offset?: number;
  /** 'wrong': phím micro nghe được thay cho nốt cần đàn (MIDI) */
  heard?: number;
  /** Nhóm có cả hai tay đàn cùng lúc (false = chỉ một tay — chấm bằng đường một nốt như cũ) */
  together: boolean;
}

/** Tổng hợp một tay. */
export interface HandTally {
  hits: number;
  total: number;
}

/**
 * Kết quả chấm hai tay của một lượt — `notes` theo thứ tự nhóm (mỗi nhóm 1–2 mục: RH rồi LH).
 * Màn kết quả đọc `songScreen`… → `lastHands` (xem song.ts) hoặc SongRun.hands (tổng hợp, lưu vào dữ liệu).
 */
export interface TwoHandRun {
  mode: 'wait' | 'tempo';
  notes: HandNoteResult[];
  RH: HandTally;
  LH: HandTally;
}

/** Tổng hợp theo tay ('unknown' không tính vào tổng; 'parent' tính như chưa nghe được). */
export function tallyHands(notes: HandNoteResult[]): { RH: HandTally; LH: HandTally } {
  const t = { RH: { hits: 0, total: 0 }, LH: { hits: 0, total: 0 } };
  for (const n of notes) {
    if (n.verdict === 'unknown') continue;
    t[n.hand].total++;
    if (n.verdict === 'hit') t[n.hand].hits++;
  }
  return t;
}

/** Một lần micro kiểm tra hai tay quanh một lần gõ phím (theo nhịp). */
export interface HandsProbe {
  /** phách của lần gõ (đã trừ độ trễ) */
  beat: number;
  RH?: 'hit' | 'miss' | 'wrong';
  LH?: 'hit' | 'miss' | 'wrong';
  /** phím nghe được khi 'wrong' */
  heardRH?: number;
  heardLH?: number;
  conclusive: boolean;
}

/**
 * Theo nhịp: gán các lần kiểm tra (mỗi lần gõ phím một lần) cho nhóm hai tay. Một tay "trúng" nếu có lần gõ trong
 * cửa sổ [phách − early, phách + late] nghe thấy tay đó; nhiều lần → lấy lần gần phách nhất. Không trúng: có lần
 * kết luận được trong cửa sổ báo 'wrong' → 'wrong'; có lần kết luận được → 'miss'; không có lần nào kết luận được
 * → 'unknown' nếu có lần gõ, 'miss' nếu im lặng.
 */
export function gradeHandsTempo(
  groups: Array<{ beat: number; measure: number; parts: Array<{ hand: Hand; midis: number[]; indices: number[] }> }>,
  probes: HandsProbe[],
  early: number,
  late: number,
): HandNoteResult[] {
  const out: HandNoteResult[] = [];
  for (const g of groups) {
    const near = probes.filter((p) => p.beat - g.beat >= -early && p.beat - g.beat <= late);
    for (const part of g.parts) {
      const base = { indices: part.indices, hand: part.hand, midis: part.midis, beat: g.beat, measure: g.measure, together: true };
      const hits = near.filter((p) => p.conclusive && p[part.hand] === 'hit');
      if (hits.length) {
        const best = hits.reduce((a, b) => (Math.abs(b.beat - g.beat) < Math.abs(a.beat - g.beat) ? b : a));
        out.push({ ...base, verdict: 'hit', offset: best.beat - g.beat });
        continue;
      }
      const wrong = near.find((p) => p.conclusive && p[part.hand] === 'wrong');
      if (wrong) {
        const heard = part.hand === 'RH' ? wrong.heardRH : wrong.heardLH;
        out.push({ ...base, verdict: 'wrong', ...(heard !== undefined ? { heard } : {}) });
        continue;
      }
      const verdict = near.some((p) => p.conclusive) ? 'miss' : near.length ? 'unknown' : 'miss';
      out.push({ ...base, verdict });
    }
  }
  return out;
}
