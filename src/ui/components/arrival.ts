/**
 * "Cập bến đảo mới!" — cảnh ngắn (~3 giây) khi bé qua tuần: Bé Nốt chèo thuyền theo đường chấm chấm từ đảo cũ
 * sang đảo mới, tới nơi thì pháo giấy + tên đảo mới. Chạm bất kỳ đâu để bỏ qua. Chỉ CSS + SVG.
 */
import { islandIcon } from './art/islandArt';
import { confetti } from './celebrate';
import { h } from './dom';
import { mascot } from './mascot';
import '../../styles/kidux.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const ARRIVAL_MS = 3400;

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
  const path = document.createElementNS(SVG_NS, 'svg');
  path.setAttribute('class', 'arrival-path');
  path.setAttribute('viewBox', '0 0 1000 400');
  path.setAttribute('preserveAspectRatio', 'none');
  path.setAttribute('aria-hidden', 'true');
  path.innerHTML = `<path d="M180 270 C 380 120, 620 120, 820 270" class="route"/>`;
  const title = h('div', { class: 'arrival-title' }, h('span', {}, '🎉 Cập bến đảo mới!'), h('b', {}, `${o.toEmoji ? `${o.toEmoji} ` : ''}${o.toName}`));
  const el = h(
    'div',
    { class: 'arrival', role: 'dialog', 'aria-label': `Đến đảo mới: ${o.toName}`, onClick: done },
    path,
    h('div', { class: 'arrival-island from' }, islandIcon(o.fromWeek, 'done')),
    h('div', { class: 'arrival-island to' }, h('div', { class: 'arrival-glow' }), islandIcon(o.toWeek, 'current')),
    h('div', { class: 'arrival-boat' }, h('div', { class: 'arrival-bob' }, mascot('cheer', 66), boat())),
    title,
    h('div', { class: 'arrival-skip' }, 'Chạm để tiếp ▶'),
  );
  timers.push(
    window.setTimeout(() => {
      el.classList.add('landed');
      confetti(50);
    }, 2300),
    window.setTimeout(done, ARRIVAL_MS),
  );
  return el;
}
