import { gateFor, type Sensitivity } from './micAnalyzer';
import { describeAutoTune, type AutoTuneStats } from './autoTune';
import { chooseSensitivity, SENS_NAME, type NoteCheck } from './micTune';
import { midiToPitch, viName } from '../piano/pitchTable';

/**
 * 🎙️ ĐO MICRO & TẠO BÁO CÁO (OWNER 2026-10-09: "trong phần mic tôi muốn bạn nghe và làm sẵn báo cáo để tôi copy
 * gửi vào đây thôi"). Phần THUẦN (không DOM, không Web Audio) — màn "Cài micro" đưa vào từng khung micro (FrameResult)
 * + nốt nghe được + giờ (ms); test đưa khung giả lập vào y hệt.
 *
 * Kịch bản tự chạy (~1 phút, mỗi bước tự sang bước sau, có "Bỏ qua"):
 *   1. Giữ yên lặng 5 s → ồn nền, khung vượt ngưỡng, "nốt ma"
 *   2. Đàn NHẸ Đô Rê Mi Fa Sol (mỗi nốt chờ tối đa 6 s)   3. Đàn VỪA Đô Mi Sol
 *   4. Đô TRẦM (Đô 3) + Đô CAO (Đô 5)                    5. Hợp âm Đô–Mi–Sol (2 s)   6. Giữ Đô 4 ngân 3 s
 * Sau đó: mô phỏng offline 3 độ nhạy (gateFor) từ số đo đã ghi → đề xuất độ nhạy; ước lượng lệch dây đàn;
 * soạn báo cáo chữ gọn (≤ ~60 dòng) + dòng JSON cho máy đọc. KHÔNG đổi cài đặt nào (màn hình hỏi bố mẹ).
 */

export const SILENCE_MS = 5000;
/** Bỏ qua bấy nhiêu ms đầu của bước im lặng khi tính ồn nền (micro vừa bật, mức ồn nền đang "làm quen phòng"). */
export const SILENCE_WARM_MS = 1000;
export const NOTE_WAIT_MS = 6000;
/** Nghe đúng rồi thì chờ thêm bấy nhiêu (nốt ngân bớt, bắt nốt báo lặp) rồi sang nốt sau. */
export const AFTER_HIT_MS = 900;
export const CHORD_WAIT_MS = 6000;
export const CHORD_LISTEN_MS = 2000;
export const SUSTAIN_WAIT_MS = 6000;
export const SUSTAIN_MS = 3000;
/** Lệch dây (cents, trung vị các nốt rõ) từ đây trở lên → nên "Chỉnh theo đàn nhà". */
export const TUNE_WARN_CENTS = 20;
export const CHORD_MIDIS = [60, 64, 67];
export const SUSTAIN_MIDI = 60;

export type Group = 'silence' | 'soft' | 'medium' | 'low' | 'high' | 'chord' | 'sustain';
export type NoteGroup = 'soft' | 'medium' | 'low' | 'high';

export interface Prompt {
  group: Group;
  /** Nốt cần đàn (MIDI) — bước nốt / ngân */
  want?: number;
  /** Câu to trên màn (một việc duy nhất) */
  say: string;
  /** Dòng nhỏ bên dưới */
  hint: string;
}

const GROUP_TEXT: Record<NoteGroup, string> = {
  soft: 'Đàn NHẸ (như lúc tập)',
  medium: 'Đàn VỪA (bình thường)',
  low: 'Đô TRẦM (Đô 3, tay trái)',
  high: 'Đô CAO (Đô 5)',
};

/** Tên nốt ngắn cho phụ huynh: "Đô", "Đô 3" (quãng 8 khác Đô giữa thì ghi số). */
export function viNote(midi: number): string {
  const p = midiToPitch(midi);
  const oct = Math.floor(midi / 12) - 1;
  return oct === 4 ? viName(p) : `${viName(p)} ${oct}`;
}

export function buildPrompts(): Prompt[] {
  const note = (group: NoteGroup, want: number, i: number, n: number): Prompt => ({
    group,
    want,
    say: `${GROUP_TEXT[group]}: ${viNote(want)}`,
    hint: n > 1 ? `Nốt ${i + 1}/${n} · đàn một lần rồi nhả phím` : 'Đàn một lần rồi nhả phím',
  });
  const soft = [60, 62, 64, 65, 67];
  const med = [60, 64, 67];
  return [
    { group: 'silence', say: 'Giữ yên lặng 🤫', hint: 'Không đàn, không nói — app đang nghe tiếng ồn của phòng' },
    ...soft.map((m, i) => note('soft', m, i, soft.length)),
    ...med.map((m, i) => note('medium', m, i, med.length)),
    note('low', 48, 0, 1),
    note('high', 72, 0, 1),
    { group: 'chord', say: 'Đàn hợp âm Đô–Mi–Sol cùng lúc', hint: 'Ba ngón 1–3–5 bấm cùng một lúc, giữ 2 giây' },
    { group: 'sustain', want: SUSTAIN_MIDI, say: 'Giữ Đô 4 ngân 3 giây', hint: 'Đàn Đô giữa một lần và GIỮ phím, đừng đàn lại' },
  ];
}

