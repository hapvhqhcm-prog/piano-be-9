import { describe, expect, it } from 'vitest';
import { MicEventLog, claimAction, claimMessage, classifyClaim, downsample, toPcm16, wavBytes, type MicEvent } from '../src/audio/micClaims';

const lv = (t: number, rms: number, gate = 0.002): MicEvent => ({ t, kind: 'level', rms, gate, floor: gate / 3 });

describe('"🙉 App nghe sai" (2026-11-09)', () => {
  it('nhật ký chỉ giữ vài giây gần nhất', () => {
    const log = new MicEventLog(6);
    for (let t = 0; t < 20; t += 0.5) log.push({ t, kind: 'onset' });
    expect(log.since(0).length).toBe(13);
    expect(log.since(0)[0].t).toBe(13.5);
  });

  it('đoán kiểu lỗi', () => {
    const C4 = 60;
    // micro im tuyệt đối → micro bị ngắt
    expect(classifyClaim([C4], [lv(9, 0), lv(9.5, 0)], 10).kind).toBe('deaf');
    // có lần gõ nhưng không ra nốt → đàn khẽ
    expect(classifyClaim([C4], [lv(9, 0.001), { t: 9.1, kind: 'onset' }, { t: 9.2, kind: 'near' }], 10).kind).toBe('quiet');
    // nghe lệch nửa cung (cao hơn)
    const s = classifyClaim([C4], [{ t: 9, kind: 'note', midi: 61 }], 10);
    expect(s.kind).toBe('semitone');
    expect(s.semitoneDir).toBe(1);
    expect(classifyClaim([C4], [{ t: 9, kind: 'note', midi: 72 }], 10).kind).toBe('octave');
    expect(classifyClaim([C4], [{ t: 9, kind: 'note', midi: 65 }], 10).kind).toBe('wrong');
    expect(classifyClaim([C4], [{ t: 9, kind: 'note', midi: 65 }, { t: 9.6, kind: 'note', midi: 60 }], 10).kind).toBe('heard-right');
    expect(classifyClaim([C4], [{ t: 9, kind: 'voice', midi: 60 }, lv(9, 0.01)], 10).kind).toBe('voice');
    // sự kiện cũ hơn 4 giây không tính
    expect(classifyClaim([C4], [{ t: 3, kind: 'note', midi: 61 }, lv(9, 0.001), { t: 9, kind: 'onset' }], 10).kind).toBe('quiet');
  });

  it('tự sửa an toàn: một bước, có giới hạn', () => {
    const st = { sensitivity: 'normal' as const, tuningCents: 0, autoTuned: false, recentSemis: [] as Array<1 | -1> };
    expect(claimAction(classifyClaim([60], [lv(9, 0)], 10), st)).toEqual({ type: 'restart-mic' });
    const quiet = classifyClaim([60], [lv(9, 0.001), { t: 9, kind: 'onset' }], 10);
    expect(claimAction(quiet, st)).toEqual({ type: 'sensitivity', to: 'high' });
    expect(claimAction(quiet, { ...st, sensitivity: 'high' })).toEqual({ type: 'none' });
    const semi = classifyClaim([60], [{ t: 9, kind: 'note', midi: 61 }], 10);
    // lần đầu: chỉ ghi nhận; lần hai cùng hướng: bù +20 cents
    expect(claimAction(semi, st)).toEqual({ type: 'none' });
    expect(claimAction(semi, { ...st, recentSemis: [1] })).toEqual({ type: 'tuning', cents: 20 });
    expect(claimAction(semi, { ...st, recentSemis: [1], tuningCents: 60 })).toEqual({ type: 'none' });
    // đã có bảng tự chỉnh dây → không đụng
    expect(claimAction(semi, { ...st, recentSemis: [1], autoTuned: true })).toEqual({ type: 'none' });
    expect(claimMessage(quiet, { type: 'sensitivity', to: 'high' })).toContain('nghe kỹ hơn');
  });

  it('WAV 16 bit mono đúng đầu tệp, giảm mẫu, chuẩn hóa', () => {
    const x = new Float32Array(48000).map((_, i) => 0.001 * Math.sin(i / 10));
    const d = downsample(x, 2);
    expect(d.length).toBe(24000);
    const { pcm, gain } = toPcm16(d);
    expect(gain).toBe(64);
    const w = wavBytes(pcm, 24000);
    expect(w.length).toBe(44 + 48000);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint16(34, true)).toBe(16);
  });
});
