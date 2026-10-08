import { gateFor, MIN_GATE, type Sensitivity } from './micAnalyzer';
import { nearestNote } from './pitchDetect';

/**
 * TỰ CHỈNH ĐỘ NHẠY sau "Kiểm tra 5 nốt" (OWNER 2026-10-06: "iPad đã nghe được nhưng chưa tốt lắm").
 * Hàm THUẦN — màn "Thử micro" đưa số đo từng nốt vào, nhận lại độ nhạy nên dùng + lý do + lời khuyên.
 *
 * Cách nghĩ: một nốt chỉ được nhận khi tiếng đàn (RMS sau lọc) vượt NGƯỠNG × 1,5 (để bắt được lần gõ phím),
 * NGƯỠNG = mức ồn nền × hệ số độ nhạy (SENSITIVITY: Thấp 5 / Vừa 2,2 / Cao 1,6), không dưới MIN_GATE của độ nhạy đó.
 * Với mỗi độ nhạy tính "độ dư" = tiếng to nhất ÷ (1,5 × ngưỡng) của từng nốt; chọn độ nhạy ÍT nhạy nhất mà vẫn
 * dư ≥ SAFE_MARGIN (bớt nghe nhầm tiếng ồn), trừ khi phòng yên tĩnh thì giữ "Vừa".
 *
 * 2026-10-08 (OWNER: "phải đánh thật to mới nghe"): lúc kiểm tra bé thường đàn rõ hơn lúc học → độ dư cần ≥ 1,5
 * (trước 1,3); nghe ĐÚNG cả 5 nốt nhưng độ dư mỏng (= phải đàn to mới nghe) cũng chuyển sang nhạy hơn.
 */

export interface NoteCheck {
  /** Nốt cần đàn (MIDI) */
  want: number;
  result: 'ok' | 'wrong' | 'none';
  /** Các nốt micro nghe được (MIDI) */
  heard: number[];
  maxRms: number;
  floor: number;
  /** Ngưỡng lúc đo (theo độ nhạy đang dùng) */
  gate: number;
  bestClarity: number;
  /** Nốt "ứng viên" từ các khung có cao độ (nhiều khung nhất trước) */
  candidates?: Candidate[];
}

export interface Candidate {
  midi: number;
  frames: number;
  /** Độ rõ cao nhất (0–1) */
  clarity: number;
  /** Lệch trung bình so với nốt chuẩn (cents, đã bù đàn nhà) */
  cents: number;
}

export type TuneTip = 'calibrate' | 'quiet' | 'closer';

export interface TuneAdvice {
  sensitivity: Sensitivity;
  changed: boolean;
  /** "vì tiếng đàn tới micro khá nhỏ" */
  reason: string;
  /** Câu hiện cho phụ huynh, vd "Đã tự chỉnh độ nhạy: Cao — vì tiếng đàn tới micro khá nhỏ" */
  message: string;
  tips: TuneTip[];
  /** Độ dư đại diện ở từng độ nhạy (nhật ký) */
  margin: Record<Sensitivity, number>;
}

export const SENS_NAME: Record<Sensitivity, string> = { low: 'Thấp', normal: 'Vừa', high: 'Cao' };
/** Độ dư tối thiểu để coi là "chắc ăn" ở một độ nhạy. */
export const SAFE_MARGIN = 1.5;
/** Mức ồn nền (RMS sau lọc) từ đây trở lên coi là phòng ồn → ưu tiên độ nhạy Thấp nếu tiếng đàn đủ to. */
export const NOISY_FLOOR = 0.004;
/** Thứ tự độ nhạy (Thấp < Vừa < Cao). */
const RANK: Record<Sensitivity, number> = { low: 0, normal: 1, high: 2 };

