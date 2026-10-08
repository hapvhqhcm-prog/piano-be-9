import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECT, detectPitch } from '../src/audio/pitchDetect';
import { SING_RANGE, SungNoteListener, estimateSungMidi, inSingRange, matchSung, singFeedback, type SingFrame } from '../src/music/singMatch';
import { midiToFreq, pitchToMidi } from '../src/piano/pitchTable';
import { WEEKS } from '../src/lessons/lessonEngine';
import { pulseDropWindow } from '../src/music/timing';
import { beatsPerMeasure, findSong, totalBeats } from '../src/music/tune';

const SR = 44100;
const FRAME = 2048;
const HOP = 1024; // ~23 ms — như nhịp khung của MicListener

/**
 * Tiếng hát tổng hợp: sóng sin (thêm hoạ âm nhẹ nếu muốn) có RUNG (vibrato ±vibCents ở vibHz),
 * "VUỐT" lên ở đầu nốt (bắt đầu thấp hơn scoopCents, trượt tới đúng nốt trong scoopSec), rồi im `tailSec`.
 */
function sung(
  midi: number,
  o: { dur?: number; vibCents?: number; vibHz?: number; scoopCents?: number; scoopSec?: number; harmonics?: boolean; tailSec?: number; noise?: number } = {},
): Float32Array {
  const dur = o.dur ?? 1.0;
  const tail = o.tailSec ?? 0.5;
  const n = Math.floor((dur + tail) * SR);
  const out = new Float32Array(n);
  const f0 = midiToFreq(midi);
  let phase = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t >= dur) {
      out[i] = (o.noise ?? 0) * rnd();
      continue;
    }
    let cents = (o.vibCents ?? 0) * Math.sin(2 * Math.PI * (o.vibHz ?? 5) * t);
    if (o.scoopCents && t < (o.scoopSec ?? 0.15)) cents -= o.scoopCents * (1 - t / (o.scoopSec ?? 0.15));
    const f = f0 * Math.pow(2, cents / 1200);
    phase += (2 * Math.PI * f) / SR;
    let s = Math.sin(phase);
    if (o.harmonics) s = 0.7 * s + 0.2 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
    // bật/tắt mềm 20 ms
    const env = Math.min(1, t / 0.02, (dur - t) / 0.02);
    out[i] = 0.3 * env * s + (o.noise ?? 0) * rnd();
  }
  return out;
}

/** Cắt tín hiệu thành khung micro → YIN → SingFrame (giống MicListener.onFrame). */
function framesOf(sig: Float32Array, t0 = 0): SingFrame[] {
  const out: SingFrame[] = [];
  for (let s = 0; s + FRAME <= sig.length; s += HOP) {
    const p = detectPitch(sig.subarray(s, s + FRAME), SR, DEFAULT_DETECT);
    out.push({ t: t0 + (s + FRAME) / SR, freq: p ? p.freq : null, clarity: p ? p.clarity : 0 });
  }
  return out;
}

/** Chạy bộ nghe thời gian thực trên tín hiệu: trả về các nốt hát nó kết luận. */
function listen(sig: Float32Array) {
  const l = new SungNoteListener();
  const got = [];
  for (const f of framesOf(sig)) {
    const r = l.push(f);
    if (r) got.push(r);
  }
  return got;
}

