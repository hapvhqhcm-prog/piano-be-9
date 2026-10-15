import { afterEach, describe, expect, it, vi } from 'vitest';
import { findSong } from '../src/music/tune';
import { midiToPitch, pitchToMidi } from '../src/piano/pitchTable';
import { eventsFromTune, pedalOfTune, soundPlan, type DemoEvent } from '../src/ui/components/demo';
import {
  ANTICIPATE_S,
  DemoHands,
  LEGATO_OVERLAP_S,
  MIN_PRESS_S,
  REPEAT_LIFT_S,
  demoSchedule,
  type DemoHandTarget,
} from '../src/ui/components/demoHands';

/** Bàn tay giả: ghi lại mọi lệnh */
function fakeHand() {
  const log: string[] = [];
  const t: DemoHandTarget & { log: string[] } = {
    log,
    demoBegin: (start, pedal) => log.push(`begin ${Object.keys(start).sort().join('+')}${pedal ? ' pedal' : ''}`),
    demoMove: (hand, _f, cross) => log.push(`move ${hand}${cross ? ' ' + cross : ''}`),
    demoFollow: (hand) => log.push(`follow ${hand}`),
    demoKey: (hand, finger, down, stac) => log.push(`${down ? 'down' : 'up'} ${hand}${finger}${stac ? ' stac' : ''}`),
    demoPedal: (down) => log.push(down ? 'pedal down' : 'pedal up'),
    demoEnd: () => log.push('end'),
  };
  return t;
}
function fakeKb() {
  const on = new Set<string>();
  return { on, flash: (p: string, d: boolean) => (d ? on.add(p) : on.delete(p)) };
}

const T0 = 10;
const sched = (id: string, bpm?: number) => {
  const t = findSong(id)!;
  expect(t).toBeTruthy();
  const spb = 60 / (bpm ?? t.bpm ?? 60);
  const events = eventsFromTune(t);
  const plan = soundPlan(events, spb, T0, pedalOfTune(t));
  return { t, spb, events, plan, s: demoSchedule(events, plan, spb) };
};

