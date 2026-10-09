/**
 * Bài "Đo micro & tạo báo cáo" GIẢ (khung micro tổng hợp, không cần âm thanh) — dùng cho tests/micReport.test.ts
 * và cảnh chụp màn hình (scripts/shots.scenes.mjs nạp tệp này qua dev server).
 */
import { gateFor, type Sensitivity } from '../src/audio/micAnalyzer';
import { MicReportSession, type ChordInfo } from '../src/audio/micReport';

export interface SynthNote {
  /** RMS đỉnh lúc gõ */
  peak?: number;
  cents?: number;
  /** Nốt app báo (mặc định = nốt cần đàn); null = không báo gì */
  midi?: number | null;
  /** Nốt báo thêm sau đó */
  extra?: number[];
  nearMiss?: boolean;
  latency?: number;
}

export interface SynthPlan {
  sensitivity?: Sensitivity;
  tuningCents?: number;
  /** Mức ồn nền (RMS) */
  floor?: number;
  /** Lúc im lặng có tiếng động → nốt "ma" */
  ghost?: boolean;
  /** Theo thứ tự các nốt (5 nhẹ, 3 vừa, trầm, cao) */
  notes?: SynthNote[];
  defaultNote?: SynthNote;
  chordNotes?: number[];
  chord?: ChordInfo | null;
  /** Số lần báo lại Đô 4 lúc ngân */
  sustainRepeats?: number;
  /** Chỉ số bước (0 = im lặng) cần "Bỏ qua" */
  skip?: number[];
  /** Dừng (không chạy tiếp) khi tới bước này — để chụp màn "đang đo" */
  stopAt?: number;
}

/** Giờ (ms) của khung cuối cùng lần chạy synthSession gần nhất — cảnh chụp màn hình dùng để căn đồng hồ. */
export let synthLastNow = 0;

const freqOf = (midi: number, cents = 0) => 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);

export function synthSession(plan: SynthPlan = {}, start = 0): MicReportSession {
  const sens = plan.sensitivity ?? 'normal';
  const ses = new MicReportSession(sens, plan.tuningCents ?? 0);
  const floor = plan.floor ?? 0.0001;
  const gate = gateFor(floor, sens);
  ses.start(start);
  let now = start;
  let seq = -1;
  let t0 = start;
  let noteIdx = -1;
  let chordSent = false;
  for (let guard = 0; guard < 20000 && !ses.done; guard++) {
    if (ses.seq !== seq) {
      seq = ses.seq;
      t0 = now;
      if (ses.current?.want !== undefined && ses.current.group !== 'sustain') noteIdx++;
      chordSent = false;
    }
    if (plan.stopAt !== undefined && ses.idx >= plan.stopAt && now - t0 >= 1500) break;
    const p = ses.current!;
    const tIn = now - t0;
    const noise = floor * (1 + 0.15 * Math.sin(now / 37));
    let f = { rms: noise, floor, gate, pitch: null as { freq: number; clarity: number } | null, onset: false, nearMiss: false };
    if (plan.skip?.includes(ses.idx) && tIn >= 100) {
      ses.skip(now);
      continue;
    }
    if (p.group === 'silence') {
      if (plan.ghost && tIn >= 2500 && tIn < 2525) f = { ...f, rms: gate * 3, onset: true, pitch: { freq: 147, clarity: 0.9 } };
      ses.frame(f, now);
      if (plan.ghost && tIn >= 2575 && tIn < 2600) ses.note({ midi: 50, cents: 10 }, now);
    } else if (p.group === 'chord') {
      if (tIn >= 400 && tIn < 425) f = { ...f, rms: 0.004, onset: true, pitch: { freq: 261.6, clarity: 0.7 } };
      ses.frame(f, now);
      if (tIn >= 475 && tIn < 500) for (const m of plan.chordNotes ?? [60]) ses.note({ midi: m, cents: 2 }, now);
      if (tIn >= 650 && !chordSent && ses.chordOnset) {
        chordSent = true;
        ses.chordResult(plan.chord === undefined ? { conclusive: true, present: [60, 64, 67], missing: [], snr: 6.4 } : plan.chord);
      }
    } else if (p.group === 'sustain') {
      if (tIn >= 400) {
        const k = Math.exp(-(tIn - 400) / 1700);
        f = { ...f, rms: Math.max(noise, 0.003 * k), onset: tIn < 425, pitch: { freq: 261.6, clarity: 0.95 } };
      }
      ses.frame(f, now);
      if (tIn >= 475 && tIn < 500) ses.note({ midi: 60, cents: 3, latencyMs: 80 }, now);
      for (let r = 0; r < (plan.sustainRepeats ?? 0); r++) if (tIn >= 1500 + r * 500 && tIn < 1525 + r * 500) ses.note({ midi: 60, cents: 3 }, now);
    } else {
      const want = p.want!;
      const sn = { ...(plan.defaultNote ?? {}), ...(plan.notes?.[noteIdx] ?? {}) };
      const peak = sn.peak ?? 0.002;
      if (tIn >= 400 && tIn < 425) f = { ...f, rms: peak, onset: peak >= 1.5 * gate, nearMiss: !!sn.nearMiss, pitch: { freq: freqOf(want, sn.cents), clarity: 0.95 } };
      else if (tIn >= 425 && tIn < 1000) f = { ...f, rms: Math.max(noise, peak * Math.exp(-(tIn - 425) / 300)), pitch: { freq: freqOf(want, sn.cents), clarity: 0.9 } };
      ses.frame(f, now);
      if (tIn >= 475 && tIn < 500 && sn.midi !== null) ses.note({ midi: sn.midi ?? want, cents: sn.cents ?? 3, latencyMs: sn.latency ?? 85 }, now);
      (sn.extra ?? []).forEach((m, i) => {
        if (tIn >= 600 + i * 50 && tIn < 625 + i * 50) ses.note({ midi: m, cents: 0 }, now);
      });
    }
    now += 25;
    ses.tick(now);
  }
  synthLastNow = now;
  return ses;
}

/** Môi trường giả cho formatMicReport. */
export const SYNTH_ENV = {
  version: '0.18.0',
  at: Date.UTC(2026, 9, 9, 13, 15),
  device: 'iPadOS 26.6 · Safari',
  standalone: true,
  screen: '1180x820',
  ctx: { state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: 0.02 },
  track: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false, channelCount: 1, sampleRate: 48000, latency: 0.01, fallback: false, forced: [] },
  tuningCents: 0,
  latencyMs: 0,
  micEnabled: true,
  autoSens: [{ at: '2026-10-08T12:00:00.000Z', from: 'normal', to: 'high', missed: 5 }],
  stats: { frames: 2400, maxGapMs: 48, slowGaps: 0, onsets: 14, notes: 13, nearMisses: 1 },
  lessons: { sessions: 4, judged: 36, firstTry: 29, wrongNotes: 6, overrides: 1 },
  errors: 0,
};
