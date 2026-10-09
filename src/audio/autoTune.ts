import { freqToMidi, type HeardNote, type PitchResult } from './pitchDetect';

/**
 * (+ 2026-10-09) TỰ HỌC ĐỘ LỆCH DÂY CỦA ĐÀN NHÀ — chuyên gia phản biện: đàn cơ trong nhà thường lệch cả cây 20–50 cent
 * và "giãn" ở âm khu cao (dây cao được lên cao hơn một chút, dây trầm thấp hơn). "Chỉnh theo đàn nhà" (chỉ đo Đô 4)
 * phải bấm tay — nhà bé chưa từng chạy.
 *
 * Cách làm (hàm/lớp THUẦN — MicListener đưa vào từng khung; test trên giả lập đàn cơ, tests/autoTune*.test.ts):
 * - Chỉ học từ nốt CHẮC CHẮN là nốt app đang chờ: màn hình báo các nốt cần đàn (`expected`), nốt micro nghe được
 *   phải cùng TÊN nốt với một nốt đó và lệch ≤ ±60 cent (tính trên tần số THÔ, không bù) — đàn nhầm phím bên cạnh
 *   (lệch ~100 cent), giọng nói, tiếng app không bao giờ được học.
 * - Mỗi nốt lấy tối đa 8 khung (200 ms) ngay sau khi nghe ra nốt: chỉ khung rõ (độ rõ ≥ 0,9), ≥ 3 khung, đứng yên
 *   (đa số khung trong ±12 cent quanh trung vị) → MỘT số đo (cent) cho nốt đó.
 * - Lưu ≤ 24 số đo gần nhất cho mỗi âm khu: trầm (< Đô 4), giữa (Đô 4–Si 4), cao (≥ Đô 5) → bắt được "giãn dây".
 * - Áp dụng khi đủ bằng chứng: ≥ 12 nốt và độ phân tán (MAD) ≤ 12 cent. Âm khu có ≥ 5 nốt (MAD ≤ 12) dùng trung vị
 *   riêng (giới hạn ±30 cent quanh cả đàn), còn lại dùng trung vị cả đàn; giữa các âm khu nội suy tuyến tính.
 * - Trễ (hysteresis): giá trị đang áp dụng chỉ đổi khi số mới lệch ≥ 4 cent; phân tán > 20 cent → thôi áp dụng.
 * - Không trôi theo nốt lạ: sau khi có ≥ 4 số đo, số đo mới phải gần ước lượng hiện tại (±35 cent). Đàn vừa được lên
 *   dây lại (≥ 8 số đo liền nhau cùng lệch hẳn, phân tán nhỏ) → học lại từ đầu bằng các số đo mới đó.
 */

export type Register = 'low' | 'mid' | 'high';
export const REGISTERS: readonly Register[] = ['low', 'mid', 'high'];

/** Âm khu của nốt (MIDI): trầm < Đô 4 (60) ≤ giữa < Đô 5 (72) ≤ cao. */
export function registerOf(midi: number): Register {
  return midi < 60 ? 'low' : midi < 72 ? 'mid' : 'high';
}

/** Dạng lưu trong Cài đặt (settings.micAutoTune) — gọn: số đo gần nhất (cent, số nguyên) + giá trị đang áp dụng. */
export interface AutoTuning {
  low: number[];
  mid: number[];
  high: number[];
  /** Độ lệch đang áp dụng [trầm, giữa, cao] (cent); null = chưa đủ bằng chứng → dùng bù tay (micTuningCents) */
  ap: [number, number, number] | null;
}

