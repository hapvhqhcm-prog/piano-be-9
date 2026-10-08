import { freqToMidi } from '../audio/pitchDetect';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';

/**
 * HÁT TRƯỚC KHI ĐÀN (OWNER duyệt 2026-10-08): app đàn 2–3 nốt, bé HÁT lại từng nốt, rồi mới đàn.
 * Hàm thuần (không DOM / Web Audio) → test bằng tiếng hát tổng hợp (tests/singMatch.test.ts).
 *
 * Giọng hát khác tiếng đàn: có rung (vibrato ±30 cent), "vuốt" lên ở đầu nốt (scoop), có khi hát thấp/cao một quãng 8
 * → so CAO ĐỘ THEO TÊN NỐT (bỏ quãng 8), lấy TRUNG VỊ của đoạn khung ỔN ĐỊNH dài nhất, dung sai ±50 cent. Dễ dãi:
 * hát lệch không bao giờ bị chê — chỉ gợi ý "cao hơn / thấp hơn một chút".
 */

/** Một khung micro: tần số (null = không có cao độ rõ / im) và độ rõ YIN. `t` tính bằng giây. */
export interface SingFrame {
  t: number;
  freq: number | null;
  clarity: number;
}

/** Tầm giọng thoải mái của bé trai 9 tuổi: La3 – Rê5. Nốt app bắt hát phải nằm trong tầm này. */
export const SING_RANGE: [Pitch, Pitch] = ['A3', 'D5'];
export const inSingRange = (p: Pitch): boolean =>
  pitchToMidi(p) >= pitchToMidi(SING_RANGE[0]) && pitchToMidi(p) <= pitchToMidi(SING_RANGE[1]);

export interface SingOptions {
  /** Độ rõ YIN tối thiểu để coi khung là "đang hát" (giọng hát kém rõ hơn tiếng đàn) */
  minClarity: number;
  /** Tần số hợp lệ của giọng (Hz) — ngoài khoảng này coi như tiếng ồn */
  minFreq: number;
  maxFreq: number;
  /** Bỏ đoạn đầu của mỗi nốt hát (giây) — chỗ "vuốt" lên */
  skipStart: number;
  /** Hai khung liền nhau lệch dưới mức này (nửa cung) thì còn cùng một đoạn ổn định (rung ±30 cent vẫn lọt) */
  stableStep: number;
  /** Đoạn ổn định ngắn nhất (giây) để tin */
  minStable: number;
  /** Nghe đủ ngần này giây tiếng hát thì có thể kết luận */
  minVoiced: number;
  /** Đang hát mà im ngần này giây → nốt hát đã xong */
  endSilence: number;
  /** Hát liền một hơi quá ngần này giây → chấm luôn (không chờ im) */
  maxVoiced: number;
  /** Khoảng im ngắn hơn mức này không cắt nốt (lấy hơi, khung nhiễu) */
  gapTolerance: number;
}

export const SING_DEFAULTS: SingOptions = {
  minClarity: 0.6,
  minFreq: 80,
  maxFreq: 1100,
  skipStart: 0.12,
  stableStep: 0.45,
  minStable: 0.2,
  minVoiced: 0.45,
  endSilence: 0.3,
  maxVoiced: 1.6,
  gapTolerance: 0.12,
};

const voiced = (f: SingFrame, o: SingOptions): f is SingFrame & { freq: number } =>
  f.freq !== null && f.clarity >= o.minClarity && f.freq >= o.minFreq && f.freq <= o.maxFreq;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface SungEstimate {
  /** Cao độ ước tính (MIDI số thực, A4 = 69, không bù độ lệch đàn — so với tiếng app phát) */
  midi: number;
  /** Số khung ổn định dùng để ước */
  frames: number;
}

/**
 * Cao độ của MỘT nốt hát: bỏ khung không rõ, bỏ `skipStart` giây đầu (vuốt), tìm ĐOẠN ỔN ĐỊNH dài nhất
 * (các khung liền nhau lệch < stableStep nửa cung) rồi lấy trung vị. Đoạn ổn định quá ngắn → trung vị mọi khung còn lại
 * (nếu đủ 5 khung). Không đủ → null.
 */
export function estimateSungMidi(frames: SingFrame[], opts: Partial<SingOptions> = {}): SungEstimate | null {
  const o = { ...SING_DEFAULTS, ...opts };
  const v = frames.filter((f) => voiced(f, o));
  if (!v.length) return null;
  const t0 = v[0].t;
  const kept = v.filter((f) => f.t - t0 >= o.skipStart - 1e-9);
  const pts = (kept.length >= 3 ? kept : v).map((f) => ({ t: f.t, m: freqToMidi(f.freq!) }));
  // Đoạn ổn định dài nhất (theo thời gian)
  let best: typeof pts = [];
  let run: typeof pts = [];
  for (const p of pts) {
    const prev = run[run.length - 1];
    if (prev && Math.abs(p.m - prev.m) < o.stableStep) run.push(p);
    else run = [p];
    const dur = (r: typeof pts) => (r.length ? r[r.length - 1].t - r[0].t : 0);
    if (run.length > best.length || (run.length === best.length && dur(run) > dur(best))) best = [...run];
  }
  const span = best.length ? best[best.length - 1].t - best[0].t : 0;
  if (best.length >= 3 && span >= o.minStable - 1e-9) return { midi: median(best.map((p) => p.m)), frames: best.length };
  if (pts.length >= 5) return { midi: median(pts.map((p) => p.m)), frames: pts.length };
  return null;
}