describe('bàn tay mẫu — lịch hình suy ra từ kế hoạch tiếng', () => {
  it('mỗi nốt → một lần nhấn đúng ngón, CÙNG giờ với nốt trong kế hoạch tiếng (tuần 4)', () => {
    const { events, plan, s } = sched('lightly_row');
    const notes = events.flatMap((e) => e.notes);
    expect(s.presses).toHaveLength(plan.notes.length);
    s.presses.forEach((p, i) => {
      expect(p.on).toBe(plan.notes[i].when);
      expect(p.finger).toBe(notes[i].finger);
      expect(p.hand).toBe(notes[i].hand);
      expect(p.off).toBeGreaterThan(p.on);
    });
    expect(s.start.RH).toBeTruthy();
    expect(s.pedals).toEqual([]);
  });

  it('chậm 0.6×: giờ nhấn vẫn trùng kế hoạch tiếng chậm', () => {
    const t = findSong('lightly_row')!;
    const spb = 60 / ((t.bpm ?? 60) * 0.6);
    const events = eventsFromTune(t);
    const plan = soundPlan(events, spb, T0);
    const s = demoSchedule(events, plan, spb);
    expect(s.presses.map((p) => p.on)).toEqual(plan.notes.map((n) => n.when));
  });

  it('nốt lặp cùng ngón: luôn nhấc trước nốt sau', () => {
    const { s } = sched('lightly_row');
    for (const hand of ['RH', 'LH'] as const) {
      const ps = s.presses.filter((p) => p.hand === hand);
      for (let i = 0; i + 1 < ps.length; i++)
        if (ps[i + 1].finger === ps[i].finger && ps[i + 1].on > ps[i].on) expect(ps[i].off).toBeLessThanOrEqual(ps[i + 1].on - REPEAT_LIFT_S + 1e-9);
    }
  });

  it('ngắt tiếng nhấc sớm (ngắn hơn nửa phách), luyến chồng nhẹ lên nốt sau', () => {
    const r = sched('robot_march');
    const st = r.s.presses.filter((p) => p.stac);
    expect(st.length).toBeGreaterThan(0);
    for (const p of st) {
      expect(p.legato).toBe(false);
      expect(p.off - p.on).toBeLessThan(0.5 * r.spb);
      expect(p.off - p.on).toBeGreaterThanOrEqual(Math.min(MIN_PRESS_S, 0.05) - 1e-9);
    }
    const g = sched('scale_g_rh');
    const leg = g.s.presses.filter((p) => p.legato);
    expect(leg.length).toBeGreaterThan(3);
    for (const p of leg) {
      const next = g.s.presses.find((q) => q.hand === p.hand && q.on > p.on + 1e-6);
      if (!next) continue;
      // giữ phím tới khi nốt sau đã kêu thêm một chút (hai phím cùng lún) — rồi mới nhấc
      expect(p.off).toBeCloseTo(next.on + LEGATO_OVERLAP_S, 6);
    }
  });

  it('gam Sol (tuần 32): luồn ngón cái — ngón đi trước ≤ 150 ms, cả tay theo đúng lúc nốt kêu', () => {
    const { s, spb } = sched('scale_g_rh');
    const unders = s.moves.filter((m) => m.cross === 'under');
    const overs = s.moves.filter((m) => m.cross === 'over');
    expect(unders.length).toBeGreaterThan(0);
    expect(overs.length).toBeGreaterThan(0);
    for (const m of s.moves) {
      expect(m.follow - m.at).toBeCloseTo(Math.min(ANTICIPATE_S, spb * 0.5), 6);
      expect(m.dur).toBeCloseTo(m.follow - m.at, 9);
      // nốt đổi thế có thật ở giờ follow, do đúng ngón đó đàn
      const p = s.presses.find((q) => Math.abs(q.on - m.follow) < 1e-9 && q.hand === m.hand);
      expect(p?.finger).toBe(m.finger);
      expect(m.frame[m.finger - 1]).toBe(p!.midi);
    }
    for (const m of unders) expect(m.finger).toBe(1);
  });

  it('nốt dày: tay đi trước tối đa nửa khoảng cách hai nốt', () => {
    const ev = (time: number, pitch: string, finger: number): DemoEvent => ({ time, dur: 0.25, notes: [{ pitch, finger, hand: 'RH' }] });
    const events = [ev(0, 'C4', 1), ev(0.25, 'D4', 2), ev(0.5, 'E4', 3), ev(0.75, 'F4', 1)];
    const spb = 0.5;
    const s = demoSchedule(events, soundPlan(events, spb, 0), spb);
    expect(s.moves).toHaveLength(1);
    expect(s.moves[0].cross).toBe('under');
    expect(s.moves[0].follow).toBeCloseTo(0.375, 9);
    expect(s.moves[0].follow - s.moves[0].at).toBeCloseTo(0.0625, 9);
  });

  it('hai tay (tuần 12): cả hai bàn tay đặt sẵn, mỗi tay nhấn ngón của mình', () => {
    const { s } = sched('ode_to_joy_both');
    expect(s.start.RH).toBeTruthy();
    expect(s.start.LH).toBeTruthy();
    expect(s.presses.some((p) => p.hand === 'LH' && p.finger)).toBe(true);
    // tay trái: thế tay của tay trái chứa phím của ngón
    const lh = s.presses.find((p) => p.hand === 'LH' && p.finger)!;
    expect(s.start.LH![lh.finger - 1]).toBe(lh.midi);
  });

  it('pedal (tuần 38): mốc đạp / nhả trùng kế hoạch tiếng; tay nhấc theo độ dài nốt, không theo tiếng ngân', () => {
    const { s, plan, events, spb } = sched('silent_night_ped');
    expect(s.pedals.length).toBeGreaterThan(0);
    expect(s.pedals).toEqual(plan.pedals);
    const notes = events.flatMap((e) => e.notes);
    const pedalled = s.presses.filter((_, i) => notes[i].pedal);
    expect(pedalled.length).toBeGreaterThan(0);
    for (const p of pedalled) {
      const i = s.presses.indexOf(p);
      expect(p.off - p.on).toBeLessThanOrEqual(Math.max(MIN_PRESS_S, notes[i].key! * spb) + LEGATO_OVERLAP_S + 1e-9);
    }
    // tiếng còn ngân (pedal) sau khi ngón đã nhấc
    expect(pedalled.some((p) => p.off - p.on < plan.notes[s.presses.indexOf(p)].dur - 0.1)).toBe(true);
    const h = fakeHand();
    const d = new DemoHands(fakeKb(), h, s, events);
    expect(h.log[0]).toMatch(/pedal$/);
    d.tick(s.end + 1);
    const ped = h.log.filter((l) => l.startsWith('pedal'));
    expect(ped).toHaveLength(s.pedals.length * 2);
    expect(ped[0]).toBe('pedal down');
    expect(ped[ped.length - 1]).toBe('pedal up');
  });

  it('phụ đề đúng lúc nốt kêu', () => {
    const { s, events } = sched('lightly_row');
    const caps: string[] = [];
    const d = new DemoHands(fakeKb(), fakeHand(), s, events, { onCaption: (t) => caps.push(t) });
    d.tick(s.captions[2].at - 1e-6);
    expect(caps).toHaveLength(2);
    d.tick(s.captions[2].at);
    expect(caps).toHaveLength(3);
  });
});

