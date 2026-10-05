import type { Hand } from '../../piano/fingering';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * BÀN TAY MINH HỌA (vẽ lại cho đẹp): nhìn từ trên xuống, úp trên phím — ngón chỉ lên (vào trong đàn).
 * Tay phải: ngón cái bên trái → ngón út bên phải (như khi bé nhìn tay mình trên đàn).
 * Tay trái là ảnh soi gương. Có móng tay, nếp đốt ngón, da chuyển màu, số ngón trên mỗi đầu ngón.
 *
 * Toạ độ (viewBox 220×210): đầu ngón 1→5 nằm ở x = 47, 80, 113, 146, 179 (cách đều 33 = một phím trắng),
 * để lớp "thầy đàn mẫu" đặt đúng ngón lên đúng phím.
 */
export const HAND_VIEW = { w: 220, h: 210, tipY: 34, spacing: 33 };
/** x đầu ngón tay phải 1..5 (index 0 = ngón 1) */
export const RH_TIP_X = [51, 80, 113, 146, 179];

interface FingerGeom {
  n: number;
  cx: number;
  w: number;
  ty: number;
  by: number;
  rot?: { deg: number; x: number; y: number };
}

const FINGERS: FingerGeom[] = [
  { n: 1, cx: 88, w: 31, ty: 62, by: 152, rot: { deg: -27.7, x: 88, y: 152 } },
  { n: 2, cx: 80, w: 29, ty: 30, by: 112 },
  { n: 3, cx: 113, w: 30, ty: 18, by: 112 },
  { n: 4, cx: 146, w: 28, ty: 28, by: 112 },
  { n: 5, cx: 179, w: 24, ty: 52, by: 118 },
];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Đường viền một ngón: thân hơi thon về đầu, đầu ngón tròn. */
function fingerPath(f: FingerGeom): string {
  const r = f.w / 2;
  const top = f.ty + r;
  const taper = 1.5;
  return [
    `M${f.cx - r - taper},${f.by}`,
    `L${f.cx - r},${top}`,
    `A${r},${r} 0 0 1 ${f.cx + r},${top}`,
    `L${f.cx + r + taper},${f.by}`,
    'Z',
  ].join(' ');
}

let uid = 0;

export interface HandArt {
  el: SVGSVGElement;
  /** Làm sáng một ngón (null = không ngón nào) */
  setActive(finger: number | null | undefined): void;
  /** Nhấn ngón xuống trong `ms` mili-giây (hoạt hình) */
  press(finger: number, ms?: number): void;
  setNumbers(on: boolean): void;
}

export function handArt(
  hand: Hand = 'RH',
  /** thumbOnTop: hình minh họa đứng riêng (thẻ "Ngón 1") — ngón cái vẽ trên bàn tay cho thấy rõ.
   *  Bàn tay phủ trên phím đàn thì KHÔNG (ngón cái sẽ đè ngón 2). */
  opts: { numbers?: boolean; className?: string; thumbOnTop?: boolean } = {},
): HandArt {
  const id = `h${++uid}`;
  const svg = el('svg', {
    viewBox: `0 0 ${HAND_VIEW.w} ${HAND_VIEW.h}`,
    class: `hand-art hand-${hand.toLowerCase()} ${opts.className ?? ''}`,
    'aria-hidden': 'true',
  });
  const defs = el('defs');
  defs.innerHTML = `
    <linearGradient id="${id}-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe7d3"/><stop offset="1" stop-color="#f5c7a2"/>
    </linearGradient>
    <linearGradient id="${id}-palm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbd6b7"/><stop offset="1" stop-color="#efb98f"/>
    </linearGradient>
    <linearGradient id="${id}-on" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hand === 'RH' ? '#7ee2a4' : '#ffc27a'}"/>
      <stop offset="1" stop-color="${hand === 'RH' ? '#2e9e5b' : '#f28c28'}"/>
    </linearGradient>`;
  svg.append(defs);
  const root = el('g', hand === 'LH' ? { transform: `translate(${HAND_VIEW.w} 0) scale(-1 1)` } : {});
  svg.append(root);

  const groups = new Map<number, SVGGElement>();
  const badges: SVGGElement[] = [];
  // Các ngón, rồi bàn tay; ngón cái được đưa lên trên cùng (xem dưới)
  for (const f of FINGERS) {
    const g = el('g', { class: 'f', 'data-f': f.n });
    const inner = el('g', { class: 'f-inner', ...(f.rot ? { transform: `rotate(${f.rot.deg} ${f.rot.x} ${f.rot.y})` } : {}) });
    inner.append(el('path', { d: fingerPath(f), class: 'f-skin', fill: `url(#${id}-skin)` }));
    // móng tay
    inner.append(
      el('rect', { x: f.cx - f.w * 0.3, y: f.ty + 5, width: f.w * 0.6, height: f.w * 0.62, rx: f.w * 0.26, class: 'f-nail' }),
    );
    // nếp đốt ngón
    const crease = f.ty + (f.by - f.ty) * 0.62;
    inner.append(el('path', { d: `M${f.cx - f.w * 0.28},${crease} q${f.w * 0.28},4 ${f.w * 0.56},0`, class: 'f-crease' }));
    // số ngón
    const b = el('g', { class: 'f-badge' });
    const by = f.ty + f.w * 0.62 + 22;
    b.append(el('circle', { cx: f.cx, cy: by, r: 12 }));
    const t = el('text', {
      x: f.cx,
      y: by + 6,
      'text-anchor': 'middle',
      transform: (f.rot ? `rotate(${-f.rot.deg} ${f.cx} ${by})` : '') + (hand === 'LH' ? ` scale(-1 1) translate(${-2 * f.cx} 0)` : ''),
    });
    t.textContent = String(f.n);
    b.append(t);
    inner.append(b);
    badges.push(b);
    g.append(inner);
    root.append(g);
    groups.set(f.n, g);
  }
  // lòng/mu bàn tay + cổ tay
  root.append(
    el('path', {
      class: 'palm',
      fill: `url(#${id}-palm)`,
      d: 'M62,104 C60,94 72,93 78,98 L190,106 C202,124 204,152 198,176 C192,198 176,210 150,210 L100,210 C76,210 60,196 58,168 Z',
    }),
  );
  // nếp khớp ngón trên mu bàn tay
  root.append(el('path', { class: 'knuckles', d: 'M70,112 Q113,104 190,116' }));
  // Hình đứng riêng: ngón cái đưa LÊN TRÊN bàn tay — trước đây nằm dưới lòng bàn tay nên gần như bị che hết —
  // đúng lúc nó là ngón cần bấm (ngón 1) thì bé lại không thấy.
  const thumb = groups.get(1);
  if (thumb && opts.thumbOnTop) root.append(thumb);

  const setActive = (finger: number | null | undefined) => {
    groups.forEach((g, n) => g.classList.toggle('on', n === finger));
    svg.classList.toggle('has-active', !!finger);
    // gắn lại gradient màu cho ngón đang sáng
    groups.forEach((g, n) =>
      g.querySelector('.f-skin')?.setAttribute('fill', n === finger ? `url(#${id}-on)` : `url(#${id}-skin)`),
    );
  };

  return {
    el: svg,
    setActive,
    press(finger, ms = 300) {
      const g = groups.get(finger);
      if (!g) return;
      g.classList.remove('press');
      void (g as unknown as HTMLElement).getBoundingClientRect();
      g.classList.add('press');
      window.setTimeout(() => g.classList.remove('press'), ms);
    },
    setNumbers(on) {
      badges.forEach((b) => b.classList.toggle('hidden', !on));
    },
  };
}
