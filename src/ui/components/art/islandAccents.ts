/**
 * (+ 2026-10-15, OWNER duyệt "Nhân vật & bản đồ sinh động hơn") Chi tiết nhỏ RIÊNG cho từng đảo 1–43 (cua, hải âu, đèn lồng,
 * ếch trên lá sen, pháo hoa…) theo chủ đề đảo — vẽ thêm lên tranh islandIcon (islandArt.ts) ở mép đảo / trời / nước.
 * Các tuần dùng lại tranh của tuần khác (ART_OF_WEEK) nhờ vậy vẫn khác nhau.
 * Nạp TRỄ (dynamic import sau khi màn đã vẽ) — không làm nặng lần vẽ đầu. Cùng hệ toạ độ viewBox 96×80.
 */
import { P, noteGlyph, sparkle, starPath } from './svgKit';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = P.ink;
const f1 = (n: number) => +n.toFixed(1);

/* ---------- Đồ vật nhỏ ---------- */
const gull = (x: number, y: number, s = 1) =>
  `<path d="M${x - 4 * s} ${y} q${2 * s} ${-2.6 * s} ${4 * s} 0 q${2 * s} ${-2.6 * s} ${4 * s} 0" fill="none" stroke="${INK}" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/>`;
const crab = (x: number, y: number) =>
  `<g fill="${P.coral}"><path d="M${x - 2} ${y - 2} v-2.4 M${x + 2} ${y - 2} v-2.4" stroke="${P.coral}" stroke-width="1"/><circle cx="${x - 2}" cy="${y - 4.6}" r="1"/><circle cx="${x + 2}" cy="${y - 4.6}" r="1"/>` +
  `<ellipse cx="${x}" cy="${y}" rx="4.4" ry="2.8"/><circle cx="${x - 6}" cy="${y - 1.6}" r="1.7"/><circle cx="${x + 6}" cy="${y - 1.6}" r="1.7"/></g>`;
const shell = (x: number, y: number, c: string) =>
  `<path d="M${x - 4} ${y} q4 -7 8 0 Z" fill="${c}"/><path d="M${x} ${y} v-4.6 M${x - 2} ${y} l-0.6 -3.6 M${x + 2} ${y} l0.6 -3.6" stroke="#fff" stroke-opacity=".8" stroke-width=".7"/>`;
const flower = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y + 4} v-4" stroke="${P.grassDark}" stroke-width="1.2"/><g fill="${c}" stroke="none"><circle cx="${x - 1.7}" cy="${y - 1}" r="1.7"/><circle cx="${x + 1.7}" cy="${y - 1}" r="1.7"/><circle cx="${x}" cy="${y - 2.8}" r="1.7"/><circle cx="${x}" cy="${y + 0.7}" r="1.7"/></g><circle cx="${x}" cy="${y - 1}" r="1.1" fill="${P.sun}" stroke="none"/>`;
const butterfly = (x: number, y: number, c: string) =>
  `<g fill="${c}" stroke="none"><ellipse cx="${x - 2.4}" cy="${y - 1.2}" rx="2.4" ry="3" transform="rotate(-25 ${x - 2.4} ${y - 1.2})"/><ellipse cx="${x + 2.4}" cy="${y - 1.2}" rx="2.4" ry="3" transform="rotate(25 ${x + 2.4} ${y - 1.2})"/>` +
  `<circle cx="${x - 1.8}" cy="${y + 2}" r="1.4"/><circle cx="${x + 1.8}" cy="${y + 2}" r="1.4"/></g><path d="M${x} ${y - 2.6} v5.4" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`;
const bee = (x: number, y: number) =>
  `<ellipse cx="${x - 1}" cy="${y - 3}" rx="2" ry="1.4" fill="#fff" opacity=".9"/><ellipse cx="${x + 1.4}" cy="${y - 3.2}" rx="2" ry="1.4" fill="#fff" opacity=".9"/>` +
  `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.6" fill="${P.sun}"/><path d="M${x - 1} ${y - 2.4} v4.8 M${x + 1.2} ${y - 2.4} v4.8" stroke="${INK}" stroke-width="1"/>`;
