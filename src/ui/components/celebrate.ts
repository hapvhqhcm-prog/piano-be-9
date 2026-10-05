/**
 * Pháo giấy khi bé làm đúng — vài chục mảnh màu (giấy, ngôi sao, nốt nhạc) rơi xuống rồi tự biến mất
 * (chỉ CSS + SVG nhỏ, không thư viện).
 */
import { starPath } from './art/svgKit';

const COLORS = ['#5b54d6', '#4fd1a5', '#ffcb3d', '#ff9f43', '#ff7a6b', '#8a6cff', '#ff8fb1'];

const STAR = (c: string) =>
  `<svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true"><path d="${starPath(10, 10.6, 9.5)}" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const NOTE = (c: string) =>
  `<svg viewBox="0 0 20 24" width="100%" height="100%" aria-hidden="true"><ellipse cx="7" cy="18.5" rx="5.6" ry="4.2" transform="rotate(-20 7 18.5)" fill="${c}"/><path d="M11.6 17.5 V3 q5 1.5 6.4 7" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function confetti(pieces = 36): void {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('i');
    const color = COLORS[i % COLORS.length];
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 0.25}s`;
    p.style.animationDuration = `${1.1 + Math.random() * 0.9}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 900}deg`);
    const kind = i % 4;
    if (kind === 1 || kind === 3) {
      // ngôi sao / nốt nhạc: mảnh lớn hơn, nền trong suốt
      p.style.background = 'transparent';
      p.style.width = kind === 1 ? '22px' : '20px';
      p.style.height = kind === 1 ? '22px' : '24px';
      p.style.borderRadius = '0';
      p.innerHTML = kind === 1 ? STAR(color) : NOTE(color);
    } else {
      p.style.background = color;
      if (i % 3 === 0) p.style.borderRadius = '50%';
    }
    layer.append(p);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2400);
}
