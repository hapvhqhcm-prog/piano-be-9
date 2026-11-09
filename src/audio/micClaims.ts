/**
 * (+ 2026-11-09, OWNER chọn "Nút 'App nghe sai!'") BÉ BÁO "APP NGHE SAI" — phần THUẦN (không DOM, không Web Audio).
 *
 * Bối cảnh: thử trên tiếng đàn piano THU THẬT (scripts/micbench, mẫu Salamander) bộ nghe đúng 100% khi đàn một tay,
 * 84–88% khi đàn hai tay — nhưng bé vẫn thấy "nghe không tốt" ở nhà (đàn cơ). Lỗi nằm ở điều kiện thật chưa đo được
 * (micro iPad, phòng, đàn, cách bé đàn) → cần DỮ LIỆU THẬT. Bé chạm "🙉 App nghe sai" thì:
 * 1. bé được đi tiếp ngay (không bực), nốt tính là "đã qua" (không phải "micro nghe đúng");
 * 2. app đoán kiểu lỗi từ nhật ký micro 4 giây gần nhất (classifyClaim) và TỰ SỬA được thì sửa (tăng độ nhạy, bật lại
 *    micro, bù lệch dây — xem claimAction);
 * 3. lưu đoạn tiếng 4 giây + bối cảnh trên iPad (micClaimStore.ts) — bố mẹ gửi được ở ⚙️ Cài đặt để sửa tận gốc.
 */
import type { Sensitivity } from './micAnalyzer';

/** Một sự kiện micro gần đây (MicListener ghi lại, giữ ~6 giây). */
export type MicEvent =
  | { t: number; kind: 'note'; midi: number; cents?: number }
  | { t: number; kind: 'onset' }
  | { t: number; kind: 'near' }
  | { t: number; kind: 'voice'; midi: number }
  | { t: number; kind: 'level'; rms: number; gate: number; floor: number };

/** Nhật ký sự kiện micro dạng vòng (giữ `keepS` giây gần nhất). */
export class MicEventLog {
  private ev: MicEvent[] = [];
  constructor(readonly keepS = 6) {}
  push(e: MicEvent): void {
    this.ev.push(e);
    const cut = e.t - this.keepS;
    let k = 0;
    while (k < this.ev.length && this.ev[k].t < cut) k++;
    if (k) this.ev.splice(0, k);
  }
  since(t: number): MicEvent[] {
    return this.ev.filter((e) => e.t >= t);
  }
  clear(): void {
    this.ev = [];
  }
}

export type ClaimKind =
  /** micro không nhận được gì (tín hiệu ≈ 0) — micro có thể đã bị iPad ngắt */
  | 'deaf'
  /** có tiếng gõ / "suýt nghe" nhưng không ra nốt — đàn khẽ so với độ nhạy */
  | 'quiet'
  /** nghe ra nốt lệch nửa cung so với nốt cần đàn — đàn lệch dây / bù lệch sai */
  | 'semitone'
  /** nghe ra đúng tên nốt nhưng lệch quãng 8 */
  | 'octave'
  /** nghe ra nốt khác hẳn */
  | 'wrong'
  /** micro nghe ra đúng nốt (app có thể chưa kịp xử lý / bé bấm nhầm) */
  | 'heard-right'
  /** chỉ thấy giọng hát / nói */
  | 'voice';

export interface ClaimSummary {
  kind: ClaimKind;
  notes: number[];
  onsets: number;
  nearMisses: number;
  /** RMS lớn nhất / ngưỡng lúc đó (< 1 = dưới ngưỡng) */
  peakOverGate: number;
  /** RMS lớn nhất trong cửa sổ */
  peakRms: number;
  /** Hướng lệch nửa cung (+1 = micro nghe CAO hơn nốt cần đàn) */
  semitoneDir?: 1 | -1;
}

/**
 * Đoán kiểu lỗi từ nhật ký `windowS` giây trước lúc bé chạm. `expected` = nốt (MIDI) đang chờ bé đàn.
 */
export function classifyClaim(expected: readonly number[], events: readonly MicEvent[], now: number, windowS = 4): ClaimSummary {
  const ev = events.filter((e) => e.t >= now - windowS && e.t <= now + 0.05);
  const notes = ev.filter((e): e is Extract<MicEvent, { kind: 'note' }> => e.kind === 'note').map((e) => e.midi);
  const onsets = ev.filter((e) => e.kind === 'onset').length;
  const nearMisses = ev.filter((e) => e.kind === 'near').length;
  const voices = ev.filter((e) => e.kind === 'voice').length;
  let peakRms = 0;
  let peakOverGate = 0;
  for (const e of ev)
    if (e.kind === 'level') {
      if (e.rms > peakRms) peakRms = e.rms;
      if (e.gate > 0 && e.rms / e.gate > peakOverGate) peakOverGate = e.rms / e.gate;
    }
  const base = { notes, onsets, nearMisses, peakOverGate, peakRms };
  const exp = new Set(expected);
  if (!notes.length) {
    if (voices && !onsets) return { kind: 'voice', ...base };
    // tín hiệu gần như im lặng tuyệt đối (iOS ngắt micro trả toàn số 0 / rất nhỏ)
    if (peakRms < 1e-5 && !onsets) return { kind: 'deaf', ...base };
    return { kind: 'quiet', ...base };
  }
  // nốt nghe GẦN NHẤT quyết định (bé thường chạm ngay sau lần đàn bị chấm sai)
  const last = notes[notes.length - 1];
  if (exp.has(last)) return { kind: 'heard-right', ...base };
  const d = Math.min(...expected.map((m) => Math.abs(last - m)));
  if (d === 1) {
    const near = expected.reduce((a, b) => (Math.abs(last - b) < Math.abs(last - a) ? b : a));
    return { kind: 'semitone', ...base, semitoneDir: last > near ? 1 : -1 };
  }
  if (expected.some((m) => m !== last && (last - m) % 12 === 0)) return { kind: 'octave', ...base };
  return { kind: 'wrong', ...base };
}

