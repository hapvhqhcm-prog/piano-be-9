/**
 * "Cập bến đảo mới!" — cảnh ngắn (≤ 3 giây) khi bé qua tuần: Bé Nốt đi THUYỀN (cùng cấp) hoặc MÁY BAY (sang cấp mới)
 * theo đường chấm chấm từ đảo cũ sang đảo mới, tới nơi thì nhảy múa + pháo giấy + tên đảo mới. Chạm bất kỳ đâu để bỏ qua.
 * Chỉ CSS + SVG (không rAF). (+ 2026-10-15) mây + sóng trôi (mapMotion), chi tiết riêng của đảo (nạp trễ).
 * "Giảm chuyển động" → khung tĩnh: đã cập bến ngay, không bay / lắc.
 */
import { levelOf } from '../../lessons/lessonEngine';
import { islandIcon } from './art/islandArt';
import { confetti } from './celebrate';
import { h } from './dom';
import { seaLayers } from './mapMotion';
import { cue, mascot } from './mascot';
import '../../styles/kidux.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Tổng thời gian cảnh (ms) — tự đóng sau đó. */
export const ARRIVAL_MS = 3000;
/** Lúc cập bến (ms) — khớp thời lượng hoạt hình di chuyển trong kidux.css (arrival-x / arrival-y 1.9s). */
export const LAND_MS = 1900;

function boat(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 50');
  svg.setAttribute('class', 'arrival-hull');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path d="M6 14 H114 L98 42 Q60 50 22 42 Z" fill="#ff7a6b" stroke="#3d3466" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 20 H110" stroke="#fff" stroke-width="4" opacity=".7"/>
    <path d="M0 46 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`;
  return svg;
}

/** Máy bay nhỏ (Bé Nốt ngồi trên thân) — dùng khi sang cấp mới (bản đồ mới). */
function plane(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 140 60');
  svg.setAttribute('class', 'arrival-hull plane');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path d="M14 22 l-10 -14 h12 l14 14 Z" fill="#5b54d6"/>
    <path d="M10 22 H112 q16 0 18 10 q-2 10 -18 10 H24 q-14 0 -14 -10 Z" fill="#ffcb3d" stroke="#3d3466" stroke-opacity=".35" stroke-width="2"/>
    <path d="M52 32 l-14 22 h18 l20 -22 Z" fill="#ff7a6b" stroke="#3d3466" stroke-opacity=".3" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="116" cy="30" r="5" fill="#bfe6ff" stroke="#3d3466" stroke-opacity=".4" stroke-width="1.4"/>
    <path d="M132 18 v28" stroke="#3d3466" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" class="arrival-prop"/>
    <path d="M30 28 H100" stroke="#fff" stroke-width="3" opacity=".6"/>`;
  return svg;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function islandArrival(o: { fromWeek: number; toWeek: number; toName: string; toEmoji?: string }, onDone: () => void): HTMLElement {
  let finished = false;
  const timers: number[] = [];
  const done = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    el.classList.add('leaving');
    window.setTimeout(() => {
      el.remove();
      onDone();
    }, 260);
  };
  const byPlane = levelOf(o.fromWeek).level !== levelOf(o.toWeek).level;
  const path = document.createElementNS(SVG_NS, 'svg');
  path.setAttribute('class', 'arrival-path');
  path.setAttribute('viewBox', '0 0 1000 400');
  path.setAttribute('preserveAspectRatio', 'none');
  path.setAttribute('aria-hidden', 'true');
  path.innerHTML = `<path d="M180 270 C 380 120, 620 120, 820 270" class="route"/>`;
  const title = h('div', { class: 'arrival-title' }, h('span', {}, '🎉 Cập bến đảo mới!'), h('b', {}, `${o.toEmoji ? `${o.toEmoji} ` : ''}${o.toName}`));
  const rider = h('div', { class: 'arrival-rider' }, mascot('cheer', 66));
  const el = h(
    'div',
    { class: `arrival${byPlane ? ' by-plane' : ''}`, role: 'dialog', 'aria-label': `Đến đảo mới: ${o.toName}`, onClick: done },
    ...seaLayers(),
    path,
    h('div', { class: 'arrival-island from' }, islandIcon(o.fromWeek, 'done')),
    h('div', { class: 'arrival-island to' }, h('div', { class: 'arrival-glow' }), islandIcon(o.toWeek, 'current')),
    h('div', { class: 'arrival-boat' }, h('div', { class: 'arrival-bob' }, rider, byPlane ? plane() : boat())),
    title,
    h('div', { class: 'arrival-skip' }, 'Chạm để tiếp ▶'),
  );
  const land = () => {
    if (finished) return;
    el.classList.add('landed');
    // Tới nơi: Bé Nốt nhảy múa
    rider.replaceChildren(mascot(cue('perform'), 66));
    confetti(50);
  };
  if (reducedMotion()) {
    // Khung tĩnh: đã ở đảo mới, không bay / lắc (vẫn chạm để tiếp, tự đóng như thường)
    el.classList.add('static');
    land();
  } else timers.push(window.setTimeout(land, LAND_MS));
  timers.push(window.setTimeout(done, ARRIVAL_MS));
  void import('./art/islandAccents').then((m) => !finished && m.decorateIslands(el)).catch(() => undefined);
  return el;
}
