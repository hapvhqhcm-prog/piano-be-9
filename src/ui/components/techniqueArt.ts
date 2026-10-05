import type { TechniqueDrill } from '../../lessons/types';
import { P, pauseWhenHidden, svgRoot } from './art/svgKit';
import { handArt } from './handArt';

/**
 * v5 — Tranh hoạt hình cho KHỞI ĐỘNG KỸ THUẬT (technique.ts): mỗi bài một cảnh nhỏ tự chạy lặp,
 * vẽ bằng SVG (animateMotion / animateTransform — chạy được trên Safari iPad, không cần thư viện).
 * five-finger không có ở đây: màn dùng bàn phím thật + bàn tay thầy (HandOverlay).
 */

const OL = 'rgba(61,52,102,.45)';
const SKIN = P.skin;
const SKIN_D = P.skinDark;

/** Dải phím đàn nhìn ngang/nhìn trên (x, y, số phím trắng). */
function keys(x: number, y: number, n: number, w = 22, hgt = 34, glow: number[] = []): string {
  let s = `<rect x="${x - 4}" y="${y - 8}" width="${n * w + 8}" height="${hgt + 12}" rx="6" fill="${P.ink}"/>`;
  for (let i = 0; i < n; i++) {
    const g = glow.includes(i);
    s += `<rect class="${g ? 'tq-glowkey' : ''}" x="${x + i * w}" y="${y}" width="${w - 2}" height="${hgt}" rx="3" fill="${g ? P.sunLight : P.white}"/>`;
  }
  const blacks = [0, 1, 3, 4, 5];
  for (let i = 0; i < n - 1; i++) {
    if (!blacks.includes(i % 7)) continue;
    s += `<rect x="${x + (i + 1) * w - 7}" y="${y}" width="12" height="${hgt * 0.6}" rx="2" fill="${P.night}"/>`;
  }
  return s;
}

const STYLE = `<style>
  .tq-glowkey { animation: tq-glow 1.6s ease-in-out infinite; }
  .tq-pulse { animation: tq-pulse 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes tq-glow { 50% { fill: ${P.sun}; } }
  @keyframes tq-pulse { 50% { transform: scale(1.06); } }
  @media (prefers-reduced-motion: reduce) { .tq-glowkey, .tq-pulse { animation: none; } }
</style>`;

/** Cầu vồng rơi: bàn tay bay theo cầu vồng rồi đáp NHẸ xuống phím, nhấc lên lại. */
function armDrop(): SVGSVGElement {
  const arc = 'M38 120 Q 110 -10 196 128';
  const bands = [P.coral, P.sun, P.mint, P.water, P.violet]
    .map((c, i) => `<path d="M${38 + i * 5} 120 Q 110 ${-10 + i * 9} ${196 - i * 5} 128" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`)
    .join('');
  return svgRoot(
    '0 0 240 180',
    'tq-art tq-arm',
    `${STYLE}
    <ellipse cx="120" cy="170" rx="110" ry="8" fill="${P.lavender}"/>
    ${bands}
    ${keys(150, 132, 4, 20, 26)}
    <g>
      <animateMotion dur="3.2s" repeatCount="indefinite" path="${arc}" keyPoints="0;1;1;0" keyTimes="0;0.55;0.8;1" calcMode="spline"
        keySplines=".5 0 .9 1; 0 0 1 1; .4 0 .6 1"/>
      <g transform="translate(-16 -26)">
        <path d="M2 18 Q 4 2 18 2 Q 32 2 32 16 L 32 26 Q 30 32 24 32 L 8 32 Q 2 30 2 24 Z" fill="${SKIN}" stroke="${OL}" stroke-width="2"/>
        <path d="M8 32 L8 38 M14 32 L14 40 M20 32 L20 40 M26 32 L26 38" stroke="${SKIN_D}" stroke-width="5" stroke-linecap="round"/>
      </g>
    </g>
    <text x="112" y="152" font-size="18" font-weight="800" fill="${P.grassDark}" text-anchor="middle" opacity="0">nhẹ!
      <animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;0.5;0.58;0.78;1"/>
    </text>`,
  );
}

/** Xoay cổ tay: cẳng tay + bàn tay đi vòng tròn chậm, có mũi tên tròn chỉ hướng. */
function wristCircle(): SVGSVGElement {
  return svgRoot(
    '0 0 240 180',
    'tq-art tq-wrist',
    `${STYLE}
    <circle cx="150" cy="88" r="40" fill="none" stroke="${P.violetLight}" stroke-width="5" stroke-dasharray="10 9"/>
    <path d="M186 64 l10 -4 l-2 11" fill="none" stroke="${P.violet}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <g>
      <animateMotion dur="3.6s" repeatCount="indefinite" path="M0 -18 A 18 18 0 1 1 -0.1 -18"/>
      <g transform="translate(0 18)">
        <path d="M14 96 L124 88" stroke="${OL}" stroke-width="26" stroke-linecap="round"/>
        <path d="M14 96 L124 88" stroke="${P.violet}" stroke-width="22" stroke-linecap="round"/>
        <rect x="100" y="76" width="16" height="24" rx="5" fill="${P.white}" opacity=".7"/>
        ${[0, 1, 2, 3]
          .map((k) => `<rect x="150" y="${70 + k * 9}" width="${k === 0 || k === 3 ? 30 : 36}" height="9" rx="4.5" fill="${SKIN}" stroke="${OL}" stroke-width="1.6"/>`)
          .join('')}
        <path d="M150 104 q 14 10 26 4" fill="none" stroke="${OL}" stroke-width="12" stroke-linecap="round"/>
        <path d="M150 104 q 14 10 26 4" fill="none" stroke="${SKIN}" stroke-width="9" stroke-linecap="round"/>
        <rect x="120" y="68" width="40" height="40" rx="15" fill="${SKIN}" stroke="${OL}" stroke-width="2"/>
      </g>
    </g>`,
  );
}

