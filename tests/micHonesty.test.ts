import { describe, expect, it } from 'vitest';
import {
  MIC_DEAF_SITUATIONS,
  MIC_DEAF_WINDOW_MS,
  micHonestyInit,
  micHonestyStep,
  type MicHonestyEvent,
  type MicHonestyState,
} from '../src/audio/micHonesty';

/** Micro nói thật: bé đàn mà micro không ra nốt 3 lần liền → nói thật; nghe ra nốt SAI thì không (src/audio/micHonesty.ts). */

function run(events: MicHonestyEvent[], s: MicHonestyState = micHonestyInit()) {
  const shows: number[] = [];
  events.forEach((e, i) => {
    const r = micHonestyStep(s, e);
    s = r.state;
    if (r.show) shows.push(i);
  });
  return { s, shows };
}

/** Một "tình huống": bé đàn lúc t, rồi đồng hồ chạy qua cửa sổ mà không nghe ra nốt nào */
const deaf = (t: number): MicHonestyEvent[] => [
  { type: 'activity', at: t },
  { type: 'activity', at: t + 200 },
  { type: 'tick', at: t + MIC_DEAF_WINDOW_MS + 10 },
];

describe('micHonestyStep', () => {
  it('3 tình huống liền "đàn mà không ra nốt" → hiện đúng 1 lần', () => {
    const { s, shows } = run([...deaf(0), ...deaf(5000), ...deaf(10000), ...deaf(15000)]);
    expect(MIC_DEAF_SITUATIONS).toBe(3);
    expect(shows).toEqual([8]); // tick của tình huống thứ 3
    expect(s.shown).toBe(true);
  });

  it('micro nghe ra nốt (kể cả SAI) → đếm lại từ đầu, không hiện', () => {
    const { shows, s } = run([...deaf(0), ...deaf(5000), { type: 'heard' }, ...deaf(10000), ...deaf(15000)]);
    expect(shows).toEqual([]);
    expect(s.misses).toBe(2);
  });

  it('nghe ra nốt trong cửa sổ → tình huống đó không tính', () => {
    const ev: MicHonestyEvent[] = [];
    for (let k = 0; k < 5; k++) ev.push({ type: 'activity', at: k * 5000 }, { type: 'heard' }, { type: 'tick', at: k * 5000 + 4000 });
    expect(run(ev).shows).toEqual([]);
  });

  it('im lặng (không có tiếng đàn) thì không tính', () => {
    const ev: MicHonestyEvent[] = [];
    for (let t = 0; t < 60000; t += 500) ev.push({ type: 'tick', at: t });
    expect(run(ev).shows).toEqual([]);
  });

  it('đàn liên tục mà không ra nốt → sau ~3 cửa sổ', () => {
    const ev: MicHonestyEvent[] = [];
    for (let t = 0; t <= 4 * MIC_DEAF_WINDOW_MS; t += 100) ev.push({ type: 'activity', at: t });
    const { shows } = run(ev);
    expect(shows.length).toBe(1);
    expect(shows[0] * 100).toBeGreaterThanOrEqual(3 * MIC_DEAF_WINDOW_MS);
  });

  it('3 lần chờ hết giờ khi micro bật cũng tính', () => {
    expect(run([{ type: 'timeout' }, { type: 'timeout' }, { type: 'timeout' }]).shows).toEqual([2]);
  });

  it('sang bước mới: được hiện lại, bộ đếm giữ (micro vẫn điếc thì nói ngay)', () => {
    const first = run([...deaf(0), ...deaf(5000), ...deaf(10000)]);
    expect(first.shows.length).toBe(1);
    const again = run([{ type: 'step' }, ...deaf(20000)], first.s);
    expect(again.shows).toEqual([3]);
    // Sang bước mới mà chưa có tình huống mới → chưa hiện
    expect(run([{ type: 'step' }, { type: 'tick', at: 30000 }], first.s).shows).toEqual([]);
  });

  it('hàm thuần: không sửa state đầu vào', () => {
    const s0 = micHonestyInit();
    micHonestyStep(s0, { type: 'activity', at: 1 });
    expect(s0).toEqual(micHonestyInit());
  });
});
