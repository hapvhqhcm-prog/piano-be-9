import { describe, expect, it } from 'vitest';
import { AudioResumeWatch, GRACE_MS } from '../src/ui/audioResume';

function env() {
  let t = 0;
  const st = { stopped: false, speaking: false, visible: true, resumes: 0, chip: false, resumeWorks: false };
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let id = 1;
  const w = new AudioResumeWatch({
    needsResume: () => st.stopped,
    tryResume: () => {
      st.resumes++;
      if (st.resumeWorks) st.stopped = false;
    },
    speaking: () => st.speaking,
    visible: () => st.visible,
    now: () => t,
    setTimer: (fn, ms) => {
      timers.push({ at: t + ms, fn, id });
      return id++;
    },
    clearTimer: (x) => {
      const k = timers.findIndex((y) => y.id === x);
      if (k >= 0) timers.splice(k, 1);
    },
    setChip: (s) => (st.chip = s),
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const n = timers[0];
      if (!n || n.at > end) break;
      timers.shift();
      t = n.at;
      n.fn();
    }
    t = end;
  };
  return { w, st, advance };
}

describe('Âm thanh bị iPad ngắt — tự bật lại, không làm phiền bé', () => {
  it('ngắt chốc lát (iPad tự cho chạy lại) → không hiện gì', () => {
    const { w, st, advance } = env();
    st.stopped = true;
    w.check();
    advance(300);
    st.stopped = false;
    w.check();
    advance(10_000);
    expect(st.chip).toBe(false);
    expect(w.shown).toBe(0);
  });

  it('tự resume được → không hiện gì', () => {
    const { w, st, advance } = env();
    st.resumeWorks = true;
    st.stopped = true;
    w.check();
    advance(10);
    expect(st.stopped).toBe(false);
    advance(10_000);
    expect(w.shown).toBe(0);
  });

  it('đang có giọng đọc → không báo, dù lâu', () => {
    const { w, st, advance } = env();
    st.speaking = true;
    st.stopped = true;
    w.check();
    for (let i = 0; i < 10; i++) {
      advance(2000);
      w.check();
    }
    expect(w.shown).toBe(0);
    expect(st.resumes).toBeGreaterThan(3);
  });

  it('dừng lâu, không tự bật được → hiện nút nhỏ; có tiếng lại → ẩn', () => {
    const { w, st, advance } = env();
    st.stopped = true;
    w.check();
    advance(GRACE_MS - 500);
    w.check();
    expect(st.chip).toBe(false);
    advance(1000);
    expect(st.chip).toBe(true);
    st.stopped = false;
    w.check();
    expect(st.chip).toBe(false);
    expect(w.shown).toBe(1);
  });

  it('app đang ẩn → không hiện nút', () => {
    const { w, st, advance } = env();
    st.visible = false;
    st.stopped = true;
    w.check();
    advance(GRACE_MS * 3);
    w.check();
    expect(st.chip).toBe(false);
  });
});
