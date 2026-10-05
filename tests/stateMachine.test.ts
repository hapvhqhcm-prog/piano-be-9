import { describe, expect, it } from 'vitest';
import { PracticeStateMachine } from '../src/practice/PracticeStateMachine';

const toWaitParent = (sm: PracticeStateMachine) => {
  sm.send({ type: 'SHOWN' });
  sm.send({ type: 'SAMPLE_END' });
};

describe('PracticeStateMachine (§5)', () => {
  it('vòng lặp đầy đủ: INTRO → … → COMPLETE', () => {
    const sm = new PracticeStateMachine(2);
    expect(sm.snapshot.state).toBe('INTRO');
    sm.send({ type: 'NEXT' });
    expect(sm.snapshot.state).toBe('READY');
    sm.send({ type: 'NEXT' });
    expect(sm.snapshot.state).toBe('SHOW_NOTE');
    expect(sm.send({ type: 'SHOWN' })).toEqual([{ type: 'playSample', index: 0 }]);
    expect(sm.snapshot.state).toBe('PLAY_SAMPLE');
    sm.send({ type: 'SAMPLE_END' });
    expect(sm.snapshot.state).toBe('WAIT_PARENT');
    expect(sm.send({ type: 'CORRECT' })).toContainEqual({ type: 'record', index: 0, result: 'correct' });
    expect(sm.snapshot.state).toBe('RESULT');
    sm.send({ type: 'CONTINUE' });
    expect(sm.snapshot.state).toBe('NEXT_NOTE');
    sm.send({ type: 'NEXT' });
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 1 });
    toWaitParent(sm);
    sm.send({ type: 'CORRECT' });
    sm.send({ type: 'CONTINUE' });
    expect(sm.send({ type: 'NEXT' })).toEqual([{ type: 'complete' }]);
    expect(sm.snapshot.state).toBe('COMPLETE');
  });

  it('không sang WAIT_PARENT trước khi âm mẫu kết thúc', () => {
    const sm = new PracticeStateMachine(1);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'SHOWN' });
    expect(sm.send({ type: 'CORRECT' })).toBeNull();
    expect(sm.send({ type: 'RETRY' })).toBeNull();
    expect(sm.snapshot.state).toBe('PLAY_SAMPLE');
  });

  it('"Nghe lại" ở WAIT_PARENT phát lại mẫu, KHÔNG đổi state', () => {
    const sm = new PracticeStateMachine(3);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    const before = { ...sm.snapshot };
    expect(sm.send({ type: 'REPLAY' })).toEqual([{ type: 'playSample', index: 0 }]);
    expect(sm.snapshot).toEqual(before);
  });

  it('"Thử lại" → RESULT → quay về SHOW_NOTE của CHÍNH nốt đó', () => {
    const sm = new PracticeStateMachine(3);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    expect(sm.send({ type: 'RETRY' })).toContainEqual({ type: 'record', index: 0, result: 'retry' });
    sm.send({ type: 'CONTINUE' });
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 0 });
  });

  it('"Quay lại" ở WAIT_PARENT về SHOW_NOTE của nốt trước', () => {
    const sm = new PracticeStateMachine(3);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    sm.send({ type: 'CORRECT' });
    sm.send({ type: 'CONTINUE' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    expect(sm.snapshot.index).toBe(1);
    expect(sm.send({ type: 'BACK' })).toEqual([{ type: 'stopAudio' }]);
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 0 });
  });

  it('"Quay lại" ở nốt đầu tiên về READY, rồi INTRO, rồi thoát', () => {
    const sm = new PracticeStateMachine(2);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    sm.send({ type: 'BACK' });
    expect(sm.snapshot.state).toBe('READY');
    sm.send({ type: 'BACK' });
    expect(sm.snapshot.state).toBe('INTRO');
    expect(sm.send({ type: 'BACK' })).toEqual([{ type: 'exit' }]);
  });

  it('"Sửa" đổi kết quả vừa bấm và phát effect amendLast', () => {
    const sm = new PracticeStateMachine(2);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    sm.send({ type: 'CORRECT' });
    expect(sm.send({ type: 'EDIT' })).toContainEqual({ type: 'amendLast', index: 0, result: 'retry', source: 'parent' });
    expect(sm.snapshot.lastResult).toBe('retry');
    sm.send({ type: 'CONTINUE' });
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 0 });
  });

  it('auto-advance TẮT mặc định: AUTO_ADVANCE bị bỏ qua', () => {
    const sm = new PracticeStateMachine(2);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    const fx = sm.send({ type: 'CORRECT' });
    expect(fx?.some((e) => e.type === 'startAutoAdvance')).toBe(false);
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
    expect(sm.snapshot.state).toBe('RESULT');
  });

  it('auto-advance BẬT: đếm sau "Đúng rồi", độ trễ kẹp 2–10 s, không chạy ở INTRO/READY', () => {
    const sm = new PracticeStateMachine(2, { autoAdvance: true, autoAdvanceDelaySec: 30 });
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
    sm.send({ type: 'NEXT' });
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    expect(sm.send({ type: 'CORRECT' })).toContainEqual({ type: 'startAutoAdvance', delaySec: 10 });
    sm.send({ type: 'AUTO_ADVANCE' });
    expect(sm.snapshot.state).toBe('NEXT_NOTE');
  });

  it('auto-advance không áp dụng khi kết quả là "Thử lại"', () => {
    const sm = new PracticeStateMachine(2, { autoAdvance: true, autoAdvanceDelaySec: 4 });
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    sm.send({ type: 'RETRY' });
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
  });
});