export const AUTO_TUNE = {
  /** Số đo giữ lại mỗi âm khu */
  ring: 24,
  /** Số nốt tối thiểu (cả đàn) để bắt đầu áp dụng */
  minNotes: 12,
  /** Số nốt tối thiểu của một âm khu để dùng trung vị riêng */
  minReg: 5,
  /** MAD tối đa (cent) để bắt đầu áp dụng / dùng trung vị riêng của âm khu */
  maxMad: 12,
  /** MAD vượt mức này → thôi áp dụng */
  dropMad: 20,
  /** Giá trị áp dụng chỉ đổi khi lệch ≥ (cent) */
  step: 4,
  /** Nốt nghe được lệch tối đa so với nốt cần đàn (cent, tần số thô) */
  gate: 60,
  /** Sau khi có ước lượng: số đo mới phải gần ước lượng trong (cent) */
  near: 35,
  /** Số đo tối thiểu trước khi dùng `near` */
  nearAfter: 4,
  /** Số đo "lệch hẳn" liền nhau (phân tán nhỏ) để coi là đàn đã được lên dây lại */
  regime: 8,
  /** Âm khu riêng không lệch quá (cent) so với cả đàn */
  regSpread: 30,
  /** Khung / nốt: độ rõ tối thiểu, số khung xem, số khung rõ tối thiểu, độ "đứng yên" (cent) */
  clarity: 0.9,
  frames: 8,
  minFrames: 3,
  steady: 12,
} as const;

const CENTER: Record<Register, number> = { low: 54, mid: 65.5, high: 78 };

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function mad(xs: readonly number[], med = median(xs)): number {
  return median(xs.map((x) => Math.abs(x - med)));
}

const isCents = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

/** Kiểm tra dữ liệu đọc từ Cài đặt / bản sao lưu (trường tùy chọn). */
export function validAutoTuning(x: unknown): x is AutoTuning {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  for (const r of REGISTERS) {
    const a = o[r];
    if (!Array.isArray(a) || a.length > AUTO_TUNE.ring || !a.every((v) => isCents(v, AUTO_TUNE.gate))) return false;
  }
  const ap = o.ap;
  return ap === null || (Array.isArray(ap) && ap.length === 3 && ap.every((v) => isCents(v, 100)));
}

export function emptyAutoTuning(): AutoTuning {
  return { low: [], mid: [], high: [], ap: null };
}

export interface AutoTuneStats {
  n: number;
  median: number | null;
  mad: number | null;
  reg: Record<Register, { n: number; median: number | null }>;
  /** Đang áp dụng [trầm, giữa, cao] hoặc null */
  applied: [number, number, number] | null;
}

export class TuningEstimator {
  private s: AutoTuning;
  /** Số đo bị loại vì "lệch hẳn" liền nhau (nhận ra đàn vừa lên dây lại) — không lưu */
  private outliers: Array<{ r: Register; c: number }> = [];
  /** Số số đo đã nhận (từ lúc tạo) — để biết khi nào cần lưu */
  accepted = 0;

  constructor(saved?: AutoTuning | null) {
    this.s = saved && validAutoTuning(saved) ? clone(saved) : emptyAutoTuning();
  }

  get active(): boolean {
    return this.s.ap !== null;
  }

  /** Bản sao để lưu Cài đặt. */
  get state(): AutoTuning {
    return clone(this.s);
  }

  load(saved: AutoTuning | null | undefined): void {
    this.s = saved && validAutoTuning(saved) ? clone(saved) : emptyAutoTuning();
    this.outliers = [];
  }

  reset(): void {
    this.load(null);
  }

  private all(): number[] {
    return [...this.s.low, ...this.s.mid, ...this.s.high];
  }

  /** Ước lượng độ lệch ở nốt `midi` (số thực được) — đang áp dụng; 0 khi chưa áp dụng. */
  centsAtMidi(midi: number): number {
    const ap = this.s.ap;
    if (!ap) return 0;
    const [lo, mi, hi] = ap;
    if (midi <= CENTER.low) return lo;
    if (midi >= CENTER.high) return hi;
    if (midi <= CENTER.mid) return lo + ((mi - lo) * (midi - CENTER.low)) / (CENTER.mid - CENTER.low);
    return mi + ((hi - mi) * (midi - CENTER.mid)) / (CENTER.high - CENTER.mid);
  }

  /** Hàm "độ lệch theo nốt" để bù (null = chưa áp dụng). */
  map(): ((midi: number) => number) | null {
    return this.s.ap ? (m: number) => this.centsAtMidi(m) : null;
  }