export interface SingVerdict {
  /** Đúng tên nốt (bỏ quãng 8) trong ±tolCents */
  ok: boolean;
  /** Chưa đúng nhưng gần (≤ 150 cent) — vẫn khen "gần đúng rồi" */
  close: boolean;
  /** Lệch so với nốt cần hát (cent, sau khi bỏ quãng 8): dương = cao hơn */
  cents: number;
  /** Bé hát ở quãng 8 nào so với nốt app: −1 = thấp hơn một quãng 8, 0 = cùng, +1 = cao hơn */
  octave: number;
  /** Gợi ý: 'ok' | hát 'high' (cao quá → hạ xuống) | 'low' (thấp quá → nâng lên) */
  direction: 'ok' | 'high' | 'low';
}

export const SING_TOL_CENTS = 50;
export const SING_CLOSE_CENTS = 150;

/** So nốt hát với nốt cần hát theo TÊN NỐT (chấp nhận hát thấp/cao một quãng 8). */
export function matchSung(sungMidi: number, target: Pitch | number, tolCents = SING_TOL_CENTS): SingVerdict {
  const tm = typeof target === 'number' ? target : pitchToMidi(target);
  const diff = sungMidi - tm;
  const octave = Math.round(diff / 12);
  const cents = Math.round((diff - octave * 12) * 100);
  const ok = Math.abs(cents) <= tolCents;
  return {
    ok,
    close: !ok && Math.abs(cents) <= SING_CLOSE_CENTS,
    cents,
    octave,
    direction: ok ? 'ok' : cents > 0 ? 'high' : 'low',
  };
}

/**
 * Nghe MỘT nốt hát theo thời gian thực: đẩy từng khung micro vào; khi đã nghe đủ tiếng hát (≥ minVoiced) rồi bé
 * ngừng (im ≥ endSilence) — hoặc hát liền quá maxVoiced — thì trả về ước lượng (một lần), rồi tự đặt lại.
 */
export class SungNoteListener {
  private frames: SingFrame[] = [];
  private voicedFrom = -1;
  private lastVoiced = -1;
  private readonly o: SingOptions;

  constructor(opts: Partial<SingOptions> = {}) {
    this.o = { ...SING_DEFAULTS, ...opts };
  }

  reset(): void {
    this.frames = [];
    this.voicedFrom = -1;
    this.lastVoiced = -1;
  }

  /** Đã nghe thấy tiếng hát (để màn hiện "đang nghe con hát…") */
  get hearing(): boolean {
    return this.voicedFrom >= 0;
  }

  push(f: SingFrame): SungEstimate | null {
    const isV = voiced(f, this.o);
    if (isV) {
      if (this.voicedFrom < 0) this.voicedFrom = f.t;
      this.lastVoiced = f.t;
      this.frames.push(f);
    } else if (this.voicedFrom >= 0) {
      // Im ngắn (lấy hơi) không cắt nốt; im lâu mà chưa đủ tiếng hát → tiếng động lẻ, bỏ
      if (f.t - this.lastVoiced >= this.o.endSilence) {
        const enough = this.lastVoiced - this.voicedFrom >= this.o.minVoiced - 1e-9;
        const est = enough ? estimateSungMidi(this.frames, this.o) : null;
        this.reset();
        return est;
      }
      if (f.t - this.lastVoiced > this.o.gapTolerance) this.frames.push(f);
      return null;
    }
    if (this.voicedFrom >= 0 && this.lastVoiced - this.voicedFrom >= this.o.maxVoiced - 1e-9) {
      const est = estimateSungMidi(this.frames, this.o);
      this.reset();
      return est;
    }
    return null;
  }
}

/** Lời nhắn sau mỗi nốt hát — luôn khen / động viên, không bao giờ chê. */
export function singFeedback(v: SingVerdict | null, tries: number): string {
  if (!v) return 'Con hát to hơn một chút nhé — app chưa nghe rõ 🎤';
  if (v.ok) {
    if (v.octave < 0) return 'Đúng nốt rồi! (con hát giọng trầm — vẫn đúng nhé) 🎉';
    if (v.octave > 0) return 'Đúng nốt rồi! (con hát giọng cao — vẫn đúng nhé) 🎉';
    return 'Đúng rồi! Con hát hay quá! 🎉';
  }
  if (tries >= 2) return 'Con hát hay lắm! Mình đàn nốt này để tai nhớ thêm nhé 🎹';
  if (v.close) return v.direction === 'low' ? 'Gần đúng rồi! Hát cao lên một xíu nữa nhé 🎵' : 'Gần đúng rồi! Hát thấp xuống một xíu nhé 🎵';
  return 'Mình nghe lại nốt này rồi hát theo nhé! 👂';
}
