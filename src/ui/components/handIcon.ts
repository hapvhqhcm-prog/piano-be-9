/**
 * (+ 2026-10-15) Biểu tượng TÍ HON tư thế tay (≈ 34 px) cho câu nhắc tư thế một dòng ở màn khởi động bằng nhạc.
 * (2026-10-18 — OWNER: không vẽ bàn tay người) Sơ đồ "cây cầu" thu nhỏ: nét cầu cong cao trên ba chấm đầu ngón đứng trên
 * phím (cùng chữ hình với thẻ "Tư thế tay", art/diagramKit.ts). Vòng màu: xanh (nhắc thường) / vàng (bố mẹ vừa nhắc).
 */
import type { HandPrincipleId } from '../../lessons/handTechnique';
import { SVG_NS } from './art/svgKit';
import { ARCH, DOT, INK, archD } from './art/diagramKit';

/** Chữ ngắn đi kèm biểu tượng. */
export const HAND_ICON_TEXT: Record<HandPrincipleId, string> = {
  shape: 'tay tròn',
  tip: 'đầu ngón',
  thumb: 'ngón cái',
  wrist: 'cổ tay',
  weight: 'thả vai',
  quiet: 'ngón nghỉ',
  sit: 'ngồi',
  legato: 'đàn liền',
  staccato: 'đàn ngắt',
};

export function handIconMarkup(flagged = false): string {
  const xs = [28, 50, 72];
  const y = 66;
  const d = archD([xs[0], y], [xs[2], y], 30);
  let s =
    `<circle cx="50" cy="50" r="47" fill="${flagged ? '#fff3c4' : '#effbf5'}" stroke="${flagged ? '#f0b429' : '#2fbf71'}" stroke-width="4"/>` +
    // phím (nhìn thẳng)
    `<rect x="14" y="${y + 8}" width="72" height="16" rx="4" fill="#fff" stroke="${INK}" stroke-width="2.6"/>` +
    `<path d="M38 ${y + 8} V${y + 24} M62 ${y + 8} V${y + 24}" stroke="${INK}" stroke-width="2"/>` +
    // cột cầu giữa + cây cầu
    `<path d="M50 ${y} V${y - 26}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M50 ${y} V${y - 26}" stroke="${ARCH}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${ARCH}" stroke-width="7" stroke-linecap="round"/>`;
  for (const x of xs) s += `<circle cx="${x}" cy="${y}" r="7.5" fill="${DOT}" stroke="${INK}" stroke-width="2.6"/>`;
  return s;
}

export function handIcon(flagged = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'hand-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = handIconMarkup(flagged);
  return svg;
}
