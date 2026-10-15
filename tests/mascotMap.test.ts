import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * (+ 2026-10-15) "Nhân vật & bản đồ sinh động hơn": SVG hợp lệ cho mọi trạng thái Bé Nốt và mọi đảo (kèm chi tiết riêng),
 * bảng tình huống → trạng thái, toán chấm đường đi chạy từ đảo cũ tới đảo mới.
 * Môi trường 'node' (không DOM) → giả lập tối thiểu document.createElementNS (như tests/islandArt.test.ts).
 */
class FakeEl {
  attrs: Record<string, string> = {};
  innerHTML = '';
  constructor(
    public namespaceURI: string,
    public tagName: string,
  ) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
}

const g = globalThis as unknown as { document?: unknown };
let hadDoc = false;
beforeAll(() => {
  hadDoc = 'document' in g;
  if (!hadDoc) g.document = { createElementNS: (ns: string, tag: string) => new FakeEl(ns, tag) };
});
afterAll(() => {
  if (!hadDoc) delete g.document;
});

/** Thẻ mở/đóng cân bằng (bắt lỗi gõ sai trong chuỗi SVG). */
function balanced(markup: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag);
  }
  return stack.length === 0;
}
/** Mọi số trong thuộc tính toạ độ / đường vẽ là số hữu hạn. */
const finiteNumbers = (markup: string) => (markup.match(/-?\d*\.?\d+(e-?\d+)?/g) ?? []).every((n) => Number.isFinite(Number(n)));

describe('Bé Nốt — trạng thái', () => {
  it('mọi trạng thái: <svg> hợp lệ, có viewBox + aria-label, không NaN/undefined, thẻ cân bằng', async () => {
    const { mascot, MOODS, MOOD_LABEL, OUTFITS } = await import('../src/ui/components/mascot');
    expect(MOODS).toEqual(
      expect.arrayContaining(['happy', 'cheer', 'think', 'wave', 'love', 'clap', 'encourage', 'surprise', 'sleepy', 'point', 'dance']),
    );
    const seen = new Set<string>();
    for (const mood of MOODS) {
      for (const outfit of [null, ...Object.keys(OUTFITS)]) {
        const el = mascot(mood, 96, outfit) as unknown as FakeEl;
        expect(el.tagName).toBe('svg');
        expect(el.attrs.viewBox).toBe('0 0 120 140');
        expect(el.attrs['aria-label']).toBe(`Bé Nốt ${MOOD_LABEL[mood]}`);
        expect(el.attrs.class).toContain(`mood-${mood}`);
        expect(el.attrs.width).toBe('96');
        expect(Number(el.attrs.height)).toBeCloseTo(112, 5);
        expect(el.innerHTML, `${mood}/${outfit}`).not.toMatch(/undefined|NaN|null/);
        expect(balanced(el.innerHTML), `${mood}/${outfit}`).toBe(true);
        expect(finiteNumbers(el.innerHTML)).toBe(true);
        // phần chớp mắt / miệng / hai tay luôn có (CSS hoạt hình dựa vào các lớp này)
        expect(el.innerHTML).toContain('class="mn-eyes"');
        expect(el.innerHTML).toContain('class="mn-mouth"');
        expect(el.innerHTML).toMatch(/class="mn-arm-l[ "]/);
        expect(el.innerHTML).toMatch(/class="mn-arm-r[ "]/);
        if (!outfit) seen.add(el.innerHTML.replace(/mn-(body|stem)-[0-9a-z]+/g, ''));
      }
    }
    // mỗi trạng thái một hình khác nhau
    expect(seen.size).toBe(MOODS.length);
  });

  it('mấp máy môi: mọi trạng thái trừ ngủ gật có miệng "đang nói"; chỉ trạng thái mắt mở mới chớp mắt', async () => {
    const { mascot, MOODS } = await import('../src/ui/components/mascot');
    for (const mood of MOODS) {
      const el = mascot(mood) as unknown as FakeEl;
      expect(el.innerHTML.includes('mn-talk'), mood).toBe(mood !== 'sleepy');
    }
    expect((mascot('happy') as unknown as FakeEl).attrs.class).toContain('can-blink');
    expect((mascot('sleepy') as unknown as FakeEl).attrs.class).not.toContain('can-blink');
    expect((mascot('cheer') as unknown as FakeEl).attrs.class).not.toContain('can-blink');
    expect((mascot('sleepy') as unknown as FakeEl).innerHTML).toContain('mn-zzz');
  });

  it('trạng thái lạ → về "vui" (không vỡ hình)', async () => {
    const { mascot } = await import('../src/ui/components/mascot');
    const el = mascot('???' as never) as unknown as FakeEl;
    expect(el.attrs.class).toContain('mood-happy');
  });

  it('bảng tình huống → trạng thái', async () => {
    const { CUE_MOOD, cue, MOODS } = await import('../src/ui/components/mascot');
    expect(cue('praise')).toBe('clap');
    expect(cue('retry')).toBe('encourage');
    expect(cue('puzzle')).toBe('think');
    expect(cue('wow')).toBe('surprise');
    expect(cue('nap')).toBe('sleepy');
    expect(cue('guide')).toBe('point');
    expect(cue('perform')).toBe('dance');
    expect(cue('bigWin')).toBe('cheer');
    expect(cue('greet')).toBe('wave');
    expect(cue('idle')).toBe('happy');
    expect(cue('thanks')).toBe('love');
    for (const m of Object.values(CUE_MOOD)) expect(MOODS).toContain(m);
    // mọi trạng thái đều được dùng ở ít nhất một tình huống
    for (const m of MOODS) expect(Object.values(CUE_MOOD)).toContain(m);
  });
});