/** Khung micro (tập con của FrameResult / MicFrame). */
export interface RFrame {
  rms: number;
  floor: number;
  gate: number;
  pitch: { freq: number; clarity: number } | null;
  onset: boolean;
  nearMiss?: boolean;
  /** 'quiet' | 'tail' | 'sounding' | 'click' — khác 'quiet' (app đang phát tiếng) thì bỏ qua */
  app?: string;
}

export interface RNote {
  midi: number;
  cents: number;
  /** Gõ phím → app báo nốt (ms), nếu màn hình tính được */
  latencyMs?: number | null;
}

export interface NoteResult {
  group: NoteGroup;
  want: number;
  status: 'ok' | 'wrong' | 'none' | 'skipped';
  /** Nốt nghe được (đúng, hoặc nốt đầu tiên nếu sai) */
  got: number | null;
  cents: number | null;
  /** RMS lớn nhất / ngưỡng ở khung đó / mức ồn nền (trung vị) trong lúc chờ */
  peak: number;
  gate: number;
  floor: number;
  clarity: number;
  latencyMs: number | null;
  nearMiss: number;
  /** Nốt khác nốt cần đàn mà app báo */
  wrong: number[];
  /** Nốt đúng bị báo thêm lần nữa (đếm đôi) */
  doubles: number;
  /** Từ lúc hỏi tới lúc nghe đúng (ms) */
  ms: number | null;
}

export interface SilenceResult {
  skipped: boolean;
  frames: number;
  rmsMed: number;
  rmsP95: number;
  gateMed: number;
  floorMed: number;
  overGate: number;
  ghosts: number[];
  onsets: number;
  nearMiss: number;
  pitched: number;
  /** Tần số hay gặp nhất của khung có cao độ rõ (tiếng ù / quạt…); null = không có */
  humHz: number | null;
  /** (rms, floor) từng khung sau lúc làm quen — để mô phỏng độ nhạy */
  samples: Array<[number, number]>;
}

export interface ChordInfo {
  conclusive: boolean;
  present: number[];
  missing: number[];
  snr: number;
}

export interface ChordStep {
  status: 'ok' | 'none' | 'skipped';
  notes: number[];
  peak: number;
  gate: number;
  chord: ChordInfo | null;
}

export interface SustainStep {
  status: 'ok' | 'none' | 'skipped';
  /** Số lần app báo LẠI Đô 4 trong lúc ngân (nên = 0) */
  repeats: number;
  others: number[];
  peak: number;
  endRms: number;
  /** Tiếng ngân nhỏ dần (dB / giây) */
  decayDbPerS: number | null;
  /** Bao lâu tiếng ngân còn trên ngưỡng (ms) */
  aboveMs: number;
}

interface Acc {
  peak: number;
  gateAtPeak: number;
  floors: number[];
  clarity: number;
  nearMiss: number;
  lastOnset: number;
}
const newAcc = (): Acc => ({ peak: 0, gateAtPeak: 0, floors: [], clarity: 0, nearMiss: 0, lastOnset: -1 });

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
export const dbfs = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export interface PromptView {
  index: number;
  total: number;
  prompt: Prompt;
  /** ms còn lại của bước (đếm ngược) */
  remainingMs: number;
  /** 0–1 tiến độ của bước */
  frac: number;
  /** Câu trạng thái ngắn: "✅ Nghe được Đô" */
  status: string;
}

/**
 * Máy trạng thái của bài đo. Màn hình gọi start(now) → frame()/note() mỗi khi có dữ liệu → tick(now) ~5 lần/giây
 * (trả true khi vừa sang bước mới — màn hình gọi mic.resetTracker()) → done.
 */
export class MicReportSession {
  readonly prompts = buildPrompts();
  idx = -1;
  /** Tăng mỗi lần sang bước mới */
  seq = 0;
  private t0 = 0;
  /** Lúc nghe đúng (bước nốt) / lúc bắt đầu tiếng (hợp âm, ngân); −1 = chưa */
  private mark = -1;
  private acc = newAcc();
  private silFrames: RFrame[] = [];
  private silStart = 0;
  private silGhosts: number[] = [];
  private silOnsets = 0;
  readonly notes: NoteResult[] = [];
  silence: SilenceResult | null = null;
  chord: ChordStep | null = null;
  sustain: SustainStep | null = null;
  /** Hợp âm: đã có lần gõ — màn hình nên gọi verifyChord một lần */
  chordOnset = false;
  private chordInfo: ChordInfo | null = null;
  private chordNotes: number[] = [];
  private sus = { repeats: 0, others: [] as number[], peak: 0, peakAt: -1, last: 0, lastAt: -1, aboveMs: 0, lastFrameAt: -1 };
  startedAt = 0;
  endedAt = 0;
  aborted = false;

  constructor(readonly sensitivity: Sensitivity, readonly tuningCents = 0) {}