/** Ngón cái chui hầm: nhìn từ trên — ngón cái trượt DƯỚI lòng bàn tay tới phím Fa (sáng) rồi về. */
function thumbUnder(): SVGSVGElement {
  return svgRoot(
    '0 0 240 180',
    'tq-art tq-thumb',
    `${STYLE}
    ${keys(32, 128, 8, 22, 40, [3])}
    <g>
      <animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite"
        values="0 0; 62 -6; 62 -6; 0 0" keyTimes="0;0.45;0.7;1"/>
      <ellipse cx="48" cy="120" rx="11" ry="20" fill="${SKIN_D}" stroke="${OL}" stroke-width="2"/>
      <text x="48" y="126" font-size="14" font-weight="900" fill="${P.ink}" text-anchor="middle">1</text>
    </g>
    <g opacity=".86">
      <rect x="60" y="54" width="104" height="70" rx="30" fill="${SKIN}" stroke="${OL}" stroke-width="2"/>
      ${[0, 1, 2, 3]
        .map((i) => `<rect x="${66 + i * 25}" y="${i === 1 ? 92 : i === 3 ? 102 : 96}" width="20" height="${i === 3 ? 30 : 40}" rx="10" fill="${SKIN}" stroke="${OL}" stroke-width="2"/>
           <text x="${76 + i * 25}" y="${i === 3 ? 126 : 128}" font-size="12" font-weight="800" fill="${P.ink}" text-anchor="middle">${i + 2}</text>`)
        .join('')}
    </g>
    <path d="M60 30 q 50 -18 100 0" fill="none" stroke="${P.violet}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
    <path d="M152 24 l10 6 l-11 5" fill="none" stroke="${P.violet}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** Ôm quả bóng: bàn tay khum tròn trên quả bóng; bóng mờ đi — tay vẫn giữ dáng tròn đặt xuống phím. */
function handShape(): SVGSVGElement {
  return svgRoot(
    '0 0 240 180',
    'tq-art tq-ball',
    `${STYLE}
    ${keys(40, 140, 8, 20, 22)}
    <g>
      <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="1;1;0.15;0.15;1" keyTimes="0;0.4;0.55;0.85;1"/>
      <circle cx="120" cy="100" r="34" fill="${P.orange}" stroke="${OL}" stroke-width="2"/>
      <path d="M88 92 Q 120 112 152 92 M120 66 Q 108 100 120 134" fill="none" stroke="${P.sunLight}" stroke-width="4"/>
    </g>
    <g class="tq-pulse">
      <path d="M70 128 Q 66 56 120 52 Q 176 54 172 126" fill="none" stroke="${OL}" stroke-width="26" stroke-linecap="round"/>
      <path d="M70 128 Q 66 56 120 52 Q 176 54 172 126" fill="none" stroke="${SKIN}" stroke-width="22" stroke-linecap="round"/>
      <path d="M96 60 Q 120 54 146 60" fill="none" stroke="${SKIN_D}" stroke-width="3" stroke-linecap="round"/>
    </g>
    <text x="210" y="60" font-size="15" font-weight="800" fill="${P.violet}" text-anchor="middle">tròn!</text>`,
  );
}

/**
 * Ngón gõ cửa: bàn tay minh họa (handArt) úp trên nắp đàn gỗ, các ngón lần lượt nhấn 1→5→1.
 * Trả về hàm dừng (gỡ hẹn giờ).
 */
function fingerTap(): { el: HTMLElement; stop: () => void } {
  const art = handArt('RH', { numbers: true, className: 'tq-hand' });
  const lid = document.createElement('div');
  lid.className = 'tq-lid';
  const box = document.createElement('div');
  box.className = 'tq-art tq-tap';
  box.append(lid, art.el);
  const order = [1, 2, 3, 4, 5, 4, 3, 2];
  let k = 0;
  const t = window.setInterval(() => {
    const f = order[k++ % order.length];
    art.setActive(f);
    art.press(f, 320);
  }, 520);
  return { el: box, stop: () => window.clearInterval(t) };
}

/** Tranh cho một bài khởi động; `stop` gỡ hẹn giờ khi rời bài. */
export function techniqueArt(drill: Exclude<TechniqueDrill, 'five-finger'>): { el: Element; stop: () => void } {
  switch (drill) {
    case 'arm-drop':
      return { el: pauseWhenHidden(armDrop()), stop: () => undefined };
    case 'wrist-circle':
      return { el: pauseWhenHidden(wristCircle()), stop: () => undefined };
    case 'thumb-under':
      return { el: pauseWhenHidden(thumbUnder()), stop: () => undefined };
    case 'hand-shape':
      return { el: pauseWhenHidden(handShape()), stop: () => undefined };
    case 'finger-tap':
      return fingerTap();
  }
}