const balloon = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y + 4} q-1.6 4 0.6 8" fill="none" stroke="${INK}" stroke-opacity=".5" stroke-width=".8"/><ellipse cx="${x}" cy="${y}" rx="3.4" ry="4.2" fill="${c}"/><ellipse cx="${x - 1.1}" cy="${y - 1.6}" rx=".9" ry="1.3" fill="#fff" opacity=".7" stroke="none"/>`;
const duck = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="2.8" fill="${P.sun}"/><circle cx="${x + 3.2}" cy="${y - 3.2}" r="2.3" fill="${P.sun}"/><path d="M${x + 5.2} ${y - 3.4} l2.4 0.6 l-2.4 0.8 Z" fill="${P.orange}"/><circle cx="${x + 3.6}" cy="${y - 3.8}" r=".6" fill="${INK}" stroke="none"/>`;
const owl = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="4" ry="5" fill="${P.woodDark}"/><path d="M${x - 3.4} ${y - 3.6} l-0.6 -2.4 l2 1.4 M${x + 3.4} ${y - 3.6} l0.6 -2.4 l-2 1.4" fill="${P.woodDark}"/>` +
  `<circle cx="${x - 1.6}" cy="${y - 1.4}" r="1.6" fill="#fff" stroke="none"/><circle cx="${x + 1.6}" cy="${y - 1.4}" r="1.6" fill="#fff" stroke="none"/><circle cx="${x - 1.6}" cy="${y - 1.4}" r=".7" fill="${INK}" stroke="none"/><circle cx="${x + 1.6}" cy="${y - 1.4}" r=".7" fill="${INK}" stroke="none"/><path d="M${x} ${y} l-0.7 1.2 h1.4 Z" fill="${P.orange}" stroke="none"/>`;
const fish = (x: number, y: number, c: string) =>
  `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.2" transform="rotate(-30 ${x} ${y})" fill="${c}"/><path d="M${x + 2.6} ${y + 1.6} l3 -0.4 l-1.2 3 Z" fill="${c}"/>` +
  `<circle cx="${x - 4.6}" cy="${y + 3}" r=".9" fill="#fff" stroke="none"/><circle cx="${x - 6}" cy="${y + 5.4}" r=".7" fill="#fff" stroke="none"/>`;
const bunting = (x1: number, y1: number, x2: number, y2: number) => {
  const cs = [P.coral, P.sun, P.mint, P.violet, P.pink];
  let t = `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.max(y1, y2) + 3} ${x2} ${y2}" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width=".8"/>`;
  for (let i = 1; i <= 4; i++) {
    const k = i / 5;
    const x = f1(x1 + (x2 - x1) * k);
    const y = f1(y1 + (y2 - y1) * k + 3 * 4 * k * (1 - k));
    t += `<path d="M${f1(x - 1.6)} ${y} h3.2 l-1.6 3.4 Z" fill="${cs[i % cs.length]}" stroke="none"/>`;
  }
  return t;
};
const lantern = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y - 6} v2" stroke="${INK}" stroke-opacity=".6" stroke-width=".8"/><rect x="${x - 2.6}" y="${y - 4}" width="5.2" height="6.6" rx="2.4" fill="${c}"/><path d="M${x - 1.4} ${y - 4} h2.8 M${x - 1.4} ${y + 2.6} h2.8" stroke="${P.woodDark}" stroke-width="1"/><circle cx="${x}" cy="${y - 0.6}" r="1" fill="#fff" opacity=".7" stroke="none"/>`;
const mushroom = (x: number, y: number, c: string) =>
  `<rect x="${x - 1.2}" y="${y - 2}" width="2.4" height="4" rx="1" fill="#fff4dc"/><path d="M${x - 4.4} ${y - 1.6} q4.4 -7 8.8 0 Z" fill="${c}"/><circle cx="${x - 1.4}" cy="${y - 3.6}" r=".8" fill="#fff" stroke="none"/><circle cx="${x + 1.8}" cy="${y - 3}" r=".6" fill="#fff" stroke="none"/>`;