  get done(): boolean {
    return this.idx >= this.prompts.length || this.aborted;
  }
  get current(): Prompt | null {
    return this.idx >= 0 && this.idx < this.prompts.length ? this.prompts[this.idx] : null;
  }

  start(now: number): void {
    this.startedAt = now;
    this.enter(0, now);
  }

  abort(now: number): void {
    if (this.done) return;
    this.aborted = true;
    this.endedAt = now;
  }

  private enter(i: number, now: number): void {
    this.idx = i;
    this.seq++;
    this.t0 = now;
    this.mark = -1;
    this.acc = newAcc();
    const p = this.current;
    if (!p) {
      this.endedAt = now;
      return;
    }
    if (p.group === 'silence') {
      this.silFrames = [];
      this.silStart = now;
      this.silGhosts = [];
      this.silOnsets = 0;
    } else if (p.want !== undefined && p.group !== 'sustain') {
      this.notes.push({
        group: p.group as NoteGroup,
        want: p.want,
        status: 'none',
        got: null,
        cents: null,
        peak: 0,
        gate: 0,
        floor: 0,
        clarity: 0,
        latencyMs: null,
        nearMiss: 0,
        wrong: [],
        doubles: 0,
        ms: null,
      });
    } else if (p.group === 'chord') {
      this.chordOnset = false;
      this.chordInfo = null;
      this.chordNotes = [];
    } else if (p.group === 'sustain') {
      this.sus = { repeats: 0, others: [], peak: 0, peakAt: -1, last: 0, lastAt: -1, aboveMs: 0, lastFrameAt: -1 };
    }
  }

  private get curNote(): NoteResult | undefined {
    const p = this.current;
    return p && p.want !== undefined && p.group !== 'sustain' ? this.notes[this.notes.length - 1] : undefined;
  }

  frame(f: RFrame, now: number): void {
    const p = this.current;
    if (!p || (f.app && f.app !== 'quiet')) return;
    const a = this.acc;
    if (f.rms > a.peak) {
      a.peak = f.rms;
      a.gateAtPeak = f.gate;
    }
    if (f.floor > 0) a.floors.push(f.floor);
    if (f.pitch && f.rms >= f.gate) a.clarity = Math.max(a.clarity, f.pitch.clarity);
    if (f.nearMiss) a.nearMiss++;
    if (f.onset) a.lastOnset = now;
    if (p.group === 'silence') {
      if (f.onset) this.silOnsets++;
      if (now - this.silStart >= SILENCE_WARM_MS) this.silFrames.push(f);
    } else if (p.group === 'chord') {
      if (f.onset && this.mark < 0) {
        this.mark = now;
        this.chordOnset = true;
      }
    } else if (p.group === 'sustain' && this.mark >= 0) {
      const s = this.sus;
      if (f.rms > s.peak) {
        s.peak = f.rms;
        s.peakAt = now;
      }
      if (s.lastFrameAt >= 0 && f.rms >= f.gate) s.aboveMs += now - s.lastFrameAt;
      s.lastFrameAt = now;
      s.last = f.rms;
      s.lastAt = now;
    }
  }

  note(n: RNote, now: number): void {
    const p = this.current;
    if (!p) return;
    if (p.group === 'silence') {
      this.silGhosts.push(n.midi);
      return;
    }
    if (p.group === 'chord') {
      this.chordNotes.push(n.midi);
      if (this.mark < 0) this.mark = now;
      return;
    }
    if (p.group === 'sustain') {
      if (n.midi !== SUSTAIN_MIDI) return void this.sus.others.push(n.midi);
      if (this.mark < 0) {
        this.mark = now;
        // đỉnh tính từ lúc nghe được (khung gõ ngay trước đó)
        this.sus.peak = this.acc.peak;
        this.sus.peakAt = now;
        this.sus.lastFrameAt = now;
      } else this.sus.repeats++;
      return;
    }
    const r = this.curNote;
    if (!r) return;
    if (n.midi === r.want) {
      if (r.status === 'ok') {
        r.doubles++;
        return;
      }
      r.status = 'ok';
      r.got = n.midi;
      r.cents = Math.round(n.cents);
      r.ms = Math.round(now - this.t0);
      const lat = n.latencyMs ?? (this.acc.lastOnset >= 0 && now - this.acc.lastOnset < 1500 ? now - this.acc.lastOnset : null);
      r.latencyMs = lat === null ? null : Math.round(lat);
      this.mark = now;
    } else {
      r.wrong.push(n.midi);
      if (r.status === 'none') {
        r.status = 'wrong';
        r.got = n.midi;
        r.cents = Math.round(n.cents);
      }
    }
  }

  /** Kết quả kiểm tra hợp âm (NNLS, MicListener.verifyChord) — chỉ đọc. */
  chordResult(r: ChordInfo | null): void {
    if (r && this.current?.group === 'chord') this.chordInfo = { conclusive: r.conclusive, present: [...r.present], missing: [...r.missing], snr: r.snr };
  }

