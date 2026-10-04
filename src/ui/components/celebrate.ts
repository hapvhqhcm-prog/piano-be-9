/** Pháo giấy khi bé làm đúng — vài chục mảnh màu rơi xuống rồi tự biến mất (chỉ CSS, không thư viện). */
const COLORS = ['#3b6fd8', '#2e9e5b', '#f4b400', '#f28c28', '#e05f9a', '#7a5cff'];

export function confetti(pieces = 36): void {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = COLORS[i % COLORS.length];
    p.style.animationDelay = `${Math.random() * 0.25}s`;
    p.style.animationDuration = `${1.1 + Math.random() * 0.9}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 900}deg`);
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.append(p);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2400);
}
