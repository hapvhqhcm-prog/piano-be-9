import type { Hand } from '../../piano/fingering';

export const FINGER_NAMES: Record<number, string> = {
  1: 'ngón cái',
  2: 'ngón trỏ',
  3: 'ngón giữa',
  4: 'ngón áp út',
  5: 'ngón út',
};

export interface HandDiagram {
  el: SVGSVGElement;
  set(finger: number | undefined): void;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Màu tay (cùng màu phím đích: --rh / --lh) */
const COLOR: Record<Hand, { line: string; dark: string }> = {
  RH: { line: '#2b7bd0', dark: '#155a9e' },
  LH: { line: '#e8890c', dark: '#a55d00' },
};
const INK = '#2a2350';

/**
 * Chỗ đặt 5 chấm số ngón trên "cây cầu" (viewBox 220×140): ngón cái thấp nhất ở một đầu, ngón giữa cao nhất — như năm đầu
 * ngón nhìn từ trên xuống. Tay phải: 1 bên trái → 5 bên phải; tay trái soi gương (5 bên trái → 1 bên phải).
 */
export function fanSpots(hand: Hand): Array<[number, number]> {
  const rh: Array<[number, number]> = [
    [30, 104],
    [70, 60],
    [110, 44],
    [150, 58],
    [190, 88],
  ];
  return hand === 'RH' ? rh : rh.map(([x, y]) => [220 - x, y]);
}

/**
 * (2026-10-18 — OWNER: không vẽ bàn tay người nữa) "QUẠT SỐ NGÓN": năm chấm tròn có số 1–5 trên một cây cầu cong (cùng chữ
 * hình với tranh tư thế); ngón cần đàn PHÓNG TO, tô màu tay, có vòng "thở" và nảy nhẹ mỗi lần đổi ngón. Emoji ✋ của máy ở
 * giữa làm điểm nhấn "đây là bàn tay".
 */
export function handDiagram(hand: Hand = 'RH'): HandDiagram {
  const svg = document.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 220 140');
  svg.setAttribute('class', `finger-fan hand-${hand.toLowerCase()}`);
  svg.setAttribute('aria-hidden', 'true');
  const c = COLOR[hand];
  const spots = fanSpots(hand);
  // dải "cây cầu" đi qua đúng năm chấm (Catmull-Rom → Bézier)
  let d = `M${spots[0][0]} ${spots[0][1]}`;
  for (let i = 0; i < 4; i++) {
    const p0 = spots[Math.max(0, i - 1)];
    const [p1, p2] = [spots[i], spots[i + 1]];
    const p3 = spots[Math.min(4, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  let inner =
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round" opacity=".12"/>` +
    `<path d="${d}" fill="none" stroke="#c9bcff" stroke-width="10" stroke-linecap="round"/>` +
    `<text x="110" y="106" font-size="44" text-anchor="middle" dominant-baseline="central">✋</text>`;
  spots.forEach(([x, y], i) => {
    inner +=
      `<g class="ff-dot" data-f="${i + 1}" transform="translate(${x} ${y})"><g class="ff-in">` +
      `<circle class="ff-pulse" r="18" fill="none" stroke="${c.line}" stroke-width="3"/>` +
      `<circle class="ff-disc" r="18" fill="#fff" stroke="${c.line}" stroke-width="3"/>` +
      `<text class="ff-num" y="7.5" font-size="21" font-weight="900" text-anchor="middle" fill="${c.dark}">${i + 1}</text></g></g>`;
  });
  svg.innerHTML = inner;
  const dots = [...svg.querySelectorAll<SVGGElement>('.ff-dot')];
  return {
    el: svg,
    set(finger) {
      dots.forEach((g, i) => {
        const on = i + 1 === finger;
        g.classList.toggle('on', on);
        const disc = g.querySelector('.ff-disc');
        const num = g.querySelector('.ff-num');
        disc?.setAttribute('fill', on ? c.line : '#fff');
        disc?.setAttribute('stroke', on ? '#fff' : c.line);
        num?.setAttribute('fill', on ? '#fff' : c.dark);
        if (on) {
          // ngón đang sáng vẽ sau cùng (nằm trên) + nảy lại
          g.parentNode?.append(g);
          g.classList.remove('pop');
          void (g as unknown as HTMLElement).getBoundingClientRect?.();
          g.classList.add('pop');
        }
      });
    },
  };
}