  /** Thời điểm bước hiện tại kết thúc (theo dữ liệu đã có). */
  private endAt(): number {
    const p = this.current;
    if (!p) return this.t0;
    switch (p.group) {
      case 'silence':
        return this.t0 + SILENCE_MS;
      case 'chord':
        return this.mark >= 0 ? this.mark + CHORD_LISTEN_MS : this.t0 + CHORD_WAIT_MS;
      case 'sustain':
        return this.mark >= 0 ? this.mark + SUSTAIN_MS : this.t0 + SUSTAIN_WAIT_MS;
      default:
        return this.mark >= 0 ? this.mark + AFTER_HIT_MS : this.t0 + NOTE_WAIT_MS;
    }
  }

  /** Gọi đều đặn. true = vừa sang bước mới (hoặc vừa xong). */
  tick(now: number): boolean {
    if (this.done || this.idx < 0) return false;
    if (now < this.endAt()) return false;
    this.close(now, false);
    this.enter(this.idx + 1, now);
    return true;
  }

  /** "Bỏ qua" bước đang làm. */
  skip(now: number): void {
    if (this.done || this.idx < 0) return;
    this.close(now, true);
    this.enter(this.idx + 1, now);
  }

  private close(now: number, skipped: boolean): void {
    const p = this.current;
    if (!p) return;
    const a = this.acc;
    if (p.group === 'silence') {
      const fr = this.silFrames;
      const rms = fr.map((f) => f.rms);
      const pitchedF = fr.filter((f) => f.pitch && f.pitch.clarity >= 0.8);
      const hz = new Map<number, number>();
      for (const f of pitchedF) {
        const k = Math.round(f.pitch!.freq);
        hz.set(k, (hz.get(k) ?? 0) + 1);
      }
      const hum = [...hz.entries()].sort((x, y) => y[1] - x[1])[0];
      this.silence = {
        skipped: skipped && now - this.t0 < SILENCE_MS * 0.6,
        frames: fr.length,
        rmsMed: median(rms),
        rmsP95: pct(rms, 0.95),
        gateMed: median(fr.map((f) => f.gate)),
        floorMed: median(fr.map((f) => f.floor).filter((x) => x > 0)),
        overGate: fr.filter((f) => f.rms >= f.gate).length,
        ghosts: [...this.silGhosts],
        onsets: this.silOnsets,
        nearMiss: a.nearMiss,
        pitched: pitchedF.length,
        humHz: hum ? hum[0] : null,
        samples: fr.map((f) => [f.rms, f.floor] as [number, number]),
      };
      return;
    }
    if (p.group === 'chord') {
      this.chord = {
        status: skipped && this.mark < 0 ? 'skipped' : this.mark >= 0 ? 'ok' : 'none',
        notes: [...this.chordNotes],
        peak: a.peak,
        gate: a.gateAtPeak,
        chord: this.chordInfo,
      };
      return;
    }
    if (p.group === 'sustain') {
      const s = this.sus;
      const span = (s.lastAt - s.peakAt) / 1000;
      const decay = this.mark >= 0 && s.peak > 0 && s.last > 0 && span > 0.5 ? (dbfs(s.peak) - dbfs(s.last)) / span : null;
      this.sustain = {
        status: this.mark >= 0 ? 'ok' : skipped ? 'skipped' : 'none',
        repeats: s.repeats,
        others: [...s.others],
        peak: s.peak || a.peak,
        endRms: s.last,
        decayDbPerS: decay === null ? null : Math.round(decay * 10) / 10,
        aboveMs: Math.round(s.aboveMs),
      };
      return;
    }
    const r = this.curNote;
    if (!r) return;
    if (skipped && r.status === 'none') r.status = 'skipped';
    r.peak = a.peak;
    r.gate = a.gateAtPeak;
    r.floor = median(a.floors);
    r.clarity = Math.round(a.clarity * 100) / 100;
    r.nearMiss = a.nearMiss;
  }

  view(now: number): PromptView | null {
    const p = this.current;
    if (!p) return null;
    const end = this.endAt();
    const span = Math.max(1, end - (this.mark >= 0 && p.group !== 'silence' ? this.mark : this.t0));
    const remainingMs = Math.max(0, end - now);
    let status = '';
    const r = this.curNote;
    if (r?.status === 'ok') status = `✅ Nghe được ${viNote(r.want)}!`;
    else if (r?.status === 'wrong') status = `Nghe thành ${viNote(r.got!)}… đàn lại ${viNote(r.want)} nhé`;
    else if (p.group === 'chord' && this.mark >= 0) status = '👂 Đang nghe hợp âm… giữ phím';
    else if (p.group === 'sustain' && this.mark >= 0) status = '👂 Giữ phím… đừng đàn lại';
    else if (p.group === 'silence') status = '👂 Đang nghe tiếng ồn của phòng…';
    else status = '👂 Đang chờ…';
    return { index: this.idx, total: this.prompts.length, prompt: p, remainingMs, frac: Math.min(1, 1 - remainingMs / span), status };
  }
}

// ---------------------------------------------------------------- Phân tích (sau khi xong)

const SENS: Sensitivity[] = ['low', 'normal', 'high'];
const RANK: Record<Sensitivity, number> = { low: 0, normal: 1, high: 2 };

