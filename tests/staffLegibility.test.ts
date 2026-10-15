import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOTE_COLORS,
  NOTE_LETTERS,
  SPACING_POWER,
  accidentalPath,
  bracePath,
  clefPath,
  durationGap,
  makeSpacing,
  noteLetter,
  spaceAt,
} from '../src/music/engrave';
import { GlideClock } from '../src/music/playhead';
import { SONGS, beatsPerMeasure, measureCount } from '../src/music/tune';
import { NOTE_COLOR_KEY, noteColorMode, noteColorsOn, setNoteColorMode } from '../src/ui/components/noteColors';
import type { StaffView as StaffViewT } from '../src/ui/components/staffView';

/**
 * (+ 2026-10-15) "Khuông nhạc đẹp & dễ đọc hơn": kiểm tra khắc bản cho cả 150 bài (số ngón / tên nốt / sắc thái không
 * chồng nhau và không đè lên nốt, đuôi nốt, dấu luyến), khóa nhạc vẽ bằng đường viền hợp lệ, bảng nốt màu, đồng hồ
 * con trỏ mượt, thời gian → x đơn điệu.
 * Môi trường test là 'node' (không có DOM) → DOM giả tối thiểu đủ cho StaffView.
 */

class FakeClassList {
  constructor(private readonly e: FakeEl) {}
  private get set(): Set<string> {
    return new Set((this.e.attrs.class ?? '').split(/\s+/).filter(Boolean));
  }
  private write(s: Set<string>) {
    this.e.attrs.class = [...s].join(' ');
  }
  add(...c: string[]) {
    const s = this.set;
    c.forEach((x) => s.add(x));
    this.write(s);
  }
  remove(...c: string[]) {
    const s = this.set;
    c.forEach((x) => s.delete(x));
    this.write(s);
  }
  toggle(c: string, on?: boolean) {
    const s = this.set;
    const want = on ?? !s.has(c);
    if (want) s.add(c);
    else s.delete(c);
    this.write(s);
    return want;
  }
  contains(c: string) {
    return this.set.has(c);
  }
  replace(a: string, b: string) {
    const s = this.set;
    if (!s.has(a)) return false;
    s.delete(a);
    s.add(b);
    this.write(s);
    return true;
  }
}

