import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Môi trường test là 'node' (không có DOM) → giả lập tối thiểu document.createElementNS:
 * islandIcon chỉ cần createElementNS + setAttribute + innerHTML.
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

/** Kiểm tra thẻ mở/đóng cân bằng (bắt lỗi gõ sai trong chuỗi SVG). */
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

describe('islandIcon', () => {
  it('trả về <svg> cho mọi tuần 1–30 và mọi trạng thái', async () => {
    const { islandIcon } = await import('../src/ui/components/art/islandArt');
    for (let w = 1; w <= 30; w++) {
      for (const s of ['done', 'current', 'locked'] as const) {
        const el = islandIcon(w, s) as unknown as FakeEl;
        expect(el.tagName).toBe('svg');
        expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(el.attrs.viewBox).toBe('0 0 96 80');
        expect(el.attrs.class).toContain(`state-${s}`);
        expect(el.attrs['data-week']).toBe(String(w));
        expect(el.innerHTML.length).toBeGreaterThan(200);
        expect(el.innerHTML).not.toMatch(/undefined|NaN/);
        expect(balanced(el.innerHTML), `tuần ${w} ${s}`).toBe(true);
      }
    }
  });

  it('mỗi tuần có hình riêng; khóa có bộ lọc mờ, xong có ngôi sao', async () => {
    const { islandIcon } = await import('../src/ui/components/art/islandArt');
    const arts = new Set<string>();
    for (let w = 1; w <= 30; w++) arts.add((islandIcon(w, 'current') as unknown as FakeEl).innerHTML);
    expect(arts.size).toBe(30);
    const locked = (islandIcon(3, 'locked') as unknown as FakeEl).innerHTML;
    expect(locked).toContain('feColorMatrix');
    const done = (islandIcon(3, 'done') as unknown as FakeEl).innerHTML;
    const current = (islandIcon(3, 'current') as unknown as FakeEl).innerHTML;
    expect(done.length).toBeGreaterThan(current.length);
  });

  it('tuần ngoài khoảng vẫn có hình dự phòng', async () => {
    const { islandIcon } = await import('../src/ui/components/art/islandArt');
    expect((islandIcon(99, 'current') as unknown as FakeEl).tagName).toBe('svg');
  });
});