export interface SimRow {
  /** Nốt nhẹ / mọi nốt "sẽ được nghe" (đỉnh ≥ 1,5 × ngưỡng của độ nhạy đó) */
  soft: [number, number];
  all: [number, number];
  /** Nốt nhẹ yếu nhất: dư bao nhiêu dB so với mức cần để bắt lần gõ */
  softMinDb: number | null;
  /** Số lần tiếng ồn lúc im lặng vượt mức bắt lần gõ (nguy cơ "nốt ma") */
  ghosts: number;
}

export interface MicAnalysis {
  total: number;
  hits: number;
  softHits: number;
  softTotal: number;
  sim: Record<Sensitivity, SimRow>;
  recommend: Sensitivity;
  recommendReason: string;
  tuning: { n: number; medianCents: number | null; suggested: number | null; calibrate: boolean };
  /** 2–4 câu cho bố mẹ */
  summary: string[];
  /** "Đề xuất của app: …" (không có tiền tố) */
  advice: string;
}

function usable(r: NoteResult): boolean {
  return r.status !== 'skipped' && r.peak > 0;
}

/** Nốt có "được nghe" ở độ nhạy s không (bắt lần gõ cần đỉnh ≥ 1,5 × ngưỡng). */
export function heardAt(r: Pick<NoteResult, 'peak' | 'floor'>, s: Sensitivity): boolean {
  return r.peak >= 1.5 * gateFor(Math.max(0, r.floor), s);
}

export function simulate(notes: NoteResult[], silence: SilenceResult | null): Record<Sensitivity, SimRow> {
  const out = {} as Record<Sensitivity, SimRow>;
  const used = notes.filter(usable);
  const soft = used.filter((r) => r.group === 'soft');
  for (const s of SENS) {
    let ghosts = 0;
    let above = false;
    for (const [rms, floor] of silence?.samples ?? []) {
      const over = rms >= 1.5 * gateFor(Math.max(0, floor), s);
      if (over && !above) ghosts++;
      above = over;
    }
    const softDb = soft.map((r) => dbfs(r.peak) - dbfs(1.5 * gateFor(Math.max(0, r.floor), s)));
    out[s] = {
      soft: [soft.filter((r) => heardAt(r, s)).length, soft.length],
      all: [used.filter((r) => heardAt(r, s)).length, used.length],
      softMinDb: softDb.length ? Math.round(Math.min(...softDb) * 10) / 10 : null,
      ghosts,
    };
  }
  return out;
}

function toCheck(r: NoteResult): NoteCheck {
  return {
    want: r.want,
    result: r.status === 'ok' ? 'ok' : r.status === 'wrong' ? 'wrong' : 'none',
    heard: r.wrong.concat(r.status === 'ok' ? [r.want] : []),
    maxRms: r.peak,
    floor: r.floor,
    gate: r.gate,
    bestClarity: r.clarity,
  };
}

