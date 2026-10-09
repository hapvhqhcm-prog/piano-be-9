/**
 * Màn "🎤 Cài micro" — phần dùng chung (micTest*.ts, micAutoReport.ts): hằng số, kiểu nhật ký, nhật ký micro gửi
 * người hỗ trợ, trạng thái màn (MicTestCtx).
 */
import type { MicFrame, MicState } from '../../audio/MicListener';
import type { Sensitivity } from '../../audio/micAnalyzer';
import type { Candidate, TuneTip, chooseSensitivity } from '../../audio/micTune';
import type { PianoKeyboard } from '../../piano/PianoKeyboard';
import { midiToPitch, type Pitch } from '../../piano/pitchTable';
import type { App } from '../App';
import { loadAutoSens } from '../../audio/micLogStore';

/** Kiểm tra 5 nốt "tốt" (đủ để dùng micro cho buổi học): nghe đúng ít nhất bấy nhiêu nốt */
export const MIC_GOOD = 4;

export const STATE_TEXT: Record<MicState, string> = {
  off: 'Micro đang tắt',
  starting: 'Đang bật micro… (iPad có thể hỏi quyền — chọn Cho phép)',
  on: '🎤 Đang nghe — hãy đàn một phím',
  denied:
    'iPad đang chặn micro. Vào Cài đặt → Safari → Micrô → chọn "Hỏi" hoặc "Cho phép", rồi mở lại app.',
  unsupported: 'Thiết bị/trang này không dùng được micro (cần mở bằng địa chỉ https:// GitHub Pages).',
  error: 'Không bật được micro. Thử đóng hẳn app rồi mở lại.',
};

export const SENS_LABEL: Array<{ value: Sensitivity; label: string }> = [
  { value: 'low', label: 'Thấp (phòng ồn)' },
  { value: 'normal', label: 'Vừa' },
  { value: 'high', label: 'Cao (đàn nhỏ / iPad xa)' },
];

/** Bài kiểm tra: 5 nốt thế tay Đô — đủ để thấy micro nghe được, nghe đúng, và đàn có lệch không. */
export const CHECK_NOTES: Pitch[] = ['C4', 'D4', 'E4', 'F4', 'G4'];
export const STEP_TIMEOUT_MS = 8000;
/** Nhật ký "đàn tự do" giữ tối đa bấy nhiêu nốt. */
export const FREE_LOG_MAX = 100;

export const TIP_TEXT: Record<TuneTip, string> = {
  calibrate: 'Có nốt tiếng đủ to mà micro nghe lệch nửa cung → bấm "Chỉnh theo đàn nhà" (đàn lâu không lên dây).',
  quiet:
    'Có nốt tiếng đủ to mà micro vẫn chưa rõ cao độ → bớt tiếng ồn (TV, quạt, điều hòa), đàn từng nốt rõ ràng, nhả phím trước khi đàn nốt sau.',
  closer:
    'Tiếng đàn tới micro rất nhỏ kể cả ở độ nhạy Cao → đặt iPad trên giá nhạc (gần dây đàn), mở nắp trên của đàn nếu được.',
};

/** Tên bộ lọc iOS (cảnh báo cho phụ huynh). */
export const PROCESSING_NAME: Record<string, string> = {
  echoCancellation: 'lọc tiếng vọng',
  noiseSuppression: 'giảm ồn',
  autoGainControl: 'tự chỉnh âm lượng',
  voiceIsolation: 'tách giọng nói',
};

export interface FreeNote {
  note: Pitch;
  cents: number;
  /** Từ lúc gõ phím (ước tính) tới lúc app báo nốt (ms) */
  latencyMs: number | null;
  /** Bố mẹ chấm: micro nghe đúng phím bé đàn không */
  verdict?: 'ok' | 'wrong';
}

export interface StepLog {
  want: Pitch;
  result: 'ok' | 'wrong' | 'none';
  heard: string[];
  /** ms từ lúc yêu cầu tới lúc nghe đúng */
  ms?: number;
  maxRms: number;
  gate: number;
  floor: number;
  pitchedFrames: number;
  frames: number;
  bestClarity: number;
  /** Nốt ứng viên (top 3) từ các khung có cao độ */
  candidates: Candidate[];
  /** Gõ phím → app báo nốt (ms), từng lần nghe được */
  latencyMs: number[];
}

/** Trạng thái của màn Cài micro cần cho nhật ký. */
export interface MicLogState {
  steps: StepLog[];
  freeLog: FreeNote[];
  lastFrame: MicFrame | null;
  autoTune: ReturnType<typeof chooseSensitivity> | null;
}