export type ClaimAction =
  | { type: 'sensitivity'; to: Sensitivity }
  | { type: 'restart-mic' }
  | { type: 'tuning'; cents: number }
  | { type: 'none' };

const NEXT_SENS: Record<Sensitivity, Sensitivity | null> = { low: 'normal', normal: 'high', high: null };
/** Bù lệch dây mỗi lần (cents) và giới hạn */
export const CLAIM_TUNE_STEP = 20;
export const CLAIM_TUNE_MAX = 60;

/**
 * App tự sửa gì (an toàn, mỗi lần một bước nhỏ):
 * - 'deaf' → bật lại micro;
 * - 'quiet' → tăng độ nhạy một bậc (Cao rồi thì thôi);
 * - 'semitone' lần thứ 2 cùng hướng trong buổi → bù lệch dây 20 cents (tối đa ±60) — chỉ khi chưa có bảng tự chỉnh dây;
 * - còn lại → chỉ ghi lại (cần người xem đoạn tiếng).
 * `recentSemis` = hướng lệch nửa cung của các lần báo TRƯỚC trong buổi (không gồm lần này).
 */
export function claimAction(
  s: ClaimSummary,
  st: { sensitivity: Sensitivity; tuningCents: number; autoTuned: boolean; recentSemis: ReadonlyArray<1 | -1> },
): ClaimAction {
  if (s.kind === 'deaf') return { type: 'restart-mic' };
  if (s.kind === 'quiet') {
    const to = NEXT_SENS[st.sensitivity];
    return to ? { type: 'sensitivity', to } : { type: 'none' };
  }
  if (s.kind === 'semitone' && s.semitoneDir && !st.autoTuned && st.recentSemis.includes(s.semitoneDir)) {
    // micro nghe CAO hơn → đàn nhà lên dây cao hơn chuẩn → bù dương (pitchDetect trừ tuningCents trước khi làm tròn)
    const cents = Math.max(-CLAIM_TUNE_MAX, Math.min(CLAIM_TUNE_MAX, st.tuningCents + s.semitoneDir * CLAIM_TUNE_STEP));
    return cents !== st.tuningCents ? { type: 'tuning', cents } : { type: 'none' };
  }
  return { type: 'none' };
}

/** Câu cảm ơn cho bé (ngắn, không đổ lỗi cho bé). */
export function claimMessage(s: ClaimSummary, a: ClaimAction): string {
  if (a.type === 'restart-mic') return '🙉 Micro vừa bị iPad tắt — app đã bật lại rồi. Cảm ơn con!';
  if (a.type === 'sensitivity') return '🙉 App sẽ nghe kỹ hơn (tai thính hơn). Cảm ơn con!';
  if (a.type === 'tuning') return '🙉 App đã chỉnh tai cho hợp với đàn nhà mình. Cảm ơn con!';
  if (s.kind === 'heard-right') return '👍 App nghe đúng rồi đó — mình đi tiếp nhé!';
  return '🙉 App đã ghi lại để học nghe tốt hơn. Cảm ơn con!';
}

// ---------------------------------------------------------------- âm thanh: giảm mẫu + WAV

/** Giảm mẫu ×k (trung bình k mẫu — đủ cho chẩn đoán, nốt giáo trình < 1,4 kHz). */
export function downsample(x: Float32Array, k: number): Float32Array {
  if (k <= 1) return x.slice();
  const out = new Float32Array(Math.floor(x.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += x[i * k + j];
    out[i] = s / k;
  }
  return out;
}

/** Float → PCM 16 bit có chuẩn hóa nhẹ (tiếng micro thô rất nhỏ: nhân tối đa ×64 để nghe được, ghi hệ số vào bối cảnh). */
export function toPcm16(x: Float32Array): { pcm: Int16Array; gain: number } {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const gain = peak > 0 ? Math.min(64, 0.9 / peak) : 1;
  const pcm = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * gain * 32767)));
  return { pcm, gain };
}

/** PCM 16 bit mono → tệp WAV. */
export function wavBytes(pcm: Int16Array, sampleRate: number): Uint8Array {
  const data = pcm.length * 2;
  const b = new ArrayBuffer(44 + data);
  const v = new DataView(b);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data, true);
  new Int16Array(b, 44).set(pcm);
  return new Uint8Array(b);
}
