/**
 * (+ 2026-10-15) Biểu tượng TÍ HON "ngón cong trên phím" (≈ 34 px) cho câu nhắc tư thế một dòng ở màn khởi động bằng nhạc.
 * Vẽ bằng bộ vẽ chung art/handKit.ts (nhẹ, không nạp tranh lớn). Vòng màu: xanh (nhắc thường) / vàng (bố mẹ vừa nhắc).
 */
import type { HandPrincipleId } from '../../lessons/handTechnique';
import { SVG_NS, uid } from './art/svgKit';
import { sideHand, sideKeys } from './art/handKit';

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
  const hand = sideHand({ tip: [74, 66], pose: 'curved', scale: 1.15, sleeve: null, nail: true });
  const clip = uid('hi-clip');
  return (
    `<defs><clipPath id="${clip}"><circle cx="50" cy="50" r="45"/></clipPath></defs>` +
    `<circle cx="50" cy="50" r="47" fill="${flagged ? '#fff3c4' : '#effbf5'}" stroke="${flagged ? '#f0b429' : '#2fbf71'}" stroke-width="4"/>` +
    `<g clip-path="url(#${clip})">${sideKeys({ x: 56, y: 71, len: 40 })}${hand.svg}</g>`
  );
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
