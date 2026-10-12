import { describe, expect, it } from 'vitest';
import { ActivityWakeLock, type WakeEnv } from '../src/ui/screenAwake';

function env(opts: { api?: boolean; visible?: boolean } = {}) {
  let t = 0;
  let vis = opts.visible ?? true;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const sentinels: Array<{ released: boolean; fire: () => void }> = [];
  const api = {
    requests: 0,
    async request() {
      api.requests++;
      const ls: Array<() => void> = [];
      const s = {
        released: false,
        async release() {
          s.released = true;
          ls.forEach((f) => f());
        },
        addEventListener: (_: 'release', f: () => void) => ls.push(f),
      };
      sentinels.push({ released: false, fire: () => void s.release() });
      return s;
    },
  };
  const e: WakeEnv = {
    api: opts.api === false ? null : api,
    now: () => t,
    visible: () => vis,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimer: (id) => {
      const k = timers.findIndex((x) => x.id === id);
      if (k >= 0) timers.splice(k, 1);
    },
  };
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
  return { e, api, advance, sentinels, setVisible: (v: boolean) => (vis = v) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Giữ màn hình sáng theo hoạt động', () => {
  it('chạm → giữ sáng; 5 phút không hoạt động → thả', async () => {
    const { e, api, advance } = env();
    const w = new ActivityWakeLock(e, 300_000);
    w.poke();
    await flush();
    expect(w.held).toBe(true);
    advance(200_000);
    w.poke(); // micro nghe tiếng đàn
    advance(250_000);
    expect(w.held).toBe(true);
    advance(60_000);
    expect(w.held).toBe(false);
    expect(api.requests).toBe(1);
  });

  it('iOS tự thả khi ẩn app → hiện lại trong lúc đang học thì xin lại', async () => {
    const { e, api, sentinels } = env();
    const w = new ActivityWakeLock(e, 300_000);
    w.poke();
    await flush();
    sentinels[0].fire();
    await flush();
    expect(w.held).toBe(false);
    w.onVisible();
    await flush();
    expect(w.held).toBe(true);
    expect(api.requests).toBe(2);
  });

  it('không hỗ trợ / app đang ẩn → không làm gì', async () => {
    const a = env({ api: false });
    const w1 = new ActivityWakeLock(a.e);
    w1.poke();
    await flush();
    expect(w1.held).toBe(false);
    const b = env({ visible: false });
    const w2 = new ActivityWakeLock(b.e);
    w2.poke();
    await flush();
    expect(w2.held).toBe(false);
    expect(b.api.requests).toBe(0);
  });
});
