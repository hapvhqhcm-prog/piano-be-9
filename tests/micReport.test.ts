import { describe, expect, it } from 'vitest';
import { MicAnalyzer, gateFor } from '../src/audio/micAnalyzer';
import {
  AFTER_HIT_MS,
  MicReportSession,
  NOTE_WAIT_MS,
  SILENCE_MS,
  analyze,
  buildPrompts,
  formatMicReport,
  heardAt,
  type ReportEnv,
} from '../src/audio/micReport';
import { loadMicReport, saveMicReport } from '../src/audio/micLogStore';
import { composeReport, type DiagSnapshot } from '../src/pwa/diagnostics';
import { renderPiano, SIM_RATE } from './pianoSim';
import { SYNTH_ENV, synthSession } from './micReportSynth';

const ENV = SYNTH_ENV as ReportEnv;

describe('micReport — bài đo tự động', () => {
  it('kịch bản: im lặng → 5 nhẹ → 3 vừa → trầm → cao → hợp âm → ngân', () => {
    const p = buildPrompts();
    expect(p.map((x) => x.group)).toEqual(['silence', 'soft', 'soft', 'soft', 'soft', 'soft', 'medium', 'medium', 'medium', 'low', 'high', 'chord', 'sustain']);
    expect(p.filter((x) => x.group === 'soft').map((x) => x.want)).toEqual([60, 62, 64, 65, 67]);
    expect(p.find((x) => x.group === 'low')?.want).toBe(48);
    expect(p.find((x) => x.group === 'high')?.want).toBe(72);
  });

  it('micro nghe tốt: đủ 10/10 nốt, tự sang bước khi nghe đúng, báo cáo gọn đúng định dạng', () => {
    const ses = synthSession({ sustainRepeats: 0 });
    expect(ses.done).toBe(true);
    expect(ses.notes).toHaveLength(10);
    expect(ses.notes.every((r) => r.status === 'ok')).toBe(true);
    // nghe đúng ở ~475 ms → sang nốt sau AFTER_HIT_MS sau đó (không chờ hết 6 s)
    expect(ses.notes[0].ms).toBeGreaterThan(400);
    expect(ses.notes[0].ms).toBeLessThan(600);
    const dur = ses.endedAt - ses.startedAt;
    expect(dur).toBeLessThan(SILENCE_MS + 10 * (600 + AFTER_HIT_MS) + 2 * 3000 + 1000);
    const r = ses.notes[0];
    expect(r.latencyMs).toBe(85);
    expect(r.peak).toBeCloseTo(0.002, 5);
    expect(r.gate).toBeCloseTo(gateFor(0.0001, 'normal'), 6);
    expect(r.clarity).toBeGreaterThan(0.9);
    expect(ses.silence?.ghosts).toEqual([]);
    expect(ses.silence?.overGate).toBe(0);
    expect(ses.chord?.chord?.present).toEqual([60, 64, 67]);
    expect(ses.sustain?.status).toBe('ok');
    expect(ses.sustain?.repeats).toBe(0);
    expect(ses.sustain?.decayDbPerS).toBeGreaterThan(1);

    const rep = formatMicReport(ses, ENV);
    const lines = rep.text.split('\n');
    expect(lines[0]).toMatch(/^=== BÁO CÁO MICRO Piano bé v0\.18\.0 \d\d\/10\/2026 \d\d:\d\d ===$/);
    expect(lines.length).toBeLessThanOrEqual(60);
    expect(lines[lines.length - 2]).toMatch(/^Đề xuất của app: giữ độ nhạy Vừa/);
    const data = lines[lines.length - 1];
    expect(data.startsWith('DATA {')).toBe(true);
    expect(data.length - 5).toBeLessThanOrEqual(1500);
    const j = JSON.parse(data.slice(5));
    expect(j.n).toHaveLength(10);
    expect(j.rec).toBe('normal');
    expect(rep.text).toContain('[Track] ec=tắt ns=tắt agc=tắt');
    expect(rep.text).toContain('sr=48000');
    expect(rep.text).toContain('nhẹ C4→C4 | +3 |');
    expect(rep.text).toContain('[Mô phỏng] low:');
    expect(rep.text).toContain('[Buổi học gần đây] 4 buổi · micro chấm 36 lượt · đúng lần đầu 81%');
    expect(rep.summary[0]).toBe('✅ Micro nghe tốt: nghe đúng 10/10 nốt.');
    expect(rep.summary.length).toBeGreaterThanOrEqual(1);
    expect(rep.summary.length).toBeLessThanOrEqual(4);
    // không có ký tự lạ làm hỏng khi dán (tab)
    expect(rep.text).not.toContain('\t');
  });

  it('nốt không nghe được → chờ đủ 6 s rồi tự sang nốt sau (đánh dấu ✗)', () => {
    const ses = synthSession({ notes: [{}, { midi: null, peak: 0.0003 }] });
    const r = ses.notes[1];
    expect(r.status).toBe('none');
    expect(r.got).toBeNull();
    expect(r.ms).toBeNull();
    expect(ses.notes[2].status).toBe('ok');
    const text = formatMicReport(ses, ENV).text;
    expect(text).toContain('nhẹ D4→KHÔNG ✗');
    expect(analyze(ses).summary.join(' ')).toContain('Còn hụt nốt đàn nhẹ (Rê)');
  });

  it('đàn nhẹ sát ngưỡng → mô phỏng thấy độ nhạy Cao nghe được → đề xuất Cao (không tự đổi)', () => {
    const floor = 0.0001;
    // đỉnh giữa 1,5 × ngưỡng Cao và 1,5 × ngưỡng Vừa
    const peak = 1.5 * gateFor(floor, 'high') * 1.3;
    expect(peak).toBeLessThan(1.5 * gateFor(floor, 'normal'));
    const soft = Array.from({ length: 5 }, () => ({ peak, midi: null, nearMiss: true }));
    const ses = synthSession({ floor, notes: soft });
    const an = analyze(ses);
    expect(an.sim.normal.soft).toEqual([0, 5]);
    expect(an.sim.high.soft).toEqual([5, 5]);
    expect(an.sim.low.soft[0]).toBe(0);
    expect(an.recommend).toBe('high');
    expect(ses.notes[0].nearMiss).toBe(1);
    const rep = formatMicReport(ses, ENV, an);
    expect(rep.text).toMatch(/Đề xuất của app: đổi độ nhạy Vừa → Cao/);
    expect(rep.summary[0]).toMatch(/^(⚠️|🙂)/);
  });

  it('phòng ồn: "nốt ma" lúc im lặng được ghi lại và đếm trong mô phỏng', () => {
    const ses = synthSession({ ghost: true });
    expect(ses.silence?.ghosts).toEqual([50]);
    expect(ses.silence?.onsets).toBe(1);
    const an = analyze(ses);
    expect(an.sim.normal.ghosts).toBeGreaterThan(0);
    expect(an.summary.join(' ')).toContain('bớt tiếng ồn');
    expect(formatMicReport(ses, ENV, an).text).toContain('nốt ma 1(D3)');
  });

  it('đàn lệch dây +35 cent → đề xuất "Chỉnh theo đàn nhà" với bù ước lượng', () => {
    const ses = synthSession({ defaultNote: { cents: 35 }, tuningCents: 10 });
    const an = analyze(ses);
    expect(an.tuning.medianCents).toBe(35);
    expect(an.tuning.suggested).toBe(45);
    expect(an.tuning.calibrate).toBe(true);
    expect(an.advice).toContain('Chỉnh theo đàn nhà');
    const small = analyze(synthSession({ defaultNote: { cents: -12 } }));
    expect(small.tuning.calibrate).toBe(false);
  });

  it('nghe nhầm, đếm đôi, bỏ qua, ngân bị báo lại, hợp âm không chắc', () => {
    const ses = synthSession({
      notes: [{ extra: [60] }, { midi: 64, extra: [62] }],
      skip: [3],
      sustainRepeats: 2,
      chordNotes: [60, 67],
      chord: { conclusive: false, present: [60], missing: [64, 67], snr: 1.2 },
    });
    expect(ses.notes[0].doubles).toBe(1);
    expect(ses.notes[1].status).toBe('ok'); // nghe nhầm Mi trước, rồi đúng Rê
    expect(ses.notes[1].wrong).toEqual([64]);
    expect(ses.notes[2].status).toBe('skipped');
    expect(ses.sustain?.repeats).toBe(2);
    const text = formatMicReport(ses, ENV).text;
    expect(text).toContain('đôi×1');
    expect(text).toContain('nhẹ E4→BỎ QUA');
    expect(text).toContain('app báo: C4,G4');
    expect(text).toContain('NNLS không chắc có C4 thiếu E4,G4');
    expect(text).toContain('báo lại 2 lần');
    // nốt bỏ qua không tính vào tổng
    expect(analyze(ses).total).toBe(9);
  });

  it('dừng giữa chừng (micro bị ngắt) → vẫn soạn được báo cáo phần đã đo', () => {
    const ses = new MicReportSession('normal');
    ses.start(0);
    ses.frame({ rms: 0.0001, floor: 0.0001, gate: 0.00025, pitch: null, onset: false }, 100);
    ses.tick(SILENCE_MS + 1);
    ses.abort(SILENCE_MS + 10);
    expect(ses.done).toBe(true);
    const rep = formatMicReport(ses, ENV);
    expect(rep.text).toContain('bị dừng giữa chừng');
    expect(rep.text.split('\n').length).toBeLessThanOrEqual(60);
    expect(rep.summary[0]).toMatch(/Micro còn hụt|Chưa đo/);
  });

  it('heardAt khớp ngưỡng bắt lần gõ (1,5 × gateFor)', () => {
    const floor = 0.0002;
    expect(heardAt({ peak: 1.5 * gateFor(floor, 'normal') * 1.01, floor }, 'normal')).toBe(true);
    expect(heardAt({ peak: 1.5 * gateFor(floor, 'normal') * 0.99, floor }, 'normal')).toBe(false);
  });

  it('lưu báo cáo gần nhất → 🩺 Kiểm tra iPad chép câu tóm tắt', () => {
    const mem = new Map<string, string>();
    const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const ses = synthSession();
    const rep = formatMicReport(ses, ENV);
    saveMicReport({ at: '2026-10-09T13:15:00.000Z', summary: rep.summary, text: rep.text }, kv);
    const got = loadMicReport(kv);
    expect(got?.summary).toEqual(rep.summary);
    const snap = {
      at: Date.UTC(2026, 9, 9),
      appVersion: '0.18.0',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15',
      maxTouchPoints: 5,
      standalone: true,
      screen: { w: 1180, h: 820, vw: 1180, vh: 820, dpr: 2 },
      language: 'vi-VN',
      updateReady: false,
      audio: { supported: true, state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: 0.02, heard: null },
      voice: { supported: true, loaded: true, viVoices: ['Linh'], total: 10, enabled: true, heard: null },
      mic: { getUserMedia: true, secure: true, permission: 'granted', state: 'off', enabled: true, sensitivity: 'normal', tuningCents: 0, latencyMs: 0, lastCheck: null, lastReport: { at: got!.at, summary: got!.summary } },
      storage: { text: '1 MB', percent: 1, ok: true, full: false, persisted: true, lastBackupAt: 0, sessions: 0, completed: 0, curriculumRev: 1, week: 1 },
      offline: { swSupported: true, controller: true, caches: ['x'], online: true },
      perf: { planMs: 1, homeMs: 1, cores: 4, memoryGB: null },
    } as DiagSnapshot;
    const text = composeReport(snap);
    expect(text).toContain('Báo cáo micro gần nhất');
    expect(text).toContain('[🎙️ Báo cáo micro gần nhất');
    expect(text).toContain(rep.summary[0]);
  });
});

