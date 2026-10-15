import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHECK_PRINCIPLE,
  DRILL_PRINCIPLE,
  HAND_FOCUS_DAYS,
  HAND_LOOK,
  HAND_PRINCIPLES,
  POSTURE_CARDS,
  POSTURE_CARD_MS,
  POSTURE_FLOW_MAX_MS,
  createPostureFlow,
  handFocus,
  postureOrder,
  readHandLook,
  saveHandLook,
  type HandPrincipleId,
  type HandVariant,
} from '../src/lessons/handTechnique';
import { RELAX_CHECKS } from '../src/lessons/level4';
import { HAND_POSES, chain, n, sideHand } from '../src/ui/components/art/handKit';
import { placeTag, principleMarkup, principleSvg } from '../src/ui/components/handTechniqueArt';
import { postureMarkup } from '../src/ui/components/postureArt';
import { handIconMarkup } from '../src/ui/components/handIcon';
import type { AppData, Session } from '../src/progress/schema';

/**
 * (+ 2026-10-15) Tranh "Tư thế tay": SVG hợp lệ (viewBox, không NaN, thẻ cân bằng, aria-label), lời ngắn cho bé,
 * dãy thẻ tư thế ≤ 40 giây + bỏ qua, lời nhắc theo lỗi bố mẹ đã chấm (chỉ đọc dữ liệu).
 */

class FakeEl {
  attrs: Record<string, string> = {};
  innerHTML = '';
  classList = { toggle() {} };
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

function balanced(markup: string): boolean {
  const stack: string[] = [];
  const body = markup.replace(/<style>[\s\S]*?<\/style>/g, '');
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag);
  }
  return stack.length === 0;
}
const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const variantsOf = (id: HandPrincipleId): HandVariant[] => HAND_PRINCIPLES.find((p) => p.id === id)!.panels.map((p) => p.variant);