describe('Đảo — SVG + chi tiết riêng', () => {
  it('mọi đảo 1–43 × 3 trạng thái: viewBox + aria-label, không NaN', async () => {
    const { islandIcon } = await import('../src/ui/components/art/islandArt');
    for (let w = 1; w <= 43; w++) {
      for (const s of ['done', 'current', 'locked'] as const) {
        const el = islandIcon(w, s) as unknown as FakeEl;
        expect(el.attrs.viewBox).toBe('0 0 96 80');
        expect(el.attrs['aria-label']).toBe(`Đảo tuần ${w}`);
        expect(el.innerHTML).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('chi tiết riêng: đủ 43 tuần, khác nhau từng tuần, SVG hợp lệ, nằm trong khung 96×80', async () => {
    const { ACCENTS, accentSvg } = await import('../src/ui/components/art/islandAccents');
    const all = new Set<string>();
    for (let w = 1; w <= 43; w++) {
      const a = accentSvg(w);
      expect(a.length, `tuần ${w}`).toBeGreaterThan(40);
      expect(a, `tuần ${w}`).not.toMatch(/undefined|NaN/);
      expect(balanced(a), `tuần ${w}`).toBe(true);
      expect(finiteNumbers(a)).toBe(true);
      // toạ độ tuyệt đối (cx/cy/x/y) trong khung tranh (cho phép tràn nhẹ như tranh gốc)
      for (const m of a.matchAll(/\b(cx|x)="(-?[\d.]+)"/g)) expect(Number(m[2]), `tuần ${w} ${m[0]}`).toBeGreaterThanOrEqual(-4);
      for (const m of a.matchAll(/\b(cx|x)="(-?[\d.]+)"/g)) expect(Number(m[2]), `tuần ${w} ${m[0]}`).toBeLessThanOrEqual(100);
      for (const m of a.matchAll(/\b(cy|y)="(-?[\d.]+)"/g)) expect(Number(m[2]), `tuần ${w} ${m[0]}`).toBeGreaterThanOrEqual(0);
      for (const m of a.matchAll(/\b(cy|y)="(-?[\d.]+)"/g)) expect(Number(m[2]), `tuần ${w} ${m[0]}`).toBeLessThanOrEqual(80);
      all.add(a);
    }
    expect(all.size).toBe(43);
    expect(Object.keys(ACCENTS).length).toBe(43);
    expect(accentSvg(99)).toBe('');
  });

  it('tuần dùng lại tranh (ART_OF_WEEK) vẫn khác nhau nhờ chi tiết riêng', async () => {
    const { islandIcon } = await import('../src/ui/components/art/islandArt');
    const { accentSvg } = await import('../src/ui/components/art/islandAccents');
    const looks = new Set<string>();
    for (let w = 1; w <= 43; w++) {
      const base = (islandIcon(w, 'current') as unknown as FakeEl).innerHTML;
      looks.add(base + accentSvg(w));
    }
    expect(looks.size).toBe(43);
  });
});

describe('Bản đồ — chấm đường đi', () => {
  const n = 10;
  const xs = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 1000);
  const ys = Array.from({ length: n }, (_, i) => (i % 2 ? 58 : 36));

  it('segPoint: đầu / cuối đoạn trùng tâm đảo, không NaN', async () => {
    const { segPoint } = await import('../src/ui/components/mapMotion');
    for (let i = 1; i < n; i++) {
      expect(segPoint(xs, ys, i, 0)).toEqual({ x: xs[i - 1], y: ys[i - 1] });
      const end = segPoint(xs, ys, i, 1);
      expect(end.x).toBeCloseTo(xs[i], 9);
      expect(end.y).toBeCloseTo(ys[i], 9);
      const mid = segPoint(xs, ys, i, 0.5);
      expect(mid.x).toBeCloseTo((xs[i - 1] + xs[i]) / 2, 9);
      expect(mid.y).toBeCloseTo((ys[i - 1] + ys[i]) / 2, 9);
    }
  });

  it('trailDots: tiến độ tăng dần tới đúng 1, chấm cách đều ~16 px, nằm giữa hai đảo', async () => {
    const { trailDots, trailDelay, TRAIL_DELAY_MS, TRAIL_MS } = await import('../src/ui/components/mapMotion');
    for (const [from, to] of [
      [2, 3],
      [0, 4],
      [5, 9],
    ]) {
      const pxW = 1048;
      const pxH = 172;
      const dots = trailDots(xs, ys, from, to, { pxW, pxH });
      expect(dots.length).toBeGreaterThan(3);
      let prev = 0;
      for (const d of dots) {
        expect(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.at)).toBe(true);
        expect(d.at).toBeGreaterThan(prev);
        prev = d.at;
        expect(d.x).toBeGreaterThanOrEqual(xs[from] - 1e-9);
        expect(d.x).toBeLessThanOrEqual(xs[to] + 1e-9);
        expect(d.y).toBeGreaterThanOrEqual(36 - 1e-9);
        expect(d.y).toBeLessThanOrEqual(58 + 1e-9);
      }
      expect(dots[dots.length - 1].at).toBeCloseTo(1, 9);
      expect(dots[dots.length - 1].x).toBeCloseTo(xs[to], 6);
      // khoảng cách giữa hai chấm liền nhau (px) gần 16
      for (let k = 1; k < dots.length; k++) {
        const gap = Math.hypot(((dots[k].x - dots[k - 1].x) * pxW) / 1000, ((dots[k].y - dots[k - 1].y) * pxH) / 100);
        expect(gap).toBeGreaterThan(12);
        expect(gap).toBeLessThan(20);
      }
      // độ trễ: tăng dần, từ TRAIL_DELAY_MS tới TRAIL_DELAY_MS + TRAIL_MS
      expect(trailDelay(dots[0].at)).toBeGreaterThanOrEqual(TRAIL_DELAY_MS);
      expect(trailDelay(dots[dots.length - 1].at)).toBe(TRAIL_DELAY_MS + TRAIL_MS);
    }
    expect(trailDelay(-1)).toBe(TRAIL_DELAY_MS);
    expect(trailDelay(5)).toBe(TRAIL_DELAY_MS + TRAIL_MS);
  });

  it('trailDots: tham số sai → không chấm nào', async () => {
    const { trailDots } = await import('../src/ui/components/mapMotion');
    expect(trailDots(xs, ys, 3, 3)).toEqual([]);
    expect(trailDots(xs, ys, 4, 2)).toEqual([]);
    expect(trailDots(xs, ys, -1, 2)).toEqual([]);
    expect(trailDots(xs, ys, 0, n)).toEqual([]);
    expect(trailDots(xs, ys, 0, 2, { pxW: 0, pxH: 172 })).toEqual([]);
    expect(trailDots(xs, ys, 0, 2, { pxW: NaN, pxH: 172 })).toEqual([]);
  });

  it('trailStart: chỉ chạy khi tiến lên trong cùng bản đồ', async () => {
    const { trailStart } = await import('../src/ui/components/mapMotion');
    const weeks = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    expect(trailStart(null, 12, weeks)).toBeNull(); // lần đầu thấy bản đồ
    expect(trailStart(12, 12, weeks)).toBeNull(); // không đổi
    expect(trailStart(14, 12, weeks)).toBeNull(); // lùi tuần (bố mẹ chỉnh)
    expect(trailStart(11, 12, weeks)).toBe(0);
    expect(trailStart(12, 15, weeks)).toBe(1);
    expect(trailStart(10, 11, weeks)).toBeNull(); // sang cấp mới: đảo đầu tiên, không có đường
    expect(trailStart(10, 13, weeks)).toBeNull(); // tuần cũ ở cấp trước
    expect(trailStart(Number.NaN, 13, weeks)).toBeNull();
    expect(trailStart(3, 4, [1, 2, 3, 4, 5])).toBe(2);
  });

  it('thẻ đảo: đảo chưa mở giữ bí mật', async () => {
    const { islandCardText } = await import('../src/ui/components/mapMotion');
    const base = { week: 4, island: 'Rừng Nhịp', emoji: '🌳', title: 'Nhịp — 3 mức', teaser: 'Rừng ?' };
    expect(islandCardText({ ...base, state: 'current' })).toEqual({ head: 'Tuần 4', name: '🌳 Rừng Nhịp', body: 'Con học: Nhịp — 3 mức', tag: '📍 Con đang ở đây' });
    expect(islandCardText({ ...base, state: 'done' }).tag).toBe('⭐ Đã qua');
    const locked = islandCardText({ ...base, state: 'locked' });
    expect(locked.name).toBe('Rừng ?');
    expect(JSON.stringify(locked)).not.toContain('Nhịp — 3 mức');
    expect(JSON.stringify(locked)).not.toContain('Rừng Nhịp');
  });
});