const sun = (x: number, y: number, r: number) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d += `M${f1(x + Math.cos(a) * r * 1.35)} ${f1(y + Math.sin(a) * r * 1.35)} L${f1(x + Math.cos(a) * r * 1.8)} ${f1(y + Math.sin(a) * r * 1.8)} `;
  }
  return `<path d="${d}" stroke="${P.orange}" stroke-width="1.2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${r}" fill="${P.sun}" stroke="none"/>`;
};
const cloud = (x: number, y: number) =>
  `<g fill="#fff" stroke="none" opacity=".95"><ellipse cx="${x}" cy="${y}" rx="6" ry="2.6"/><circle cx="${x - 2}" cy="${y - 1.6}" r="2.4"/><circle cx="${x + 1.8}" cy="${y - 2.2}" r="3"/></g>`;
const rock = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" fill="${P.stone}"/><ellipse cx="${x + 3.4}" cy="${y + 0.8}" rx="2.4" ry="1.6" fill="${P.stoneDark}"/>`;
const lily = (x: number, y: number) =>
  `<path d="M${x} ${y} m-4.6 0 a4.6 2 0 1 0 9.2 0 a4.6 2 0 1 0 -9.2 0 Z" fill="${P.grassDark}"/><path d="M${x} ${y} l2.6 -1.6" stroke="${P.water}" stroke-width="1"/>` +
  `<path d="M${x - 1.6} ${y - 0.6} l1.6 -3 l1.6 3 Z" fill="${P.pink}" stroke="none"/>`;
const frog = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="2.4" fill="${P.grass}"/><circle cx="${x - 1.6}" cy="${y - 2}" r="1.3" fill="${P.grass}"/><circle cx="${x + 1.6}" cy="${y - 2}" r="1.3" fill="${P.grass}"/><circle cx="${x - 1.6}" cy="${y - 2.1}" r=".55" fill="${INK}" stroke="none"/><circle cx="${x + 1.6}" cy="${y - 2.1}" r=".55" fill="${INK}" stroke="none"/>`;
const lamp = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y - 11}" r="4" fill="${P.sunLight}" opacity=".55" stroke="none"/><path d="M${x} ${y} v-10" stroke="${INK}" stroke-opacity=".8" stroke-width="1.3"/><path d="M${x - 2} ${y - 10} h4 l-1 -2.6 h-2 Z" fill="${P.sun}"/>`;
const rainbow = (x: number, y: number, r: number) =>
  [P.coral, P.sun, P.mint]
    .map((c, i) => `<path d="M${x - r + i * 1.6} ${y} a${r - i * 1.6} ${r - i * 1.6} 0 0 1 ${2 * (r - i * 1.6)} 0" fill="none" stroke="${c}" stroke-width="1.6"/>`)
    .join('');
const kite = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y - 5} l3.6 4 l-3.6 5 l-3.6 -5 Z" fill="${c}"/><path d="M${x} ${y + 4} q-2 3 0 5 q2 2 0 4" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width=".8"/><path d="M${x - 1} ${y + 7} l-1.4 -0.6 M${x + 0.4} ${y + 10} l1.4 -0.4" stroke="${P.sun}" stroke-width="1.2"/>`;
const tent = (x: number, y: number, c: string) =>
  `<path d="M${x - 5.4} ${y} L${x} ${y - 8} L${x + 5.4} ${y} Z" fill="${c}"/><path d="M${x} ${y} l-1.6 -3.6 h3.2 Z" fill="${P.woodDark}" stroke="none"/>`;
const campfire = (x: number, y: number) =>
  `<path d="M${x - 3.4} ${y + 1} l6.8 -1.6 M${x - 3.4} ${y - 0.6} l6.8 1.6" stroke="${P.woodDark}" stroke-width="1.4" stroke-linecap="round"/><path d="M${x} ${y - 6} q3 3 1.6 5 q-1.6 1 -3.2 0 q-1.4 -2 1.6 -5 Z" fill="${P.orange}"/><path d="M${x} ${y - 3} q1.2 1.4 0.4 2.4 h-0.8 q-0.6 -1 0.4 -2.4 Z" fill="${P.sun}" stroke="none"/>`;
const moon = (x: number, y: number) =>
  `<path d="M${x + 1} ${y - 5} a5 5 0 1 0 3.6 8.4 a4 4 0 1 1 -3.6 -8.4 Z" fill="${P.sunLight}"/>`;
