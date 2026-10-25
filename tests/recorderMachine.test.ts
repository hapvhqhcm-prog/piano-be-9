import { describe, expect, it } from 'vitest';
import { blockedText, fmtClock, initialRec, recNext, type RecEvent, type RecMachine } from '../src/ui/recorderMachine';

/** Trạng thái 🎙️ Máy ghi âm: idle → starting → recording → review → idle (src/ui/recorderMachine.ts). */
const run = (...evs: RecEvent[]): RecMachine => evs.reduce(recNext, initialRec());

describe('recNext', () => {
  it('đường chính: ⏺ → micro bật → ⏹ → xem lại → 💾 Lưu → idle', () => {
    expect(run({ type: 'rec' }).state).toBe('starting');
    expect(run({ type: 'rec' }, { type: 'started' }).state).toBe('recording');
    expect(run({ type: 'rec' }, { type: 'started' }, { type: 'stop' }).state).toBe('review');
    expect(run({ type: 'rec' }, { type: 'started' }, { type: 'stop' }, { type: 'save' })).toEqual(initialRec());
  });
  it('hết 3 phút (cap) → review như ⏹; Bỏ → idle', () => {
    expect(run({ type: 'rec' }, { type: 'started' }, { type: 'cap' }).state).toBe('review');
    expect(run({ type: 'rec' }, { type: 'started' }, { type: 'cap' }, { type: 'discard' }).state).toBe('idle');
  });
  it('micro không bật được → blocked (kèm lý do); ⏺ lại → thử lại', () => {
    const b = run({ type: 'rec' }, { type: 'fail', reason: 'denied' });
    expect(b).toEqual({ state: 'blocked', blocked: 'denied' });
    expect(recNext(b, { type: 'rec' })).toEqual({ state: 'starting', blocked: null });
  });
  it('dừng mà không có gì (quá ngắn) → idle', () => {
    expect(run({ type: 'rec' }, { type: 'started' }, { type: 'empty' }).state).toBe('idle');
  });
  it('sự kiện sai chỗ → giữ nguyên; rời màn → idle từ mọi trạng thái', () => {
    const idle = initialRec();
    expect(recNext(idle, { type: 'stop' })).toBe(idle);
    expect(recNext(idle, { type: 'save' })).toBe(idle);
    const recd = run({ type: 'rec' }, { type: 'started' });
    expect(recNext(recd, { type: 'rec' })).toBe(recd);
    expect(recNext(recd, { type: 'save' })).toBe(recd);
    const rev = run({ type: 'rec' }, { type: 'started' }, { type: 'stop' });
    expect(recNext(rev, { type: 'rec' })).toBe(rev);
    for (const m of [idle, recd, rev, run({ type: 'rec' })]) expect(recNext(m, { type: 'leave' })).toEqual(initialRec());
  });
});

describe('chữ', () => {
  it('đồng hồ m:ss', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(65.9)).toBe('1:05');
    expect(fmtClock(180)).toBe('3:00');
    expect(fmtClock(-3)).toBe('0:00');
  });
  it('lời nhắn khi không ghi được — tiếng Việt; micro tắt → bé tự bật micro (không nhờ bố mẹ)', () => {
    expect(blockedText('mic-off')).toMatch(/Bật micro/);
    expect(blockedText('mic-off')).not.toMatch(/bố mẹ/i);
    expect(blockedText('denied')).not.toMatch(/bố mẹ/i);
    expect(blockedText('denied')).toMatch(/micro/);
    expect(blockedText('error')).toMatch(/thử lại/);
  });
});