/** Độ dư của một nốt ở độ nhạy `s`. */
export function noteMargin(c: Pick<NoteCheck, 'maxRms' | 'floor'>, s: Sensitivity): number {
  return c.maxRms / (1.5 * gateFor(Math.max(0, c.floor), s));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Đại diện "phần lớn các nốt": nốt nhỏ nhất, hoặc nhỏ nhì khi có ≥ 4 nốt (bỏ một lần bé lỡ đàn quá nhẹ / quên đàn). */
function representative(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length >= 4 ? s[1] : (s[0] ?? 0);
}

export function chooseSensitivity(checks: NoteCheck[], current: Sensitivity): TuneAdvice {
  const used = checks.filter((c) => c.maxRms > 0);
  const margin = {
    low: representative(used.map((c) => noteMargin(c, 'low'))),
    normal: representative(used.map((c) => noteMargin(c, 'normal'))),
    high: representative(used.map((c) => noteMargin(c, 'high'))),
  };
  const tips: TuneTip[] = [];
  // Nốt bị sót/nghe sai dù tiếng ĐỦ TO → không phải do độ nhạy: đàn lệch dây hoặc phòng ồn
  const loudMiss = checks.filter((c) => c.result !== 'ok' && c.maxRms > 0 && c.maxRms >= 1.5 * Math.max(MIN_GATE.high, c.gate));
  if (loudMiss.length >= 2) {
    const semitone = loudMiss.some(
      (c) =>
        c.heard.some((m) => Math.abs(m - c.want) === 1) ||
        (c.candidates?.[0] && (Math.abs(c.candidates[0].midi - c.want) === 1 || Math.abs(c.candidates[0].cents) > 30)),
    );
    tips.push(semitone ? 'calibrate' : 'quiet');
  }
  if (!used.length) {
    return {
      sensitivity: current,
      changed: false,
      reason: 'micro chưa nghe thấy tiếng nào',
      message: 'Chưa tự chỉnh được: micro chưa nghe thấy tiếng nào. Kiểm tra quyền micro rồi bấm "Kiểm tra lại".',
      tips,
      margin,
    };
  }
  const allOk = checks.length > 0 && checks.every((c) => c.result === 'ok');
  const noisy = median(used.map((c) => c.floor)) >= NOISY_FLOOR;
  let pick: Sensitivity;
  let reason: string;
  if (margin.normal >= SAFE_MARGIN) {
    if (noisy && margin.low >= SAFE_MARGIN) {
      pick = 'low';
      reason = 'vì phòng hơi ồn mà tiếng đàn tới micro đủ to';
    } else {
      pick = 'normal';
      reason = 'vì tiếng đàn tới micro vừa đủ rõ';
    }
  } else {
    pick = 'high';
    reason = 'vì tiếng đàn tới micro khá nhỏ';
    if (margin.high < 1) tips.push('closer');
  }
  // Đang nghe đúng cả 5 nốt mà độ nhạy hiện tại còn dư → không cần nhạy hơn (chỉ đổi khi bớt nhạy được)
  if (allOk && margin[current] >= SAFE_MARGIN && RANK[pick] > RANK[current]) {
    pick = current;
    reason = 'micro đã nghe tốt với đàn nhà';
  }
  const changed = pick !== current;
  return {
    sensitivity: pick,
    changed,
    reason,
    message: changed ? `Đã tự chỉnh độ nhạy: ${SENS_NAME[pick]} — ${reason}.` : `Giữ độ nhạy: ${SENS_NAME[pick]} — ${reason}.`,
    tips,
    margin,
  };
}

/** Đếm nốt "ứng viên" từ từng khung có cao độ (nhật ký + phát hiện đàn lệch nửa cung). */
export class CandidateTally {
  private map = new Map<number, { frames: number; clarity: number; centsSum: number }>();

  add(freq: number, clarity: number, tuningCents = 0): void {
    if (!(freq > 0) || clarity < 0.5) return;
    const n = nearestNote(freq, tuningCents);
    const e = this.map.get(n.midi) ?? { frames: 0, clarity: 0, centsSum: 0 };
    e.frames++;
    e.clarity = Math.max(e.clarity, clarity);
    e.centsSum += n.cents;
    this.map.set(n.midi, e);
  }

  top(n = 3): Candidate[] {
    return [...this.map.entries()]
      .map(([midi, e]) => ({
        midi,
        frames: e.frames,
        clarity: Math.round(e.clarity * 100) / 100,
        cents: Math.round(e.centsSum / e.frames),
      }))
      .sort((a, b) => b.frames - a.frames || b.clarity - a.clarity)
      .slice(0, n);
  }
}