describe('Hát trước khi đàn — nhận cao độ tiếng hát', () => {
  const E4 = pitchToMidi('E4');
  const C5 = pitchToMidi('C5');

  it('tiếng hát đều (không rung) → đúng nốt, lệch ≈ 0 cent', () => {
    const got = listen(sung(E4));
    expect(got).toHaveLength(1);
    const v = matchSung(got[0].midi, 'E4');
    expect(v.ok).toBe(true);
    expect(Math.abs(v.cents)).toBeLessThanOrEqual(10);
    expect(v.octave).toBe(0);
  });

  it('RUNG ±30 cent ở 5 Hz → trung vị vẫn đúng nốt (±15 cent)', () => {
    const got = listen(sung(E4, { vibCents: 30, vibHz: 5, dur: 1.2 }));
    expect(got).toHaveLength(1);
    const v = matchSung(got[0].midi, 'E4');
    expect(v.ok).toBe(true);
    expect(Math.abs(v.cents)).toBeLessThanOrEqual(15);
  });

  it('VUỐT lên ở đầu nốt (bắt đầu thấp 250 cent, trượt 150 ms) + rung → vẫn đúng nốt', () => {
    const got = listen(sung(pitchToMidi('G4'), { scoopCents: 250, scoopSec: 0.15, vibCents: 30, harmonics: true }));
    expect(got).toHaveLength(1);
    const v = matchSung(got[0].midi, 'G4');
    expect(v.ok).toBe(true);
    expect(Math.abs(v.cents)).toBeLessThanOrEqual(20);
  });

  it('hát THẤP một quãng 8 (Đô5 → hát Đô4) → vẫn đúng, octave = −1', () => {
    const got = listen(sung(C5 - 12, { vibCents: 30, scoopCents: 150 }));
    expect(got).toHaveLength(1);
    const v = matchSung(got[0].midi, 'C5');
    expect(v).toMatchObject({ ok: true, octave: -1 });
    expect(singFeedback(v, 0)).toMatch(/Đúng nốt rồi/);
  });

  it('hát CAO một quãng 8 cũng được nhận', () => {
    const v = matchSung(pitchToMidi('A4') + 0.2, 'A3');
    expect(v).toMatchObject({ ok: true, octave: 1, cents: 20 });
  });

  it('hát sai nốt (Rê thay vì Mi) → chưa đúng, gợi ý "cao lên", lời nhắn KHÔNG chê', () => {
    const got = listen(sung(pitchToMidi('D4'), { vibCents: 30 }));
    const v = matchSung(got[0].midi, 'E4');
    expect(v.ok).toBe(false);
    expect(v.direction).toBe('low');
    const msg = singFeedback(v, 1);
    expect(msg).not.toMatch(/sai|kém|tệ|dở/i);
  });

  it('lệch 80 cent → "gần đúng" + hướng gợi ý; lệch 40 cent → đúng (dung sai ±50)', () => {
    expect(matchSung(64 + 0.8, 'E4')).toMatchObject({ ok: false, close: true, direction: 'high' });
    expect(matchSung(64 - 0.4, 'E4')).toMatchObject({ ok: true, direction: 'ok' });
    expect(singFeedback(matchSung(64 + 0.8, 'E4'), 1)).toMatch(/Gần đúng/);
    // Hát 2 lần chưa trúng → vẫn khen, đi tiếp
    expect(singFeedback(matchSung(60, 'E4'), 2)).toMatch(/hay lắm/);
  });

  it('ba nốt hát liền nhau (có nghỉ lấy hơi) → bộ nghe tách đúng 3 nốt', () => {
    const parts = [sung(pitchToMidi('C4'), { vibCents: 25, tailSec: 0.4 }), sung(E4, { vibCents: 25, scoopCents: 200, tailSec: 0.4 }), sung(pitchToMidi('G4'), { vibCents: 25, tailSec: 0.5 })];
    const all = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    const got = listen(all);
    expect(got).toHaveLength(3);
    expect(got.map((g, k) => matchSung(g.midi, ['C4', 'E4', 'G4'][k]).ok)).toEqual([true, true, true]);
  });

  it('tiếng động ngắn (< 0,45 s) không bị tính là nốt hát; im lặng → không có kết quả', () => {
    expect(listen(sung(E4, { dur: 0.2 }))).toHaveLength(0);
    expect(listen(new Float32Array(SR))).toHaveLength(0);
    expect(estimateSungMidi([])).toBeNull();
  });

  it('hát liền một hơi dài → chấm luôn sau ~1,6 s (không chờ im)', () => {
    const got = listen(sung(E4, { dur: 3, vibCents: 30, tailSec: 0 }));
    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(matchSung(got[0].midi, 'E4').ok).toBe(true);
  });

  it('tầm giọng bé trai: La3–Rê5', () => {
    expect(SING_RANGE).toEqual(['A3', 'D5']);
    expect(inSingRange('A3')).toBe(true);
    expect(inSingRange('D5')).toBe(true);
    expect(inSingRange('G3')).toBe(false);
    expect(inSingRange('E5')).toBe(false);
  });
});

describe('Hoạt động "sing" trong giáo trình', () => {
  const sings = WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a, i) => (a.kind === 'sing' ? [{ w: w.week, l, a, i }] : []))));

  it('mỗi tuần 6–10 có một hoạt động hát, ở CUỐI bài', () => {
    for (let w = 6; w <= 10; w++) {
      const ofWeek = sings.filter((x) => x.w === w);
      expect(ofWeek, `tuần ${w}`).toHaveLength(1);
      expect(ofWeek[0].i).toBe(ofWeek[0].l.activities.length - 1);
      expect(ofWeek[0].l.isWeekTest).toBeFalsy();
    }
  });

  it('mỗi lượt 2–3 nốt, đều trong tầm giọng của bé', () => {
    for (const { a } of sings) {
      if (a.kind !== 'sing') continue;
      expect(a.rounds.length).toBeGreaterThan(0);
      expect(a.rounds.length).toBeLessThanOrEqual(3);
      for (const r of a.rounds) {
        expect(r.notes.length).toBeGreaterThanOrEqual(2);
        expect(r.notes.length).toBeLessThanOrEqual(3);
        for (const p of r.notes) expect(inSingRange(p), p).toBe(true);
        if (r.fingers) expect(r.fingers).toHaveLength(r.notes.length);
      }
    }
  });
});

describe('Giữ nhịp trong đầu (pulseDrop) trong giáo trình', () => {
  it('2–3 lượt THEO NHỊP ở tuần 5–8 bật cờ; bài đủ dài để máy im 2 ô giữa bài', () => {
    const flagged = WEEKS.flatMap((w) => w.lessons.flatMap((l) => l.activities.flatMap((a) => (a.kind === 'song' && a.pulseDrop ? [{ w: w.week, a }] : []))));
    expect(flagged.length).toBeGreaterThanOrEqual(2);
    expect(flagged.length).toBeLessThanOrEqual(3);
    for (const { w, a } of flagged) {
      expect(w).toBeGreaterThanOrEqual(5);
      expect(w).toBeLessThanOrEqual(8);
      expect(a.mode).toBe('tempo');
      const t = findSong(a.songId)!;
      expect(pulseDropWindow(totalBeats(t), beatsPerMeasure(t)), a.songId).not.toBeNull();
    }
  });
});