  /** Ước lượng hiện tại để lọc số đo mới (đang áp dụng → theo nốt; chưa → trung vị mọi số đo). */
  private reference(midi: number): number | null {
    if (this.s.ap) return this.centsAtMidi(midi);
    const a = this.all();
    return a.length >= AUTO_TUNE.nearAfter ? median(a) : null;
  }

  /**
   * Thêm số đo của MỘT nốt chắc chắn đúng: `cents` = lệch (tần số thô) so với nốt cần đàn `midi`.
   * Trả về true khi giá trị đang áp dụng thay đổi (MicListener cập nhật bộ nhận nốt).
   */
  add(midi: number, cents: number): boolean {
    if (!isCents(cents, AUTO_TUNE.gate)) return false;
    const r = registerOf(midi);
    const c = Math.round(cents);
    const ref = this.reference(midi);
    if (ref !== null && Math.abs(c - ref) > AUTO_TUNE.near) {
      this.outliers.push({ r, c });
      if (this.outliers.length > AUTO_TUNE.regime) this.outliers.shift();
      const oc = this.outliers.map((o) => o.c);
      if (this.outliers.length >= AUTO_TUNE.regime && mad(oc) <= AUTO_TUNE.maxMad) {
        // Đàn vừa được lên dây lại (hoặc đổi đàn): học lại từ các số đo mới
        const fresh = emptyAutoTuning();
        for (const o of this.outliers) fresh[o.r].push(o.c);
        const before = this.s.ap;
        this.s = fresh;
        this.outliers = [];
        this.accepted++;
        this.update();
        return !sameAp(before, this.s.ap);
      }
      return false;
    }
    this.outliers = [];
    this.accepted++;
    const ring = this.s[r];
    ring.push(c);
    if (ring.length > AUTO_TUNE.ring) ring.shift();
    const before = this.s.ap;
    this.update();
    return !sameAp(before, this.s.ap);
  }

  /** Tính lại giá trị áp dụng (có trễ). */
  private update(): void {
    const all = this.all();
    if (all.length < AUTO_TUNE.minNotes) {
      this.s.ap = null;
      return;
    }
    const g = median(all);
    const d = mad(all, g);
    if (this.s.ap ? d > AUTO_TUNE.dropMad : d > AUTO_TUNE.maxMad) {
      this.s.ap = null;
      return;
    }
    const want = REGISTERS.map((r) => {
      const a = this.s[r];
      if (a.length >= AUTO_TUNE.minReg) {
        const m = median(a);
        if (mad(a, m) <= AUTO_TUNE.maxMad) return Math.round(Math.max(g - AUTO_TUNE.regSpread, Math.min(g + AUTO_TUNE.regSpread, m)));
      }
      return Math.round(g);
    }) as [number, number, number];
    const ap = this.s.ap;
    if (!ap) {
      this.s.ap = want;
      return;
    }
    for (let i = 0; i < 3; i++) if (Math.abs(want[i] - ap[i]) >= AUTO_TUNE.step) ap[i] = want[i];
  }

  stats(): AutoTuneStats {
    const all = this.all();
    const g = all.length ? median(all) : null;
    const reg = {} as AutoTuneStats['reg'];
    for (const r of REGISTERS) reg[r] = { n: this.s[r].length, median: this.s[r].length ? Math.round(median(this.s[r])) : null };
    return {
      n: all.length,
      median: g === null ? null : Math.round(g),
      mad: g === null ? null : Math.round(mad(all, g)),
      reg,
      applied: this.s.ap ? [...this.s.ap] : null,
    };
  }
}

function clone(a: AutoTuning): AutoTuning {
  return { low: [...a.low], mid: [...a.mid], high: [...a.high], ap: a.ap ? [...a.ap] : null };
}

function sameAp(a: AutoTuning['ap'], b: AutoTuning['ap']): boolean {
  return a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
}