describe('micReport — tiếng đàn giả lập qua MicAnalyzer (toàn bộ đường xử lý)', () => {
  it('im lặng không có nốt ma; Đô, Rê đàn nhẹ được nghe với số đo hợp lý', { timeout: 30000 }, () => {
    // 0–5 s im lặng; Đô 4 lúc 5,5 s; Rê 4 lúc 7,6 s (sau khi bước Đô xong ≈ 5,6 + 0,9 s)
    const sig = renderPiano(
      [
        { midi: 60, start: 5.5, dur: 0.8, vel: 0.5 },
        { midi: 62, start: 7.6, dur: 0.8, vel: 0.5 },
      ],
      9.5,
      { strings: true, reverb: 0.5, gain: 0.08, noise: 0.004, seed: 7 },
    );
    const a = new MicAnalyzer();
    const ses = new MicReportSession('normal');
    const hop = Math.round(0.025 * SIM_RATE);
    for (let i = 2048; i < sig.length; i += hop) {
      const t = i / SIM_RATE;
      const now = t * 1000;
      if (ses.idx < 0) ses.start(now);
      const f = a.process(sig.subarray(i - 2048, i), SIM_RATE, t);
      ses.frame(f, now);
      if (f.note) ses.note({ midi: f.note.midi, cents: f.note.cents, latencyMs: f.note.at !== undefined ? (t - f.note.at) * 1000 : null }, now);
      if (ses.tick(now)) a.reset(true);
    }
    expect(ses.silence?.ghosts).toEqual([]);
    const [c, d] = ses.notes;
    expect(c.status).toBe('ok');
    expect(d.status).toBe('ok');
    for (const r of [c, d]) {
      expect(r.peak).toBeGreaterThan(r.gate * 1.5);
      expect(Math.abs(r.cents!)).toBeLessThan(25);
      expect(r.latencyMs).toBeGreaterThan(0);
      expect(r.latencyMs).toBeLessThan(250);
      expect(r.clarity).toBeGreaterThan(0.8);
    }
    expect(ses.notes[2].want).toBe(64);
    expect(NOTE_WAIT_MS).toBe(6000);
  });
});