const leaf = (x: number, y: number, c: string, a: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.3" transform="rotate(${a} ${x} ${y})" fill="${c}"/>`;
const buoy = (x: number, y: number) =>
  `<path d="M${x - 3} ${y} a3 3 0 0 1 6 0 Z" fill="${P.coral}"/><path d="M${x - 2.4} ${y - 1.6} h4.8" stroke="#fff" stroke-width="1"/><path d="M${x} ${y - 3} v-3" stroke="${INK}" stroke-opacity=".7" stroke-width=".9"/><circle cx="${x}" cy="${y - 6.4}" r="1" fill="${P.sun}"/>`;
const pennant = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y} v-9" stroke="${INK}" stroke-opacity=".7" stroke-width="1"/><path d="M${x} ${y - 9} l6 2 l-6 2 Z" fill="${c}"/>`;
const bush = (x: number, y: number, c: string) =>
  `<circle cx="${x}" cy="${y - 3}" r="3.4" fill="${c}"/><rect x="${x - 2}" y="${y}" width="4" height="2.6" rx=".6" fill="${P.wood}"/>`;
const firework = (x: number, y: number, r: number, c: string) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.2;
    d += `M${f1(x + Math.cos(a) * r * 0.4)} ${f1(y + Math.sin(a) * r * 0.4)} L${f1(x + Math.cos(a) * r)} ${f1(y + Math.sin(a) * r)} `;
  }
  return `<path d="${d}" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`;
};
const star = (x: number, y: number, r: number, c: string) => `<path d="${starPath(x, y, r)}" fill="${c}" stroke="none"/>`;