describe('PracticeStateMachine — micro (MIC_ASSESSMENT)', () => {
  const ready = (sm: PracticeStateMachine) => {
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'SHOWN' });
  };

  it('HEARD chỉ hợp lệ ở WAIT_PARENT (không nghe khi đang phát mẫu)', () => {
    const sm = new PracticeStateMachine(2);
    ready(sm);
    expect(sm.send({ type: 'HEARD' })).toBeNull();
    sm.send({ type: 'SAMPLE_END' });
    const fx = sm.send({ type: 'HEARD' })!;
    expect(fx).toContainEqual({ type: 'recordMic', index: 0 });
    expect(fx.some((e) => e.type === 'record')).toBe(false); // không ghi vào PARENT
    expect(sm.snapshot).toMatchObject({ state: 'RESULT', lastResult: 'correct', lastSource: 'mic' });
  });

  it('micro nghe đúng → tự chuyển (mặc định), kể cả khi auto-advance của bố mẹ đang TẮT', () => {
    const sm = new PracticeStateMachine(2, { autoAdvance: false, autoAdvanceDelaySec: 4 });
    ready(sm);
    sm.send({ type: 'SAMPLE_END' });
    expect(sm.send({ type: 'HEARD' })).toContainEqual({ type: 'startAutoAdvance', delaySec: 1.2 });
    sm.send({ type: 'AUTO_ADVANCE' });
    expect(sm.snapshot.state).toBe('NEXT_NOTE');
  });

  it('tắt micAutoNext → không tự chuyển', () => {
    const sm = new PracticeStateMachine(2, { autoAdvance: false, autoAdvanceDelaySec: 4, micAutoNext: false });
    ready(sm);
    sm.send({ type: 'SAMPLE_END' });
    expect(sm.send({ type: 'HEARD' })!.some((e) => e.type === 'startAutoAdvance')).toBe(false);
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
  });

  it('"Sửa" sau khi micro chấm → ghi đè bản ghi micro, dừng tự chuyển, về nốt đó', () => {
    const sm = new PracticeStateMachine(2);
    ready(sm);
    sm.send({ type: 'SAMPLE_END' });
    sm.send({ type: 'HEARD' });
    const fx = sm.send({ type: 'EDIT' })!;
    expect(fx).toContainEqual({ type: 'amendLast', index: 0, result: 'retry', source: 'mic' });
    expect(fx.some((e) => e.type === 'startAutoAdvance')).toBe(false);
    expect(sm.send({ type: 'AUTO_ADVANCE' })).toBeNull();
    sm.send({ type: 'CONTINUE' });
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 0 });
  });

  it('SKIP ("Bỏ qua — mai ôn lại"): từ chờ → ghi Thử lại rồi sang nốt sau; từ kết quả Thử lại → sang nốt sau, không ghi thêm', () => {
    const sm = new PracticeStateMachine(3);
    sm.send({ type: 'NEXT' });
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    expect(sm.send({ type: 'SKIP' })).toContainEqual({ type: 'record', index: 0, result: 'retry' });
    expect(sm.snapshot.state).toBe('NEXT_NOTE');
    sm.send({ type: 'NEXT' });
    expect(sm.snapshot).toMatchObject({ state: 'SHOW_NOTE', index: 1 });
    toWaitParent(sm);
    sm.send({ type: 'RETRY' });
    expect(sm.send({ type: 'SKIP' })).toEqual([{ type: 'cancelAutoAdvance' }]);
    expect(sm.snapshot.state).toBe('NEXT_NOTE');
    sm.send({ type: 'NEXT' });
    toWaitParent(sm);
    sm.send({ type: 'CORRECT' });
    expect(sm.send({ type: 'SKIP' })).toBeNull(); // đã đúng thì không có "Bỏ qua"
  });
});
