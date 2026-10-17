/**
 * (+ 2026-10-17, OWNER duyệt "Nhạc đệm + bài vui hơn") TRỐNG NHỊP VUI cho lượt THEO NHỊP — chơi cùng tiếng "tích" và
 * (micro tắt) bè đệm piano `accompaniment(t, style)`. Kiểu đánh theo kiểu nhạc đệm bé đã chọn / mở khóa (🥁 Nhạc đệm —
 * tune.ts BackingStyle).
 *
 * VÌ SAO là tiếng "trống" tần số cao, không phải bè piano, khi MICRO BẬT: đo bằng mô phỏng (tests/backingMic.test.ts,
 * tuần 4–6, đàn nhẹ + lọc ồn iOS): bè đệm piano lọt vào micro làm tỉ lệ nốt nhận ngay lần đầu tụt 100 % → 64 % (đệm nhỏ)
 * / 57 % (đệm vừa) / 24 % (kiểu 'bounce') — hợp âm đệm được chọn ĐÚNG theo nốt giai điệu nên trùng tên nốt, không lọc
 * được. Tiếng trống ở đây là sóng sin ≥ GROOVE_MIN_HZ (như tiếng tích ≥ 5 kHz): bộ lọc thông thấp bậc 4 của micAnalyzer
 * (1,6 kHz) chặn > 40 dB → micro nghe đàn như khi chỉ có tiếng tích (cùng test chứng minh).
 */
import { beatsPerMeasure, isCompound, noteUnit, totalBeats, type BackingStyle, type Tune } from './tune';

/** Tần số thấp nhất của mọi tiếng trống nhịp (≥ tiếng tích thường 5 kHz — AudioEngine cũng chặn dưới ở CLICK.hz). */
export const GROOVE_MIN_HZ = 6500;

export interface GrooveHit {
  /** Phách (tính từ 0 = phách đầu bài) */
  beat: number;
  /** Tần số (Hz, ≥ GROOVE_MIN_HZ) */
  hz: number;
  /** Âm lượng đỉnh (tiếng tích thường 0,3 · phách mạnh 0,5) */
  gain: number;
  /** Hằng số tắt dần (giây) — dài hơn = "xì" như lắc / chũm chọe */
  tau: number;
}

const SHAKER = { hz: 8000, tau: 0.012 } as const;
const HAT = { hz: 7200, tau: 0.022 } as const;
const SNARE = { hz: GROOVE_MIN_HZ, tau: 0.035 } as const;

/**
 * Các tiếng trống nhịp của bài theo kiểu `style` (chỉ CHÈN giữa / chồng lên tiếng tích — phách vẫn do tiếng tích giữ):
 * - basic: lắc nhẹ ở nửa phách ("tích – xì – tích – xì");
 * - march: trống con ở phách nhẹ + lắc "dồn" trước phách 1;
 * - arpeggio: lắc đều móc kép (rộn ràng);
 * - bounce: chũm chọe ở nửa phách (nảy nảy).
 * Nhịp ghép 6/8 hay bài tính phách bằng móc đơn: không thêm (tiếng tích đã dày) → [].
 */
export function groove(t: Tune, style: BackingStyle): GrooveHit[] {
  if (isCompound(t) || noteUnit(t) !== 1) return [];
  const n = beatsPerMeasure(t);
  const total = totalBeats(t);
  const out: GrooveHit[] = [];
  const add = (beat: number, s: { hz: number; tau: number }, gain: number) => {
    if (beat < total - 1e-6) out.push({ beat, hz: s.hz, gain, tau: s.tau });
  };
  for (let b = 0; b < total - 1e-6; b++) {
    const pos = b % n;
    if (style === 'basic') add(b + 0.5, SHAKER, 0.12);
    else if (style === 'march') {
      if (pos % 2 === 1 || (n === 3 && pos === 2)) add(b, SNARE, 0.2);
      if (pos === n - 1) add(b + 0.5, SHAKER, 0.12);
    } else if (style === 'arpeggio') {
      add(b + 0.25, SHAKER, 0.07);
      add(b + 0.5, SHAKER, 0.12);
      add(b + 0.75, SHAKER, 0.07);
    } else add(b + 0.5, HAT, 0.22);
  }
  return out;
}

/**
 * Lượt theo nhịp phát gì ngoài tiếng tích: bố mẹ bật "nhạc đệm" (settings.accompaniment, mặc định BẬT) và bé không chọn
 * "🔔 Chỉ tiếng tích" → trống nhịp vui; bè đệm piano CHỈ khi micro tắt (micro bật: bè piano che mất tiếng đàn của bé).
 */
export function backingPlan(o: { parentOn: boolean; mic: boolean; clickOnly: boolean }): { pitched: boolean; groove: boolean } {
  const on = o.parentOn && !o.clickOnly;
  return { pitched: on && !o.mic, groove: on };
}