export function analyze(ses: Pick<MicReportSession, 'notes' | 'silence' | 'chord' | 'sustain' | 'sensitivity' | 'tuningCents'>): MicAnalysis {
  const cur = ses.sensitivity;
  const asked = ses.notes.filter((r) => r.status !== 'skipped');
  const hits = asked.filter((r) => r.status === 'ok').length;
  const soft = asked.filter((r) => r.group === 'soft');
  const softHits = soft.filter((r) => r.status === 'ok').length;
  const sim = simulate(ses.notes, ses.silence);

  // Độ nhạy: như "Kiểm tra 5 nốt" (micTune) nhưng chỉ với nốt NHẸ (giống lúc tập), rồi chặn "nốt ma"
  const softUsed = ses.notes.filter((r) => r.group === 'soft' && usable(r));
  let recommend: Sensitivity = cur;
  let recommendReason = 'chưa đủ số đo nốt nhẹ — giữ nguyên';
  if (softUsed.length >= 2) {
    const adv = chooseSensitivity(softUsed.map(toCheck), cur);
    recommend = adv.sensitivity;
    recommendReason = adv.reason;
    if (sim[recommend].ghosts > 0 && recommend !== 'low') {
      const lower = SENS[RANK[recommend] - 1];
      if (sim[lower].soft[0] >= sim[recommend].soft[0]) {
        recommend = lower;
        recommendReason = 'vì phòng có tiếng ồn dễ bị tưởng là nốt';
      }
    }
  }

  // Lệch dây: trung vị cents của các nốt nghe ĐÚNG và rõ (cents đã trừ phần bù hiện tại)
  const sure = ses.notes.filter((r) => r.status === 'ok' && r.cents !== null && r.clarity >= 0.85).map((r) => r.cents!);
  const semis = ses.notes.filter((r) => r.wrong.some((m) => Math.abs(m - r.want) === 1)).length;
  const med = sure.length ? median(sure) : null;
  const calibrate = (med !== null && sure.length >= 3 && Math.abs(med) > TUNE_WARN_CENTS) || semis >= 2;
  const tuning = {
    n: sure.length,
    medianCents: med,
    suggested: med === null ? null : Math.max(-100, Math.min(100, Math.round(ses.tuningCents + med))),
    calibrate,
  };

  // Tóm tắt cho bố mẹ (2–4 câu)
  const summary: string[] = [];
  const total = asked.length;
  if (!total) summary.push('⚠️ Chưa đo được nốt nào (đã bỏ qua hết) — làm lại khi bé ngồi ở đàn.');
  else if (hits === total) summary.push(`✅ Micro nghe tốt: nghe đúng ${hits}/${total} nốt.`);
  else if (hits >= total * 0.75) summary.push(`🙂 Micro nghe khá: đúng ${hits}/${total} nốt.`);
  else summary.push(`⚠️ Micro còn hụt nhiều: mới nghe đúng ${hits}/${total} nốt.`);
  if (soft.length && softHits < soft.length) {
    const miss = soft.filter((r) => r.status !== 'ok').map((r) => viNote(r.want));
    summary.push(`Còn hụt nốt đàn nhẹ (${miss.join(', ')}).`);
  } else if (soft.length && (sim[cur].softMinDb ?? 99) < 3) summary.push('Nốt đàn nhẹ nghe được nhưng còn sát ngưỡng.');
  const wrongs = ses.notes.filter((r) => r.wrong.length);
  if (wrongs.length) summary.push(`Có ${wrongs.length} nốt bị nghe nhầm (vd ${viNote(wrongs[0].want)} → ${viNote(wrongs[0].wrong[0])}).`);
  const ghosts = ses.silence?.ghosts.length ?? 0;
  if (ghosts) summary.push(`Lúc yên lặng app vẫn "nghe" ${ghosts} nốt — bớt tiếng ồn (quạt, TV, điều hòa).`);
  if (tuning.calibrate) summary.push(`Đàn nhà lệch dây khoảng ${med !== null && med > 0 ? '+' : ''}${med ?? '?'} cent.`);
  if ((ses.sustain?.repeats ?? 0) > 0) summary.push(`Nốt ngân bị báo lại ${ses.sustain!.repeats} lần.`);
  const sumLines = summary.slice(0, 4);

  const parts: string[] = [];
  if (recommend !== cur) parts.push(`đổi độ nhạy ${SENS_NAME[cur]} → ${SENS_NAME[recommend]} (${recommendReason})`);
  else parts.push(`giữ độ nhạy ${SENS_NAME[cur]}`);
  if (tuning.calibrate) parts.push(`bấm "Chỉnh theo đàn nhà" (bù đề xuất ${tuning.suggested !== null && tuning.suggested > 0 ? '+' : ''}${tuning.suggested ?? '?'} cent)`);
  if (ghosts) parts.push('bớt tiếng ồn trong phòng');
  if (total && hits < total * 0.5 && recommend === 'high' && sim.high.all[0] < sim.high.all[1]) parts.push('đặt iPad gần dây đàn hơn (trên giá nhạc)');
  return { total, hits, softHits, softTotal: soft.length, sim, recommend, recommendReason, tuning, summary: sumLines, advice: parts.join('; ') + '.' };
}

// ---------------------------------------------------------------- Báo cáo chữ

