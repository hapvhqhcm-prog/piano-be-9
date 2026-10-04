import type { Hand } from '../../piano/fingering';

const SVG = 'http://www.w3.org/2000/svg';

export const FINGER_NAMES: Record<number, string> = {
  1: 'ngón cái',
  2: 'ngón trỏ',
  3: 'ngón giữa',
  4: 'ngón áp út',
  5: 'ngón út',
};

/**
 * Bàn tay PHẢI nhìn từ trên xuống (úp trên phím): ngón cái bên trái → ngón út bên phải,
 * cùng thứ tự với Đô Rê Mi Fa Sol trên bàn phím. Ngón được chọn sáng màu tay.
 */
const FINGERS: Array<{ n: number; x: number; y: number; w: number; h: number; rot: number }> = [
  { n: 1, x: 40, y: 104, w: 38, h: 62, rot: -35 },
  { n: 2, x: 74, y: 36, w: 36, h: 86, rot: -5 },
  { n: 3, x: 113, y: 20, w: 36, h: 98, rot: 0 },
  { n: 4, x: 152, y: 30, w: 35, h: 88, rot: 5 },
  { n: 5, x: 189, y: 58, w: 32, h: 66, rot: 12 },
];
const VIEW_W = 240;
const VIEW_H = 200;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface HandDiagram {
  el: SVGSVGElement;
  set(finger: number | undefined): void;
}

export function handDiagram(hand: Hand = 'RH'): HandDiagram {
  const svg = el('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: `hand hand-${hand.toLowerCase()}`, 'aria-hidden': 'true' });
  // Tay trái là ảnh soi gương của tay phải (Phase 3).
  const root = el('g', hand === 'LH' ? { transform: `translate(${VIEW_W} 0) scale(-1 1)` } : {});
  svg.append(root);
  const groups = new Map<number, SVGGElement>();
  for (const f of FINGERS) {
    const cx = f.x + f.w / 2;
    const g = el('g', { class: 'finger', transform: `rotate(${f.rot} ${cx} ${f.y + f.h})` });
    g.append(el('rect', { x: f.x, y: f.y, width: f.w, height: f.h + 20, rx: f.w / 2 }));
    const cy = f.y + 19;
    g.append(el('circle', { cx, cy, r: 14 }));
    const t = el('text', {
      x: cx,
      y: cy + 7,
      'text-anchor': 'middle',
      // giữ số đứng thẳng dù ngón bị xoay
      transform: `rotate(${-f.rot} ${cx} ${cy})` + (hand === 'LH' ? ` scale(-1 1) translate(${-2 * cx} 0)` : ''),
    });
    t.textContent = String(f.n);
    g.append(t);
    root.append(g);
    groups.set(f.n, g);
  }
  root.append(el('rect', { class: 'palm', x: 70, y: 108, width: 152, height: 86, rx: 40 }));
  return {
    el: svg,
    set(finger) {
      groups.forEach((g, n) => g.classList.toggle('on', n === finger));
      svg.classList.toggle('has-finger', !!finger);
    },
  };
}