describe('bàn tay mẫu — chạy theo đồng hồ, dừng sạch', () => {
  it('tick theo giờ: nhấn/nhả đúng lúc, đuổi kịp khi trễ; stop() nhả hết và trả bàn tay', () => {
    const { s, events } = sched('scale_g_rh');
    const h = fakeHand();
    const kb = fakeKb();
    const d = new DemoHands(kb, h, s, events);
    expect(h.log).toEqual(['begin RH']);
    const p0 = s.presses[0];
    d.tick(p0.on - 0.001);
    expect(kb.on.size).toBe(0);
    d.tick(p0.on);
    expect(kb.on.has(p0.pitch)).toBe(true);
    expect(h.log).toContain(`down RH${p0.finger}`);
    // nhảy cóc (tab ẩn / nạp muộn): mọi cue tới giờ đều chạy, theo thứ tự
    const mid = s.presses[6];
    d.tick(mid.on);
    expect(kb.on.has(mid.pitch)).toBe(true);
    expect(h.log.some((l) => l.startsWith('move RH'))).toBe(true);
    const iUnder = h.log.findIndex((l) => l === 'move RH under');
    if (iUnder >= 0) expect(h.log.indexOf('follow RH', iUnder)).toBeGreaterThan(iUnder);
    d.stop();
    expect(kb.on.size).toBe(0);
    expect(h.log[h.log.length - 1]).toBe('end');
    const n = h.log.length;
    d.tick(s.end + 5);
    d.stop();
    expect(h.log).toHaveLength(n);
  });

  it('chạy hết bài: không còn phím nào sáng, mọi ngón đã nhả', () => {
    const { s, events } = sched('ode_to_joy_both');
    const h = fakeHand();
    const kb = fakeKb();
    const d = new DemoHands(kb, h, s, events);
    d.tick(s.end + 0.01);
    expect(d.finished).toBe(true);
    expect(kb.on.size).toBe(0);
    const downs = h.log.filter((l) => l.startsWith('down')).length;
    const ups = h.log.filter((l) => l.startsWith('up')).length;
    expect(downs).toBe(ups);
  });

  it('cùng một phím hai lần liền (tay khác nhau / nốt lặp): đếm đúng, không tắt sớm', () => {
    const p = 'E4';
    const events: DemoEvent[] = [
      { time: 0, dur: 1, notes: [{ pitch: p, finger: 3, hand: 'RH', key: 2 }] },
      { time: 0.5, dur: 1, notes: [{ pitch: p, finger: 1, hand: 'LH' }] },
    ];
    const s = demoSchedule(events, soundPlan(events, 1, 0), 1);
    const kb = fakeKb();
    const d = new DemoHands(kb, fakeHand(), s, events);
    d.tick(0.6);
    expect(kb.on.has(p)).toBe(true);
    d.tick(1.45);
    expect(kb.on.has(p)).toBe(true); // tay trái đã nhả (1.4 s) nhưng tay phải còn giữ (tới 2 s)
    d.tick(3);
    expect(kb.on.has(p)).toBe(false);
    expect(midiToPitch(pitchToMidi(p))).toBe(p);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// playDemo: một vòng rAF, dừng sạch
// ---------------------------------------------------------------------------------------------------------------------
const shared = vi.hoisted(() => ({ hand: null as unknown }));
vi.mock('../src/ui/components/keyboardHand', async (orig) => {
  const m = await orig<typeof import('../src/ui/components/keyboardHand')>();
  return { ...m, KeyboardHand: { of: () => shared.hand } };
});

describe('playDemo — bàn tay mờ đàn mẫu', () => {
  afterEach(() => vi.unstubAllGlobals());

  function env() {
    let now = 0;
    const rafs = new Map<number, () => void>();
    let id = 0;
    const timers = new Map<number, () => void>();
    vi.stubGlobal('window', {
      setTimeout: (f: () => void) => (timers.set(++id, f), id),
      clearTimeout: (i: number) => timers.delete(i),
    });
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => (rafs.set(++id, f), id));
    vi.stubGlobal('cancelAnimationFrame', (i: number) => rafs.delete(i));
    const audio = {
      stopped: 0,
      scheduled: 0,
      now: () => now,
      outputLatency: 0.02,
      stopAll() {
        this.stopped++;
      },
      pedal() {},
      scheduleFreq() {
        this.scheduled++;
        return Promise.resolve();
      },
    };
    const kb = { ...fakeKb(), cleared: 0, clear() { this.cleared++; } };
    const overlay = { place: vi.fn(), press: vi.fn(), release: vi.fn(), hide: vi.fn() };
    const frame = () => {
      const fs = [...rafs.values()];
      rafs.clear();
      fs.forEach((f) => f());
    };
    return { audio, kb, overlay, frame, rafs, timers, set: (t: number) => (now = t) };
  }

  it('đàn theo đồng hồ âm thanh (trừ độ trễ ra loa) và xong khi hết bài', async () => {
    const { playDemo } = await import('../src/ui/components/demo');
    const e = env();
    const h = fakeHand();
    shared.hand = h;
    const t = findSong('lightly_row')!;
    const beats: number[] = [];
    const run = playDemo(e.audio as never, e.kb as never, e.overlay as never, eventsFromTune(t), { bpm: 120, onBeat: (b) => beats.push(b) });
    expect(e.audio.scheduled).toBeGreaterThan(10);
    await new Promise((r) => setTimeout(r, 0)); // nạp demoHands
    await new Promise((r) => setTimeout(r, 0));
    expect(h.log[0]).toBe('begin RH');
    expect(e.rafs.size).toBe(1); // MỘT vòng rAF
    e.set(0.35 + 0.02 - 1 / 60 - 0.001); // ngay trước khi nốt đầu "nghe thấy"
    e.frame();
    expect(e.kb.on.size).toBe(0);
    e.set(0.35 + 0.02 - 1 / 60 + 0.001);
    e.frame();
    expect(e.kb.on.size).toBe(1);
    expect(beats[beats.length - 1]).toBeCloseTo(0.001 * 2, 6);
    expect(e.overlay.place).not.toHaveBeenCalled(); // bàn tay hoạt hình cũ không xuất hiện
    let finished = false;
    void run.done.then(() => (finished = true));
    e.set(1000);
    e.frame();
    await Promise.resolve();
    expect(finished).toBe(true);
    expect(h.log[h.log.length - 1]).toBe('end');
    expect(e.rafs.size).toBe(0);
    expect(e.timers.size).toBe(0);
    expect(e.kb.on.size).toBe(0);
  });

  it('Dừng giữa chừng: tắt tiếng, nhả phím, trả bàn tay, hủy rAF + hẹn giờ', async () => {
    const { playDemo } = await import('../src/ui/components/demo');
    const e = env();
    const h = fakeHand();
    shared.hand = h;
    const run = playDemo(e.audio as never, e.kb as never, e.overlay as never, eventsFromTune(findSong('silent_night_ped')!), {
      bpm: 90,
      pedal: pedalOfTune(findSong('silent_night_ped')!),
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    e.set(3);
    e.frame();
    expect(e.kb.on.size).toBeGreaterThan(0);
    run.cancel();
    await run.done;
    expect(e.audio.stopped).toBe(1);
    expect(e.kb.on.size).toBe(0);
    expect(e.kb.cleared).toBe(1);
    expect(h.log[h.log.length - 1]).toBe('end');
    expect(h.log.filter((l) => l === 'pedal down').length).toBe(h.log.filter((l) => l === 'pedal up').length);
    expect(e.rafs.size).toBe(0);
    expect(e.timers.size).toBe(0);
    run.cancel(); // gọi lại không sao
    expect(e.audio.stopped).toBe(1);
  });

  it("hand: 'teacher' → bàn tay hoạt hình cũ (không nạp bàn tay mờ)", async () => {
    const { playDemo } = await import('../src/ui/components/demo');
    const e = env();
    const h = fakeHand();
    shared.hand = h;
    const run = playDemo(e.audio as never, e.kb as never, e.overlay as never, eventsFromTune(findSong('lightly_row')!), { hand: 'teacher' });
    await new Promise((r) => setTimeout(r, 0));
    expect(e.overlay.place).toHaveBeenCalled();
    expect(h.log).toEqual([]);
    run.cancel();
  });
});