/** Lệch (cent) của tần số so với TÊN nốt `target` (bỏ quãng 8 — YIN có thể nhảy quãng 8 ở nốt trầm). */
export function pcCents(freq: number, target: number): number {
  const d = freqToMidi(freq, 0) - target;
  return (d - 12 * Math.round(d / 12)) * 100;
}

/**
 * Gom khung cho TuningEstimator: khi micro báo một nốt trùng TÊN với một nốt đang chờ (±60 cent, tần số thô),
 * xem tiếp tối đa 8 khung (dừng ở lần gõ mới) → một số đo ổn định cho nốt đó.
 */
export class TuningLearner {
  private target = -1;
  private cents: number[] = [];
  private left = 0;

  constructor(readonly est: TuningEstimator) {}

  /** Nốt app đang chờ (từ màn hình) — chỉ đọc khi micro vừa báo nốt. */
  private pick(freq: number, expected: readonly number[]): number {
    let best = -1;
    let bc = Infinity;
    for (const e of expected) {
      const c = Math.abs(pcCents(freq, e));
      if (c < bc) {
        bc = c;
        best = e;
      }
    }
    return bc <= AUTO_TUNE.gate ? best : -1;
  }

  /**
   * Một khung (sau MicAnalyzer.process). `expected` chỉ cần khi `note` khác null (null/rỗng = màn hình không chờ nốt
   * nào → không học). Trả về true khi độ lệch đang áp dụng thay đổi.
   */
  frame(pitch: PitchResult | null, note: HeardNote | null, onset: boolean, expected: readonly number[] | null): boolean {
    let changed = false;
    // Lần gõ ≤ 2 khung sau khi nghe ra nốt = tiếng búa của CHÍNH lần bấm ấy (NoteTracker SAME_STRIKE) → gom tiếp
    if (note || (onset && AUTO_TUNE.frames - this.left > 2)) changed = this.finish();
    if (note && expected && expected.length) {
      const t = this.pick(note.freq, expected);
      if (t >= 0) {
        this.target = t;
        this.cents = [];
        this.left = AUTO_TUNE.frames;
      }
    }
    if (this.target < 0) return changed;
    if (pitch && pitch.clarity >= AUTO_TUNE.clarity) {
      const c = pcCents(pitch.freq, this.target);
      if (Math.abs(c) <= AUTO_TUNE.gate) this.cents.push(c);
    }
    if (--this.left <= 0) changed = this.finish() || changed;
    return changed;
  }

  /** Bỏ nốt đang gom (app phát tiếng / màn hình đổi). */
  cancel(): void {
    this.target = -1;
    this.cents = [];
    this.left = 0;
  }

  private finish(): boolean {
    const t = this.target;
    const cs = this.cents;
    this.cancel();
    if (t < 0 || cs.length < AUTO_TUNE.minFrames) return false;
    const m = median(cs);
    const near = cs.filter((c) => Math.abs(c - m) <= AUTO_TUNE.steady);
    if (near.length < AUTO_TUNE.minFrames || near.length < 0.6 * cs.length) return false;
    return this.est.add(t, median(near));
  }
}

/** "−32c (trầm −38 · giữa −32 · cao −24)" — cho báo cáo / chẩn đoán. */
export function describeAutoTune(st: AutoTuneStats): string {
  const sg = (x: number) => `${x > 0 ? '+' : ''}${x}`;
  if (!st.n) return 'chưa học (chưa có nốt đúng rõ)';
  const regs = REGISTERS.map((r, i) => `${['trầm', 'giữa', 'cao'][i]} ${st.reg[r].median === null ? '—' : sg(st.reg[r].median!)}(${st.reg[r].n})`).join(' · ');
  const head = st.applied
    ? `đang bù ${sg(st.applied[0])}/${sg(st.applied[1])}/${sg(st.applied[2])}c (trầm/giữa/cao)`
    : `chưa áp dụng (cần ≥ ${AUTO_TUNE.minNotes} nốt, phân tán ≤ ${AUTO_TUNE.maxMad}c)`;
  return `${head} · đo ${st.n} nốt, trung vị ${sg(st.median ?? 0)}c ±${st.mad ?? 0} · ${regs}`;
}