/** Chi tiết riêng của từng tuần (1–43). */
export const ACCENTS: Readonly<Record<number, string>> = {
  1: crab(14, 64) + gull(12, 12), // Đảo Phím Đen — cua + hải âu
  2: flower(14, 60, P.coral) + flower(84, 62, P.sun), // Làng Đô Rê Mi — hoa trước ngõ
  3: butterfly(12, 16, P.pink) + shell(84, 66, P.coralLight), // Cầu thang Sol
  4: mushroom(14, 62, P.coral) + gull(44, 8, 0.8), // Rừng Nhịp
  5: bee(12, 18) + flower(84, 62, P.violet), // Đồi Năm Ngón — ong + hoa
  6: balloon(9, 20, P.coral) + balloon(17, 25, P.sun), // Sân khấu nhỏ — bóng bay
  7: duck(87, 70) + lily(8, 70), // Hồ Tấm Gương — vịt + lá sen
  8: owl(12, 60) + sparkle(14, 14, 3.4, P.sun), // Thư viện Nốt — cú đọc sách
  9: fish(88, 68, P.orange) + gull(14, 14), // Bến Đò Nhịp Hai — cá nhảy
  10: bunting(4, 24, 30, 16) + sparkle(20, 8, 3, P.sun), // Lâu đài — dây cờ
  11: gull(10, 12) + gull(22, 19, 0.8) + buoy(90, 71), // Cầu Hai Tay — đôi chim
  12: noteGlyph(9, 22, 2.4, P.coral) + noteGlyph(18, 28, 2.4, P.violet) + flower(85, 62, P.pink), // Thung lũng Song Ca
  13: flower(11, 62, P.pink) + flower(18, 66, P.violet) + flower(84, 64, P.sun), // Vườn Tháp Chuông
  14: cloud(14, 14) + rock(86, 66), // Núi Sol
  15: lantern(10, 20, P.coral) + lantern(21, 26, P.sun), // Vũ hội Valse — đèn lồng
  16: mushroom(13, 62, P.violet) + sparkle(12, 52, 2.4, P.sunLight) + gull(14, 12), // Hang Phím Đen — nấm phát sáng
  17: sun(14, 14, 4.4) + rock(84, 66), // Sa mạc Nhịp Chấm
  18: lily(8, 71) + frog(8, 68) + leaf(88, 70, P.grassDark, 20), // Suối Móc Kép — ếch trên lá sen
  19: lamp(12, 62) + cloud(16, 12), // Phố Xích Lô — đèn đường
  20: rainbow(14, 26, 9) + fish(90, 70, P.water), // Thác Gam — cầu vồng hơi nước
  21: star(10, 14, 3.6, P.sun) + star(21, 23, 2.6, P.coral) + flower(84, 62, P.coral), // Nhà hát Cấp 2
  22: mushroom(11, 62, P.coral) + mushroom(19, 65, P.sun), // Rừng Hợp Âm
  23: lantern(12, 20, P.sun) + star(12, 20, 1.6, P.coral) + gull(26, 10, 0.8), // Cầu Vạch Phụ — Rước đèn
  24: buoy(8, 71) + gull(12, 12) + gull(24, 18, 0.8), // Biển Đổi Thế
  25: moon(14, 14) + sparkle(24, 22, 2.6, P.sun), // Thung lũng Vui Buồn
  26: kite(14, 14, P.coral), // Tháp Nốt Cao — diều
  27: owl(84, 62) + sparkle(12, 14, 3, P.violetLight), // Thư viện Lớn
  28: pennant(14, 64, P.coral) + pennant(84, 66, P.water), // Đỉnh Hai Tay — hai lá cờ
  29: bush(12, 64, P.grassDark) + bush(85, 66, P.grass) + sparkle(16, 14, 3, P.sun), // Cung điện Minuet — cây cắt tỉa
  30: butterfly(12, 16, P.violet) + butterfly(23, 26, P.sun), // Vườn Beethoven
  31: balloon(8, 22, P.coral) + balloon(15, 18, P.violet) + balloon(22, 24, P.mint), // Đại hòa nhạc
  32: sun(12, 22, 3.6) + fish(90, 70, P.coral), // Đồi Gam Sol — bình minh + cá lặn
  33: leaf(12, 14, P.orange, -30) + leaf(20, 24, P.sun, 20) + leaf(8, 30, P.coral, 50), // Hang Si Giáng — lá vàng rơi
  34: duck(8, 70) + flower(86, 62, P.sun), // Thung lũng Rê
  35: rainbow(16, 24, 10) + butterfly(84, 66, P.pink), // Cầu Vồng Hợp Âm
  36: bunting(2, 20, 28, 12) + balloon(86, 66, P.coral), // Lâu đài Alberti
  37: tent(14, 64, P.coral) + campfire(85, 66), // Làng Nghỉ Chân — lều + lửa trại
  38: lily(8, 70) + lily(89, 72) + sparkle(14, 16, 2.6, P.water), // Hồ Ngân Vang
  39: gull(10, 12) + gull(22, 18, 0.8) + gull(40, 8, 0.7), // Vịnh Thuyền Đưa — đàn hải âu
  40: sun(14, 20, 4.6) + cloud(28, 12), // Đồi Bình Minh
  41: moon(12, 14) + lantern(22, 26, P.violet), // Vũ hội La Thứ
  42: noteGlyph(10, 22, 2.8, P.indigo) + pennant(84, 66, P.sun), // Đỉnh Tập Dượt
  43: firework(12, 16, 7, P.coral) + firework(26, 10, 5, P.sun) + sparkle(20, 26, 2.4, P.pink), // Nhà hát Lớn — pháo hoa
};

/** Chuỗi SVG chi tiết riêng của tuần (rỗng nếu không có). */
export const accentSvg = (week: number): string => ACCENTS[week] ?? '';

/** Vẽ thêm chi tiết riêng lên mọi tranh đảo trong `root` (trừ 'locked' và bóng bí ẩn của đảo chưa mở — không lộ tranh). Gọi nhiều lần không vẽ trùng. */
export function decorateIslands(root: ParentNode): void {
  root.querySelectorAll<SVGSVGElement>('svg.island-art[data-week]').forEach((svg) => {
    if (svg.classList.contains('state-locked') || svg.closest('.mystery') || svg.querySelector('.isl-acc')) return;
    const art = accentSvg(Number(svg.getAttribute('data-week')));
    if (!art) return;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'isl-acc');
    g.setAttribute('stroke', 'rgba(61,52,102,.3)');
    g.setAttribute('stroke-width', '.8');
    g.innerHTML = art;
    // Nằm DƯỚI huy hiệu ngôi sao (nhóm cuối của tranh 'done') nếu có
    const badge = svg.classList.contains('state-done') ? svg.lastElementChild : null;
    svg.insertBefore(g, badge);
  });
}