describe('tranh nguyên tắc tay', () => {
  it('mọi nguyên tắc × biến thể: viewBox 4 số, không NaN/undefined, thẻ cân bằng, có mô tả', () => {
    for (const p of HAND_PRINCIPLES) {
      for (const v of variantsOf(p.id)) {
        for (const bare of [false, true]) {
          const a = principleMarkup(p.id, v, { bare });
          const vb = a.viewBox.split(' ').map(Number);
          expect(vb, `${p.id}/${v}`).toHaveLength(4);
          expect(vb.every(Number.isFinite)).toBe(true);
          expect(vb[2]).toBeGreaterThan(0);
          expect(a.inner.length).toBeGreaterThan(400);
          expect(a.inner, `${p.id}/${v}`).not.toMatch(/NaN|undefined|Infinity/);
          expect(balanced(a.inner), `${p.id}/${v}/${bare}`).toBe(true);
          expect(a.label.length).toBeGreaterThan(10);
          expect(a.label.startsWith(v === 'good' ? 'Đúng' : 'Chưa đúng'), `${p.id}/${v}`).toBe(true);
        }
      }
    }
  });

  it('nhãn chữ nằm trọn trong khung và không đè huy hiệu ✓/✗ góc phải trên', () => {
    const tags = (m: string) => [...m.matchAll(/<g transform="translate\(([\d.-]+) ([\d.-]+)\)"><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)];
    for (const p of HAND_PRINCIPLES) {
      if (p.id === 'sit') continue;
      for (const v of variantsOf(p.id)) {
        for (const t of tags(principleMarkup(p.id, v).inner)) {
          const [cx, cy, rx, ry, w, h] = t.slice(1).map(Number);
          const x0 = cx + rx;
          const y0 = cy + ry;
          expect(x0, `${p.id}/${v}`).toBeGreaterThanOrEqual(0);
          expect(y0, `${p.id}/${v}`).toBeGreaterThanOrEqual(0);
          expect(x0 + w, `${p.id}/${v}`).toBeLessThanOrEqual(240);
          expect(y0 + h, `${p.id}/${v}`).toBeLessThanOrEqual(170);
          // vùng huy hiệu: x ≥ 202, y ≤ 38
          expect(x0 + w > 202 && y0 < 38, `${p.id}/${v} đè huy hiệu`).toBe(false);
        }
      }
    }
    // hàm đặt nhãn tự né góc huy hiệu
    const [x] = placeTag(230, 18, 'đi bộ', 12);
    expect(x + 20).toBeLessThan(202);
  });

  it('tranh thu nhỏ (bare) không có nhãn chữ / huy hiệu', () => {
    for (const p of HAND_PRINCIPLES) {
      if (p.id === 'sit') continue;
      expect(principleMarkup(p.id, 'good', { bare: true }).inner, p.id).not.toMatch(/<text/);
    }
  });

  it('đúng và chưa đúng là hai tranh khác nhau; cổ tay có 3 tranh', () => {
    for (const p of HAND_PRINCIPLES) {
      const vs = variantsOf(p.id);
      expect(vs[0]).toBe('good');
      const set = new Set(vs.map((v) => principleMarkup(p.id, v).inner.replace(/-[0-9a-z]+"/g, '"')));
      expect(set.size, p.id).toBe(vs.length);
    }
    expect(variantsOf('wrist')).toEqual(['good', 'bad', 'bad2']);
  });

  it('principleSvg: <svg role="img"> có aria-label + viewBox; tranh hoạt hình có lớp CSS + tắt khi giảm chuyển động', () => {
    for (const p of HAND_PRINCIPLES) {
      const el = principleSvg(p.id, 'good') as unknown as FakeEl;
      expect(el.tagName).toBe('svg');
      expect(el.attrs.role).toBe('img');
      expect(el.attrs['aria-label']).toMatch(/^Đúng/);
      expect(el.attrs.viewBox).toBeTruthy();
      expect(el.attrs.class).toContain(`hp-p-${p.id}`);
      if (p.animated) {
        expect(el.innerHTML, p.id).toMatch(/class="hp-a hp-(press|keydown|liftA|glowA|bounce|tap)/);
        expect(el.innerHTML).toContain('prefers-reduced-motion: reduce');
      }
    }
  });

  it('tư thế ngồi (postureArt "sit"): đúng có kê gối + kê chân; chưa đúng có ✗; các tiêu điểm cũ vẫn hợp lệ', () => {
    const good = postureMarkup('sit', { variant: 'good' });
    const bad = postureMarkup('sit', { variant: 'bad' });
    for (const m of [good, bad, postureMarkup('all'), postureMarkup('back'), postureMarkup('feet'), postureMarkup('hands')]) {
      expect(m).not.toMatch(/NaN|undefined/);
      expect(balanced(m)).toBe(true);
    }
    expect(good).toContain('kê chân');
    expect(good).toContain('gối');
    expect(good).toContain('ngang phím');
    expect(bad).toContain('chân hẫng');
    expect(bad).not.toContain('kê chân');
  });

  it('biểu tượng tí hon hợp lệ', () => {
    for (const f of [false, true]) {
      const m = handIconMarkup(f);
      expect(m).not.toMatch(/NaN|undefined/);
      expect(balanced(m)).toBe(true);
    }
  });
});

describe('bộ vẽ bàn tay (handKit)', () => {
  it('n(): không bao giờ in NaN', () => {
    expect(n(NaN)).toBe('0');
    expect(n(Infinity)).toBe('0');
    expect(n(-0.04)).toBe('0');
    expect(n(1.26)).toBe('1.3');
  });

  it('chain: độ dài đoạn đúng', () => {
    const pts = chain([0, 0], [
      { len: 10, deg: 0 },
      { len: 5, deg: 90 },
    ]);
    expect(pts[1][0]).toBeCloseTo(10);
    expect(pts[2][1]).toBeCloseTo(5);
  });

  it('dáng "cong": khớp gốc (cây cầu) cao nhất; dáng "bẹp": khớp gốc thấp hơn cổ tay; cổ tay võng/nhô đúng hướng', () => {
    const tip: [number, number] = [170, 110];
    const curved = sideHand({ tip, pose: 'curved' }).pts;
    // y nhỏ hơn = cao hơn
    expect(curved[3][1]).toBeLessThan(curved[2][1]);
    expect(curved[3][1]).toBeLessThan(curved[4][1]);
    expect(curved[1][1]).toBeLessThan(curved[0][1]); // đốt đầu đứng (khớp đầu cao hơn đầu ngón)
    // nhìn là thấy: khớp gốc cao hơn cổ tay và khớp giữa RÕ RỆT (≥ 6 đơn vị ở tỉ lệ 1); đốt đầu gần thẳng đứng
    expect(curved[4][1] - curved[3][1]).toBeGreaterThanOrEqual(6);
    expect(curved[2][1] - curved[3][1]).toBeGreaterThanOrEqual(6);
    expect(Math.abs(curved[1][0] - curved[0][0])).toBeLessThan(3);
    const flat = sideHand({ tip, pose: 'flat' }).pts;
    expect(flat[3][1]).toBeGreaterThan(flat[4][1]);
    const low = sideHand({ tip, pose: 'wristLow' }).pts;
    const high = sideHand({ tip, pose: 'wristHigh' }).pts;
    expect(low[4][1]).toBeGreaterThan(curved[4][1] + 10);
    expect(high[4][1]).toBeLessThan(curved[4][1] - 10);
    // gãy khớp đầu: đốt đầu gần như nằm ngang (khớp đầu thấp, sát mặt phím)
    const col = sideHand({ tip, pose: 'collapsed' }).pts;
    expect(Math.abs(col[1][1] - col[0][1])).toBeLessThan(4);
    for (const k of Object.keys(HAND_POSES)) expect(sideHand({ tip, pose: k as keyof typeof HAND_POSES }).svg).not.toMatch(/NaN/);
  });
});

describe('lời trên thẻ (ngắn cho bé)', () => {
  it('tên ≤ 6 chữ, câu ≤ 12 chữ, nhãn tranh ≤ 6 chữ; id không trùng', () => {
    const ids = new Set<string>();
    for (const p of HAND_PRINCIPLES) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(words(p.title), p.title).toBeLessThanOrEqual(6);
      expect(words(p.caption), p.caption).toBeLessThanOrEqual(12);
      for (const x of p.panels) expect(words(x.label), x.label).toBeLessThanOrEqual(6);
      expect(p.why.length).toBeGreaterThan(20);
    }
    expect(ids.size).toBe(9);
    for (const c of POSTURE_CARDS) {
      expect(words(c.text), c.text).toBeLessThanOrEqual(6);
      expect(words(c.sub), c.sub).toBeLessThanOrEqual(12);
    }
    for (const it of HAND_LOOK) expect(words(it.label)).toBeLessThanOrEqual(4);
  });

  it('mỗi bài khởi động tay có tranh nguyên tắc; mọi thẻ "xem tay" Cấp 4 có tranh', () => {
    for (const id of Object.values(DRILL_PRINCIPLE)) expect(HAND_PRINCIPLES.some((p) => p.id === id)).toBe(true);
    for (const c of RELAX_CHECKS) expect(CHECK_PRINCIPLE[c], c).toBeTruthy();
  });
});

describe('dãy thẻ tư thế (≤ 40 giây, bỏ qua được)', () => {
  it('4 thẻ: ngồi · dáng tay · đầu ngón · cổ tay/sức nặng; tổng ≤ 40 giây', () => {
    expect(POSTURE_CARDS.map((c) => c.principle)).toEqual(['sit', 'shape', 'tip', 'weight']);
    expect(POSTURE_FLOW_MAX_MS).toBeLessThanOrEqual(40_000);
  });

  it('tự sang thẻ sau mỗi POSTURE_CARD_MS, dừng ở thẻ cuối (chờ "Xong rồi")', () => {
    let done = 0;
    const f = createPostureFlow(4, () => done++);
    expect(f.tick(POSTURE_CARD_MS - 1)).toBe(false);
    expect(f.tick(1)).toBe(true);
    expect(f.index).toBe(1);
    for (let t = 0; t < 60_000; t += 250) f.tick(250);
    expect(f.index).toBe(3);
    expect(done).toBe(0);
    f.next();
    expect(done).toBe(1);
    expect(f.finished).toBe(true);
    f.next();
    f.skip();
    expect(done).toBe(1);
  });

  it('"Bỏ qua" xong ngay (một lần); quay lại không qua thẻ đầu', () => {
    let done = 0;
    const f = createPostureFlow(4, () => done++);
    expect(f.prev()).toBe(false);
    f.next();
    expect(f.prev()).toBe(true);
    expect(f.index).toBe(0);
    f.skip();
    f.skip();
    expect(done).toBe(1);
    expect(f.tick(POSTURE_CARD_MS * 3)).toBe(false);
  });

  it('lỗi bố mẹ vừa nhắc → thẻ đó lên đầu, vẫn đúng 4 thẻ', () => {
    for (const p of HAND_PRINCIPLES) {
      const cards = postureOrder(p.id);
      expect(cards).toHaveLength(4);
      if (['sit', 'shape', 'tip', 'weight', 'wrist'].includes(p.id)) expect(cards[0].principle).toBe(p.id === 'wrist' ? 'weight' : p.id);
      else expect(cards[0].principle).toBe(p.id);
    }
    expect(postureOrder(null).map((c) => c.principle)).toEqual(['sit', 'shape', 'tip', 'weight']);
  });
});

describe('handFocus — tranh theo lỗi tay bố mẹ đã chấm (chỉ đọc)', () => {
  const NOW = Date.UTC(2026, 9, 15, 10);
  const DAY = 86_400_000;
  const session = (over: Partial<Session>): Session => ({
    id: Math.random().toString(36),
    date: '2026-10-14',
    lessonId: 'w33-l2',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: NOW - DAY,
    endedAt: null,
    minutes: 10,
    completed: true,
    checklist: {},
    ...over,
  });
  const data = (sessions: Session[]) => ({ sessions }) as Pick<AppData, 'sessions'>;

  it('không có dữ liệu → null', () => {
    expect(handFocus(undefined, NOW)).toBeNull();
    expect(handFocus(data([]), NOW)).toBeNull();
  });

  it('thẻ xem tay "Làm lại" gần nhất → tranh tương ứng; chấm "Đúng" sau đó → hết nhắc', () => {
    const s1 = session({ parentAssessments: [{ note: 'relax:joint', result: 'retry', ts: NOW - 2 * DAY }] });
    expect(handFocus(data([s1]), NOW)).toBe('tip');
    const s2 = session({ parentAssessments: [{ note: 'relax:joint', result: 'correct', ts: NOW - DAY }] });
    expect(handFocus(data([s1, s2]), NOW)).toBeNull();
    const s3 = session({ parentAssessments: [{ note: 'relax:wrist', result: 'retry', ts: NOW - DAY / 2 }] });
    expect(handFocus(data([s1, s3]), NOW)).toBe('wrist');
  });

  it(`quá ${HAND_FOCUS_DAYS} ngày → không nhắc; thẻ không liên quan tay → bỏ qua`, () => {
    const old = session({ parentAssessments: [{ note: 'relax:shoulder', result: 'retry', ts: NOW - (HAND_FOCUS_DAYS + 1) * DAY }] });
    expect(handFocus(data([old]), NOW)).toBeNull();
    const other = session({ parentAssessments: [{ note: 'C4', result: 'retry', ts: NOW - DAY }] });
    expect(handFocus(data([other]), NOW)).toBeNull();
  });

  it('phiếu bài hát: "ngón & dáng tay" chưa đạt ở lượt gần nhất → tranh dáng tay', () => {
    const run = (ts: number, fingers: boolean) => ({
      songId: 'x',
      mode: 'wait' as const,
      bpm: 60,
      hints: 'full' as const,
      checklist: { notes: true, beat: true, fingers },
      total: 10,
      hits: 10,
      source: 'parent' as const,
      passed: fingers,
      ts,
    });
    expect(handFocus(data([session({ songRuns: [run(NOW - DAY, false)] })]), NOW)).toBe('shape');
    expect(handFocus(data([session({ songRuns: [run(NOW - 2 * DAY, false), run(NOW - DAY, true)] })]), NOW)).toBeNull();
  });

  it('phiếu "Bố mẹ xem tay con" (lưu riêng) → ý chưa được đầu tiên', () => {
    expect(handFocus(data([]), NOW, { ts: NOW - DAY, missing: ['wrist', 'tip'] })).toBe('wrist');
    expect(handFocus(data([]), NOW, { ts: NOW - DAY, missing: [] })).toBeNull();
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveHandLook(['shape'], NOW, st);
    expect(readHandLook(st)).toEqual({ ts: NOW, missing: ['shape'] });
    expect(readHandLook({ getItem: () => '{bad json' })).toBeNull();
    expect(readHandLook(null)).toBeNull();
  });
});