export interface ReportEnv {
  version: string;
  /** ms */
  at: number;
  /** "iPadOS 26.6 · Safari" */
  device: string;
  standalone: boolean;
  screen?: string;
  ctx: { state: string; sampleRate: number; baseLatency: number | null; outputLatency: number | null } | null;
  track: {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
    voiceIsolation?: boolean;
    channelCount?: number;
    sampleRate?: number;
    latency?: number;
    fallback?: boolean;
    forced?: string[];
  } | null;
  tuningCents: number;
  /** (+ 2026-10-09) Micro tự học lệch dây (autoTune.ts) — MicListener.autoTune.stats() */
  autoTune?: AutoTuneStats;
  latencyMs: number;
  micEnabled: boolean;
  autoSens: Array<{ at: string; from: string; to: string; missed: number }>;
  /** MicListener.stats của lần bật micro này */
  stats: { frames: number; maxGapMs: number; slowGaps: number; onsets: number; notes: number; nearMisses: number } | null;
  /** Micro trong các buổi học gần đây (sessions[].micAssessments) */
  lessons: { sessions: number; judged: number; firstTry: number; wrongNotes: number; overrides: number } | null;
  errors: number;
  lastErrorAt?: number;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const db1 = (x: number): string => (x > 0 ? (Math.round(dbfs(x) * 10) / 10).toFixed(1) : '—');
const sgn = (x: number): string => `${x > 0 ? '+' : ''}${x}`;
const yn = (b: boolean | undefined): string => (b === undefined ? '?' : b ? 'BẬT' : 'tắt');
const msOf = (s: number | null): string => (s === null || !isFinite(s) ? '?' : `${Math.round(s * 1000)}ms`);
const names = (xs: number[]): string => (xs.length ? xs.map(midiToPitch).join(',') : '-');

const GROUP_SHORT: Record<NoteGroup, string> = { soft: 'nhẹ', medium: 'vừa', low: 'trầm', high: 'cao' };

export interface MicReport {
  text: string;
  summary: string[];
  analysis: MicAnalysis;
}

/** Bản báo cáo gọn (≤ ~60 dòng) để bố mẹ sao chép gửi người hỗ trợ. */
export function formatMicReport(ses: MicReportSession, env: ReportEnv, an: MicAnalysis = analyze(ses)): MicReport {
  const L: string[] = [];
  L.push(`=== BÁO CÁO MICRO Piano bé v${env.version} ${fmtTime(env.at)} ===`);
  L.push(`Tóm tắt: ${an.summary.join(' ')}`);
  L.push(
    `[Máy] ${env.device} · standalone=${env.standalone ? 'có' : 'KHÔNG'}${env.screen ? ` · ${env.screen}` : ''}` +
      (ses.aborted ? ' · ⚠️ bài đo bị dừng giữa chừng' : ''),
  );
  const c = env.ctx;
  L.push(c ? `[Âm thanh] ctx=${c.state} sr=${c.sampleRate} base=${msOf(c.baseLatency)} out=${msOf(c.outputLatency)}` : '[Âm thanh] chưa bật');
  const t = env.track;
  L.push(
    t
      ? `[Track] ec=${yn(t.echoCancellation)} ns=${yn(t.noiseSuppression)} agc=${yn(t.autoGainControl)} vi=${yn(t.voiceIsolation)} ` +
          `ch=${t.channelCount ?? '?'} sr=${t.sampleRate ?? '?'} lat=${t.latency !== undefined ? `${Math.round(t.latency * 1000)}ms` : '?'}` +
          `${t.fallback ? ' fallback' : ''}${t.forced?.length ? ` ÉP-BẬT=${t.forced.join('+')}` : ''}`
      : '[Track] không đọc được',
  );
  const au = env.autoSens.slice(-2).map((a) => `${a.at.slice(0, 10)} ${a.from}→${a.to}(${a.missed} lỡ)`);
  L.push(
    `[Cài đặt] độ nhạy=${ses.sensitivity} bù dây=${sgn(env.tuningCents)}c trễ=${env.latencyMs}ms micro buổi học=${env.micEnabled ? 'bật' : 'tắt'}` +
      ` · tự tăng: ${au.length ? au.join('; ') : 'chưa'}`,
  );
  const s = ses.silence;
  L.push(
    !s
      ? '[Im lặng 5s] chưa đo'
      : s.skipped
        ? '[Im lặng 5s] bỏ qua'
        : `[Im lặng 5s] nền med ${db1(s.rmsMed)} p95 ${db1(s.rmsP95)} dBFS · floor ${db1(s.floorMed)} · ngưỡng ${db1(s.gateMed)} · ` +
          `khung>ngưỡng ${s.overGate}/${s.frames} · gõ ${s.onsets} · nốt ma ${s.ghosts.length}${s.ghosts.length ? `(${names(s.ghosts)})` : ''}` +
          ` · suýt ${s.nearMiss} · cao độ ${s.pitched}${s.humHz ? `@${s.humHz}Hz` : ''}`,
  );
  L.push('[Nốt] kiểu muốn→nghe | cent | đỉnh/ngưỡng dBFS | dư dB | trễ ms | suýt | thừa');
  for (const r of ses.notes) {
    const head = `${GROUP_SHORT[r.group]} ${midiToPitch(r.want)}→${r.status === 'skipped' ? 'BỎ QUA' : r.got !== null ? midiToPitch(r.got) : 'KHÔNG'}`;
    const mark = r.status === 'ok' ? '' : r.status === 'wrong' ? ' ✗' : r.status === 'none' ? ' ✗' : '';
    const mDb = dbfs(r.peak) - dbfs(r.gate);
    const margin = r.peak > 0 && r.gate > 0 ? `${mDb > 0 ? '+' : ''}${mDb.toFixed(1)}` : '—';
    const extra = [...(r.status === 'wrong' ? r.wrong.slice(1) : r.wrong).map(midiToPitch), ...(r.doubles ? [`đôi×${r.doubles}`] : [])];
    L.push(
      `${head}${mark} | ${r.cents !== null ? sgn(r.cents) : '—'} | ${db1(r.peak)}/${db1(r.gate)} | ${margin} | ${r.latencyMs ?? '—'} | ` +
        `${r.nearMiss} | ${extra.length ? extra.join(',') : '-'}${r.clarity ? ` (rõ ${r.clarity})` : ''}`,
    );
  }
  const ch = ses.chord;
  L.push(
    !ch
      ? '[Hợp âm C4-E4-G4] chưa đo'
      : ch.status === 'skipped'
        ? '[Hợp âm C4-E4-G4] bỏ qua'
        : `[Hợp âm C4-E4-G4] ${ch.status === 'ok' ? '' : 'KHÔNG nghe thấy · '}app báo: ${names(ch.notes)} · đỉnh ${db1(ch.peak)}/${db1(ch.gate)} · ` +
          (ch.chord
            ? `NNLS ${ch.chord.conclusive ? 'chắc' : 'không chắc'} có ${names(ch.chord.present)} thiếu ${names(ch.chord.missing)} snr ${Math.round(ch.chord.snr * 10) / 10}`
            : 'NNLS: không có kết quả'),
  );
  const su = ses.sustain;
  L.push(
    !su
      ? '[Ngân C4 3s] chưa đo'
      : su.status !== 'ok'
        ? `[Ngân C4 3s] ${su.status === 'skipped' ? 'bỏ qua' : 'KHÔNG nghe thấy Đô 4'}${su.others.length ? ` · nghe ${names(su.others)}` : ''}`
        : `[Ngân C4 3s] báo lại ${su.repeats} lần · nốt khác ${names(su.others)} · đỉnh ${db1(su.peak)} → cuối ${db1(su.endRms)} · ` +
          `giảm ${su.decayDbPerS ?? '?'} dB/s · trên ngưỡng ${(su.aboveMs / 1000).toFixed(1)}s`,
  );
  const sim = an.sim;
  L.push(
    '[Mô phỏng] ' +
      SENS.map(
        (k) =>
          `${k}${k === ses.sensitivity ? '*' : ''}: nhẹ ${sim[k].soft[0]}/${sim[k].soft[1]} tất ${sim[k].all[0]}/${sim[k].all[1]} ` +
          `dư-min ${sim[k].softMinDb ?? '—'}dB ma ${sim[k].ghosts}`,
      ).join(' | '),
  );
  const tu = an.tuning;
  L.push(
    `[Lệch dây] ${tu.medianCents === null ? 'chưa đủ nốt rõ' : `trung vị ${sgn(tu.medianCents)}c (n=${tu.n}) → bù đề xuất ${sgn(tu.suggested ?? 0)}c`}` +
      ` · ${tu.calibrate ? (env.autoTune?.applied ? 'app đã tự bù khi học' : 'NÊN chỉnh theo đàn nhà') : 'không cần chỉnh'}` +
      (env.autoTune ? ` · tự học: ${describeAutoTune(env.autoTune)}` : ''),
  );
  const st = env.stats;
  if (st) L.push(`[Phiên micro này] khung ${st.frames} · trễ khung max ${Math.round(st.maxGapMs)}ms (chậm ${st.slowGaps}) · gõ ${st.onsets} · nốt ${st.notes} · suýt ${st.nearMisses}`);
  const le = env.lessons;
  L.push(
    le && le.judged
      ? `[Buổi học gần đây] ${le.sessions} buổi · micro chấm ${le.judged} lượt · đúng lần đầu ${Math.round((le.firstTry / le.judged) * 100)}% · nốt sai ${le.wrongNotes} · bố mẹ sửa ${le.overrides}`
      : '[Buổi học gần đây] chưa có lượt chấm bằng micro',
  );
  L.push(`[Lỗi gần đây] ${env.errors}${env.errors && env.lastErrorAt ? ` (gần nhất ${fmtTime(env.lastErrorAt)})` : ''}`);
  L.push(`Đề xuất của app: ${an.advice}`);
  L.push('DATA ' + compactData(ses, env, an));
  return { text: L.join('\n'), summary: an.summary, analysis: an };
}

const r5 = (x: number) => +x.toPrecision(3);

/** Dòng JSON cho máy đọc (≤ 1500 ký tự). */
export function compactData(ses: MicReportSession, env: ReportEnv, an: MicAnalysis): string {
  const s = ses.silence;
  const full = {
    v: env.version,
    sr: env.ctx?.sampleRate ?? null,
    sens: ses.sensitivity,
    tc: env.tuningCents,
    sil: s && !s.skipped ? [r5(s.rmsMed), r5(s.rmsP95), r5(s.floorMed), r5(s.gateMed), s.overGate, s.ghosts.length] : null,
    n: ses.notes.map((r) => [r.want, r.status[0], r.got ?? 0, r.cents ?? 0, r5(r.peak), r5(r.gate), r5(r.floor), r.latencyMs ?? -1, r.nearMiss, r.wrong.length, r.doubles]),
    ch: ses.chord ? [ses.chord.status[0], ses.chord.notes, ses.chord.chord ? [+ses.chord.chord.conclusive, ses.chord.chord.present, ses.chord.chord.missing] : 0] : null,
    su: ses.sustain ? [ses.sustain.status[0], ses.sustain.repeats, ses.sustain.decayDbPerS, ses.sustain.aboveMs] : null,
    sim: SENS.map((k) => [an.sim[k].soft[0], an.sim[k].all[0], an.sim[k].ghosts]),
    rec: an.recommend,
    tune: an.tuning.medianCents,
    at: env.autoTune ? [env.autoTune.n, env.autoTune.median, env.autoTune.applied] : null,
    err: env.errors,
  };
  let json = JSON.stringify(full);
  if (json.length > 1500) json = JSON.stringify({ ...full, n: full.n.map((x) => x.slice(0, 6)) });
  if (json.length > 1500) json = json.slice(0, 1497) + '...';
  return json;
}