/**
 * Nhật ký micro (gửi người hỗ trợ): "📋 Sao chép nhật ký" ở màn này, và lưu lại (micLogStore) để màn
 * "🩺 Kiểm tra iPad" đính kèm vào bản kết quả.
 */
export function buildMicLog(app: App, { steps, freeLog, lastFrame, autoTune }: MicLogState): Record<string, unknown> {
  const store = app.store;
  const ctx = app.audio.context as (AudioContext & { baseLatency?: number }) | null;
  const judged = freeLog.filter((x) => x.verdict);
  const lat = freeLog.map((x) => x.latencyMs).filter((x): x is number => x !== null);
  return {
    app: 'piano-be-9 mic log v2',
    at: new Date().toISOString(),
    ua: navigator.userAgent,
    sampleRate: ctx?.sampleRate ?? null,
    baseLatency: ctx?.baseLatency ?? null,
    ctxState: ctx?.state ?? null,
    audioSession: (navigator as unknown as { audioSession?: { type?: string } }).audioSession?.type ?? null,
    tuningCents: store.settings.micTuningCents,
    autoTuning: app.mic.autoTune.stats(),
    sensitivity: store.settings.micSensitivity,
    latencyMs: store.settings.micLatencyMs,
    outputLatency: app.audio.outputLatency,
    micState: app.mic.state,
    // Bộ lọc iOS THẬT SỰ áp dụng (getSettings) — forced = bị ép bật dù app xin tắt
    track: app.mic.trackInfo(),
    stats: app.mic.stats,
    // Những lần micro TỰ tăng độ nhạy trong buổi học (micAutoSens.ts)
    autoSens: loadAutoSens(),
    warmingUp: app.mic.warmingUp,
    lastFrame: lastFrame && {
      rms: +lastFrame.rms.toFixed(5),
      floor: +lastFrame.floor.toFixed(5),
      gate: +lastFrame.gate.toFixed(5),
      app: lastFrame.app,
    },
    autoTune: autoTune && {
      sensitivity: autoTune.sensitivity,
      changed: autoTune.changed,
      reason: autoTune.reason,
      tips: autoTune.tips,
      margin: {
        low: +autoTune.margin.low.toFixed(2),
        normal: +autoTune.margin.normal.toFixed(2),
        high: +autoTune.margin.high.toFixed(2),
      },
    },
    steps: steps.map((s) => ({
      ...s,
      maxRms: +s.maxRms.toFixed(5),
      gate: +s.gate.toFixed(5),
      floor: +s.floor.toFixed(5),
      bestClarity: +s.bestClarity.toFixed(2),
      candidates: s.candidates.map((c) => ({ ...c, note: midiToPitch(c.midi) })),
    })),
    free: {
      heard: freeLog.length,
      judged: judged.length,
      correct: judged.filter((x) => x.verdict === 'ok').length,
      medianLatencyMs: lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null,
      notes: freeLog,
    },
  };
}

/** Trạng thái của MỘT lần mở màn Cài micro (micTest.ts dựng) — các phần đọc / ghi qua đây. */
export interface MicTestCtx {
  readonly app: App;
  readonly store: App['store'];
  /** Cờ / bộ hẹn giờ dùng chung giữa các phần */
  readonly s: {
    /** Kiểm tra 5 nốt: chỉ số nốt đang hỏi (-1 = không kiểm tra) */
    checking: number;
    stepTimer: number | undefined;
    /** Đang "Chỉnh theo đàn nhà" (đàn Đô giữa 3 lần) */
    calibrating: boolean;
    /** Đang đo độ trễ (app phát tiếng "tinh") — bỏ qua nốt nghe được lúc này */
    measuring: boolean;
    disposed: boolean;
    lastFrame: MicFrame | null;
  };
  readonly kb: PianoKeyboard;
  /** Dòng hướng dẫn / kết luận chính */
  readonly calib: HTMLElement;
  /** Kết quả kiểm tra 5 nốt (+ ô nhật ký khi không tự sao chép được) */
  readonly report: HTMLElement;
  /** Bàn phím chỉ hiện khi cần (đang kiểm tra 5 nốt / chỉnh theo đàn nhà) */
  showKb(): void;
  /** Bật micro với cài đặt hiện tại; true = đang nghe */
  startMic(): Promise<boolean>;
  /** Vẽ lại 3 bước + ô "Dùng micro" */
  renderSteps(): void;
  /** Vẽ lại nút chọn độ nhạy */
  renderSens(): void;
  /** Dừng bài "Đo micro & tạo báo cáo" đang chạy (nếu có) */
  stopAuto(): void;
  /** Nhật ký hiện tại (cho buildMicLog) */
  logState(): MicLogState;
}