class FakeEl {
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  textContent = '';
  style: Record<string, string> = {};
  classList = new FakeClassList(this);
  constructor(public tagName: string) {}
  get className() {
    return this.attrs.class ?? '';
  }
  set className(v: string) {
    this.attrs.class = v;
  }
  get isConnected() {
    return true;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  append(...cs: FakeEl[]) {
    for (const c of cs) {
      c.parent?.children.splice(c.parent.children.indexOf(c), 1);
      c.parent = this;
      this.children.push(c);
    }
  }
  replaceChildren(...cs: FakeEl[]) {
    this.children.forEach((c) => (c.parent = null));
    this.children = [];
    this.append(...cs);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  /** Chỉ hỗ trợ ".lớp" (đủ cho StaffView) */
  querySelectorAll(sel: string): FakeEl[] {
    const cls = sel.replace(/^\./, '');
    return all(this).filter((e) => e !== this && e.classList.contains(cls));
  }
}
function all(e: FakeEl): FakeEl[] {
  return [e, ...e.children.flatMap(all)];
}

const g = globalThis as unknown as { document?: unknown };
let hadDoc = false;
let StaffView: typeof StaffViewT;
beforeAll(async () => {
  hadDoc = 'document' in g;
  if (!hadDoc) g.document = { createElementNS: (_ns: string, tag: string) => new FakeEl(tag), createElement: (tag: string) => new FakeEl(tag) };
  ({ StaffView } = await import('../src/ui/components/staffView'));
});
afterAll(() => {
  if (!hadDoc) delete g.document;
});

// ---------------- Hộp bao gần đúng của từng hình ----------------

interface Box {
  kind: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  note?: string;
}
const num = (e: FakeEl, k: string) => Number(e.getAttribute(k));
/** Cỡ chữ (khớp CSS) → bề ngang mỗi ký tự & phần trên/dưới chân chữ */
const TEXT: Record<string, { w: number; up: number; down: number }> = {
  'staff-finger': { w: 12.6, up: 16, down: 1 },
  'staff-name': { w: 10.6, up: 15, down: 4 },
  'staff-dyn': { w: 15, up: 21, down: 7 },
};
function boxesOf(root: FakeEl): Box[] {
  const out: Box[] = [];
  const walk = (e: FakeEl, note: string | undefined) => {
    const cls = e.className;
    const id = cls.includes('staff-note') ? `${Math.random()}` : note;
    const kind = Object.keys(TEXT).find((k) => cls.split(' ').includes(k));
    if (e.tagName === 'text' && kind) {
      const t = TEXT[kind];
      const w = [...e.textContent].length * t.w;
      const x = num(e, 'x');
      const y = num(e, 'y');
      out.push({ kind, x1: x - w / 2, x2: x + w / 2, y1: y - t.up, y2: y + t.down, note: id });
    } else if (e.tagName === 'ellipse' && cls.includes('staff-head')) {
      const x = num(e, 'cx');
      const y = num(e, 'cy');
      out.push({ kind: 'head', x1: x - 9.5, x2: x + 9.5, y1: y - 7.5, y2: y + 7.5, note: id });
    } else if (e.tagName === 'line' && (cls.includes('staff-stem') || cls.includes('staff-ledger'))) {
      const [xa, xb, ya, yb] = [num(e, 'x1'), num(e, 'x2'), num(e, 'y1'), num(e, 'y2')];
      out.push({ kind: cls.includes('staff-stem') ? 'stem' : 'ledger', x1: Math.min(xa, xb) - 1.3, x2: Math.max(xa, xb) + 1.3, y1: Math.min(ya, yb), y2: Math.max(ya, yb), note: id });
    } else if (e.tagName === 'path' && cls.includes('staff-beam')) {
      const ns = (e.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
      const xs = ns.filter((_, i) => i % 2 === 0);
      const ys = ns.filter((_, i) => i % 2 === 1);
      out.push({ kind: 'beam', x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) });
    } else if (e.tagName === 'path' && cls.includes('staff-slur')) {
      // M x1,y1 Q cx,cy x2,y2 … → đỉnh đường cong bậc hai ở t = ½
      const [x1, y1, , cy, x2, y2] = (e.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
      const peak = (y1 + 2 * cy + y2) / 4;
      out.push({ kind: 'slur', x1: Math.min(x1, x2), x2: Math.max(x1, x2), y1: Math.min(y1, y2, peak) - 2.5, y2: Math.max(y1, y2, peak) + 2.5 });
    }
    e.children.forEach((c) => walk(c, id));
  };
  walk(root, undefined);
  return out;
}
const overlap = (a: Box, b: Box, tol: number) =>
  Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > tol && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > tol;

const TOL = 1.5;
const LABELS = ['staff-finger', 'staff-name', 'staff-dyn'];

/** Vẽ mọi trang của một bài, trả về danh sách va chạm (mô tả ngắn). */
function collisions(view: StaffViewT): string[] {
  const out: string[] = [];
  const pages = view.pageCount();
  for (let p = 0; p < pages; p++) {
    view.turnPage(p - view.currentPage());
    const bs = boxesOf(view.el as unknown as FakeEl);
    const labels = bs.filter((b) => LABELS.includes(b.kind));
    for (let i = 0; i < labels.length; i++) {
      const a = labels[i];
      // Chữ ↔ chữ (khác loại: luôn cấm; cùng loại: hai chữ cạnh nhau không chạm)
      for (let j = i + 1; j < labels.length; j++) {
        const b = labels[j];
        if (overlap(a, b, TOL)) out.push(`p${p} ${a.kind}×${b.kind} @x≈${Math.round(a.x1)}`);
      }
      // Chữ ↔ hình nốt (đầu nốt, đuôi, vạch phụ, gạch nối, dấu luyến)
      for (const b of bs) {
        if (LABELS.includes(b.kind)) continue;
        if (overlap(a, b, TOL)) out.push(`p${p} ${a.kind}×${b.kind} @x≈${Math.round(a.x1)}`);
      }
    }
  }
  return out;
}

describe('khắc bản: số ngón / tên nốt / sắc thái không chồng nhau (cả 150 bài)', () => {
  it('có đủ 150 bài để kiểm', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(150);
  });
  it('bộ kiểm tra thấy đủ các loại hình và bắt được chỗ chồng nhau', () => {
    const t = SONGS.find((x) => x.id === 'silent_night_ped')!;
    const bs = boxesOf(new StaffView(t, { names: true, fingers: true }).el as unknown as FakeEl);
    const kinds = new Set(bs.map((b) => b.kind));
    for (const k of ['head', 'stem', 'slur', 'staff-finger', 'staff-name', 'staff-dyn']) expect(kinds.has(k), k).toBe(true);
    // Chữ đặt đè lên đầu nốt → phải bị bắt
    const head = bs.find((b) => b.kind === 'head')!;
    const fake: Box = { kind: 'staff-name', x1: head.x1, x2: head.x2, y1: head.y1, y2: head.y2 };
    expect(overlap(fake, head, TOL)).toBe(true);
  });
  it('gợi ý đầy đủ (số ngón + tên nốt), trang 4 ô nhịp', () => {
    const bad: string[] = [];
    for (const t of SONGS) {
      const c = collisions(new StaffView(t, { names: true, fingers: true, mode: 'page', colors: true }));
      if (c.length) bad.push(`${t.id}: ${c.slice(0, 3).join(', ')}${c.length > 3 ? ` (+${c.length - 3})` : ''}`);
    }
    expect(bad).toEqual([]);
  });
  it('chỉ tên nốt / chỉ khuông', () => {
    const bad: string[] = [];
    for (const t of SONGS) {
      for (const names of [true, false]) {
        const c = collisions(new StaffView(t, { names, fingers: false, mode: 'page' }));
        if (c.length) bad.push(`${t.id}/${names ? 'names' : 'staff'}: ${c.slice(0, 2).join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('số ngón tay phải nằm TRÊN khuông, tay trái DƯỚI khuông (khuông kép: dưới khuông dưới)', () => {
    for (const t of SONGS.filter((s) => s.lh || s.hand === 'LH').slice(0, 40)) {
      const v = new StaffView(t, { names: true, fingers: true });
      const root = v.el as unknown as FakeEl;
      const lines = all(root).filter((e) => e.className === 'staff-line').map((e) => num(e, 'y1'));
      const top = Math.min(...lines);
      const bottom = Math.max(...lines);
      for (const f of all(root).filter((e) => e.tagName === 'text' && e.className.startsWith('staff-finger'))) {
        if (f.className.includes('lh')) expect(num(f, 'y'), t.id).toBeGreaterThan(bottom);
        else expect(num(f, 'y'), t.id).toBeLessThan(top);
      }
    }
  });
});

describe('khóa nhạc, dấu hóa, ngoặc khuông kép: đường viền hợp lệ', () => {
  const parse = (d: string) => {
    expect(d).toMatch(/^M/);
    expect(d).not.toMatch(/NaN|Infinity|undefined/);
    const ns = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(ns.every(Number.isFinite)).toBe(true);
    return ns;
  };
  /** Toạ độ điểm của các lệnh M/L (bỏ cung tròn — tham số a có cờ) */
  const pts = (d: string) =>
    [...d.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  it('khóa Sol: cuộn quanh vạch Sol (vạch 2), nhô trên vạch 5 và dưới vạch 1', () => {
    const d = clefPath('treble', 14);
    parse(d);
    const p = pts(d);
    const ys = p.map((q) => q[1]);
    const xs = p.map((q) => q[0]);
    expect(Math.min(...ys)).toBeLessThan(-4 * 14 - 14); // trên vạch trên cùng ≥ 1 khoảng
    expect(Math.max(...ys)).toBeGreaterThan(14); // dưới vạch dưới cùng
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2 * 14); // rộng ≥ 2 khoảng
    // Vòng cuộn: có điểm của đường viền ở cả hai bên thân khóa ngang vạch Sol (y = −14)
    const nearG = p.filter((q) => Math.abs(q[1] + 14) < 4);
    expect(nearG.some((q) => q[0] < -6) && nearG.some((q) => q[0] > 10)).toBe(true);
    expect(d).toBe(clefPath('treble', 14)); // lưu sẵn — không tính lại mỗi khuông
  });
  it('khóa Fa: thân từ vạch Fa (vạch 4) xuống, hai chấm hai bên vạch Fa', () => {
    const d = clefPath('bass', 14);
    parse(d);
    const p = pts(d);
    const ys = p.map((q) => q[1]);
    expect(Math.min(...ys)).toBeGreaterThan(-4 * 14 - 8);
    expect(Math.max(...ys)).toBeLessThan(4);
    // Hai chấm: tâm ở y = −3,5 và −2,5 khoảng (kẹp vạch Fa y = −3 khoảng)
    const dots = [...d.matchAll(/M(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)a2\.8/g)].map((m) => Number(m[2]));
    expect(dots.sort((a, b) => a - b)).toEqual([-49, -35]);
  });
  it('dấu thăng / giáng / ngoặc nhọn', () => {
    for (const k of ['#', 'b'] as const) {
      const ns = parse(accidentalPath(k, 100, 50, 14));
      const xs = ns.filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs.filter((x) => x > 50))).toBeLessThan(100 + 14);
    }
    parse(bracePath(16, 20, 200));
  });
});

describe('nốt màu', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  it('7 chữ cái, 7 màu khác nhau; chữ tên nốt đủ tương phản (≥ 4,5:1 trên trắng)', () => {
    expect(NOTE_LETTERS).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(new Set(NOTE_LETTERS.map((L) => NOTE_COLORS[L].fill)).size).toBe(7);
    for (const L of NOTE_LETTERS) expect((1.05 / (lum(NOTE_COLORS[L].text) + 0.05)), L).toBeGreaterThanOrEqual(4.5);
  });
  it('khác màu "đúng" (xanh #2e9e5b) và "nhầm" (đỏ #e04848) của thầy — cam sớm/muộn: khuông đang nhận xét tắt hẳn nốt màu', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    for (const L of NOTE_LETTERS) for (const rv of ['#2e9e5b', '#e04848']) expect(dist(NOTE_COLORS[L].fill.toLowerCase(), rv), `${L}/${rv}`).toBeGreaterThan(40);
  });
  it('cao độ → chữ cái (thăng/giáng mang màu chữ cái của nó)', () => {
    expect(noteLetter('C4')).toBe('C');
    expect(noteLetter('F#4')).toBe('F');
    expect(noteLetter('Bb3')).toBe('B');
    expect(noteLetter(undefined)).toBe(null);
  });
  it('chế độ: Tự động = tuần 1–8; Luôn hiện; Tắt; lưu trên máy', () => {
    expect([1, 4, 8, 9, 20].map((w) => noteColorsOn('auto', w))).toEqual([true, true, true, false, false]);
    expect(noteColorsOn('on', 30)).toBe(true);
    expect(noteColorsOn('off', 2)).toBe(false);
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(noteColorMode(st)).toBe('auto');
    setNoteColorMode('off', st);
    expect(mem.get(NOTE_COLOR_KEY)).toBe('off');
    expect(noteColorMode(st)).toBe('off');
    setNoteColorMode('auto', st);
    expect(mem.has(NOTE_COLOR_KEY)).toBe(false);
  });
  it('đầu nốt + tên nốt mang lớp nc-<chữ cái>; nhận xét của thầy tắt nốt màu', () => {
    const t = SONGS.find((s) => s.id === 'mary_lamb')!;
    const v = new StaffView(t, { colors: true });
    const root = v.el as unknown as FakeEl;
    expect(root.classList.contains('ncol')).toBe(true);
    for (const h of all(root).filter((e) => e.tagName === 'ellipse' && e.className.includes('staff-head'))) {
      expect(h.className).toContain(`nc-${noteLetter(h.getAttribute('data-e2e-pitch')!)}`);
    }
    v.setReview(new Map([[0, { kind: 'ok' }]]));
    expect(root.classList.contains('ncol')).toBe(false);
    v.setReview(null);
    expect(root.classList.contains('ncol')).toBe(true);
    v.setColors(false);
    expect(root.classList.contains('ncol')).toBe(false);
  });
});

describe('giãn cách & con trỏ', () => {
  it('giãn cách kiểu bản in: trắng ≈ 1,65 × đen, tròn ≈ 2,7 ×; đơn điệu', () => {
    expect(durationGap(2, 50) / durationGap(1, 50)).toBeCloseTo(2 ** SPACING_POWER, 5);
    expect(durationGap(2, 50) / durationGap(1, 50)).toBeGreaterThan(1.5);
    expect(durationGap(4, 50) / durationGap(1, 50)).toBeLessThan(3);
    let prev = 0;
    for (const d of [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
      expect(durationGap(d, 50)).toBeGreaterThan(prev);
      prev = durationGap(d, 50);
    }
    // makeSpacing với gapOf: khoảng tối thiểu vẫn giữ
    const sp = makeSpacing([0, 0.25, 0.5, 2], 50, 30, () => 0, (dt) => durationGap(dt, 50));
    expect(sp.x[1] - sp.x[0]).toBe(30);
    expect(sp.x[3] - sp.x[2]).toBeCloseTo(durationGap(1.5, 50), 6);
  });
  it('thời gian → x đơn điệu tăng (băng chuyền cả bài; trang: trong từng trang) — cả 150 bài', () => {
    const bad: string[] = [];
    for (const t of SONGS) {
      const bpm = beatsPerMeasure(t);
      const total = bpm * measureCount(t);
      const sv = new StaffView(t, { mode: 'scroll', names: true });
      let prev = -Infinity;
      for (let b = 0; b <= total; b += 0.0625) {
        const x = sv.xAtBeat(b);
        if (!(x > prev)) bad.push(`${t.id} scroll @${b}`);
        prev = x;
      }
      const pv = new StaffView(t, { mode: 'page', names: true });
      for (let p = 0; p < pv.pageCount(); p++) {
        pv.turnPage(p - pv.currentPage());
        prev = -Infinity;
        for (let b = p * 4 * bpm; b <= Math.min(total, (p + 1) * 4 * bpm); b += 0.0625) {
          const x = pv.xAtBeat(b);
          if (!(x > prev)) bad.push(`${t.id} page${p} @${b}`);
          prev = x;
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('spaceAt khớp mốc nốt (nốt tới vạch đỏ đúng lúc)', () => {
    const sp = makeSpacing([0, 1, 1.5, 3], 50, 30, () => 0, (dt) => durationGap(dt, 50));
    sp.t.forEach((t, i) => expect(spaceAt(sp, t)).toBeCloseTo(sp.x[i], 9));
  });
  it('setTime (trang): lật trang theo phách, vạch con trỏ chỉ đổi transform — không vẽ lại trang mỗi khung hình', () => {
    const t = SONGS.find((s) => s.id === 'ode_to_joy_easy')!;
    const v = new StaffView(t, { mode: 'page' });
    const root = v.el as unknown as FakeEl;
    v.setTime(0.5);
    const content = all(root).find((e) => e.className === 'staff-content')!;
    const firstKids = content.children.slice();
    const ph = all(root).find((e) => e.className.includes('staff-playhead'))!;
    const xs: number[] = [];
    for (let b = 0.5; b < 3.9; b += 0.05) {
      v.setTime(b);
      xs.push(Number(/translate\(([-\d.]+)/.exec(ph.getAttribute('transform')!)![1]));
    }
    expect(content.children).toEqual(firstKids); // cùng các phần tử — không vẽ lại
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(root.classList.contains('gliding')).toBe(true);
    v.setTime(4 * beatsPerMeasure(t) + 0.2); // sang trang 2
    expect(v.currentPage()).toBe(1);
  });
});

describe('GlideClock — con trỏ trượt mượt theo đồng hồ âm thanh', () => {
  /** Đồng hồ âm thanh nhảy theo khối 10,67 ms (512 mẫu @48 kHz), cập nhật trễ ngẫu nhiên tới 3 ms */
  function run(latency: number) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let trueT = 1.0;
    const block = 512 / 48000;
    let ctxShown = trueT;
    const clock = new GlideClock(() => ctxShown, () => latency);
    const out: Array<{ est: number; truth: number; raw: number }> = [];
    for (let f = 0; f < 600; f++) {
      const dt = 1 / 60 + (rnd() - 0.5) * 0.002; // khung hình hơi lệch
      trueT += dt;
      const lag = rnd() * 0.003;
      ctxShown = Math.floor((trueT - lag) / block) * block;
      out.push({ est: clock.now((trueT - 1) * 1000 + 5000), truth: trueT - latency, raw: ctxShown - latency });
    }
    return out;
  }
  it('không chạy lùi, sai số nhỏ, mượt hơn đồng hồ thô', () => {
    const r = run(0.012).slice(60);
    for (let i = 1; i < r.length; i++) expect(r[i].est).toBeGreaterThanOrEqual(r[i - 1].est);
    const err = Math.max(...r.map((x) => Math.abs(x.est - x.truth)));
    expect(err).toBeLessThan(0.012);
    const jitter = (k: 'est' | 'raw') => {
      const d = r.slice(1).map((x, i) => x[k] - r[i][k]);
      const m = d.reduce((a, b) => a + b, 0) / d.length;
      return Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
    };
    expect(jitter('est')).toBeLessThan(jitter('raw') / 3);
    expect(jitter('est')).toBeLessThan(0.0015);
  });
  it('trừ độ trễ loa; âm thanh dừng → bám lại, không nhảy lùi', () => {
    let ctx = 5;
    const c = new GlideClock(() => ctx, () => 0.02);
    expect(c.now(0)).toBeCloseTo(4.98, 6);
    ctx = 5; // âm thanh tạm dừng — đồng hồ đứng
    const a = c.now(200);
    const b = c.now(400);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(b - 4.98).toBeLessThan(0.07);
  });
});
