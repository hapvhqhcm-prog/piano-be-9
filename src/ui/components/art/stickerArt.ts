/**
 * Tranh STICKER cho Sổ sticker: mỗi sticker là một huy hiệu tròn "bế viền trắng" (như sticker dán thật),
 * nền màu theo loại, hình ở giữa vẽ bằng bộ cọ chung (svgKit) + tranh đảo (islandArt).
 * Chưa nhận: cùng hình nhưng thành BÓNG XÁM (silhouette) trên nền nét đứt — bé đoán được mình sắp nhận gì.
 */
import type { Sticker } from '../../../lessons/stickers';
import { islandIcon } from './islandArt';
import { P, beamedNotes, noteGlyph, sparkle, starPath, svgRoot, uid } from './svgKit';

const FONT = `font-family="'Baloo 2','Nunito',system-ui,sans-serif" font-weight="800"`;

/** Nền tròn theo loại: [màu sáng, màu đậm, viền]. */
const DISC: Record<Sticker['kind'], [string, string, string]> = {
  island: [P.sky, P.water, P.waterDark],
  medal: ['#fff3c4', P.sunLight, P.sun],
  songs: [P.violetLight, P.violet, P.indigo],
  streak: [P.coralLight, P.coral, '#e85a4a'],
  week: [P.mintLight, P.grass, P.grassDark],
  folk: [P.mintLight, P.mint, '#2fae84'],
  mic: [P.lavender, P.violetLight, P.violet],
  dynamics: [P.sunLight, P.sun, P.orange],
  challenge: [P.violetLight, P.indigo, P.indigoDark],
};

/** Huy hiệu số nhỏ (mốc 5 bài, 7 ngày…) ở góc dưới phải. */
function numberBadge(n: number, fill: string, ink: string): string {
  const w = n >= 10 ? 34 : 26;
  return `<g transform="translate(86 88)">
    <rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="${fill}" stroke="#fff" stroke-width="3.5"/>
    <text y="8.5" text-anchor="middle" font-size="21" ${FONT} fill="${ink}">${n}</text></g>`;
}

function flame(cx: number, cy: number, s: number): string {
  const k = (v: number) => (v * s).toFixed(1);
  return `<path d="M${cx} ${cy - 30 * s} C${cx + 6 * s} ${cy - 18 * s} ${cx + 22 * s} ${cy - 12 * s} ${cx + 20 * s} ${cy + 6 * s} C${cx + 18 * s} ${cy + 22 * s} ${cx - 18 * s} ${cy + 24 * s} ${cx - 20 * s} ${cy + 6 * s} C${cx - 22 * s} ${cy - 6 * s} ${cx - 12 * s} ${cy - 10 * s} ${cx - 10 * s} ${cy - 20 * s} C${cx - 4 * s} ${cy - 12 * s} ${cx} ${cy - 16 * s} ${cx} ${cy - 30 * s} Z" fill="${P.orange}" stroke="#e0662f" stroke-width="${k(1.6)}" stroke-linejoin="round"/>
    <path d="M${cx} ${cy - 10 * s} C${cx + 4 * s} ${cy - 2 * s} ${cx + 12 * s} ${cy + 2 * s} ${cx + 10 * s} ${cy + 10 * s} C${cx + 8 * s} ${cy + 18 * s} ${cx - 10 * s} ${cy + 18 * s} ${cx - 10 * s} ${cy + 9 * s} C${cx - 10 * s} ${cy + 2 * s} ${cx - 3 * s} ${cy} ${cx} ${cy - 10 * s} Z" fill="${P.sun}"/>
    <ellipse cx="${cx}" cy="${cy + 11 * s}" rx="${k(5)}" ry="${k(4)}" fill="#fff6c8"/>`;
}

/** Tờ lịch một tuần với 4 ô đã tích — "tuần chăm chỉ". */
function calendar(): string {
  const cells = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => {
      const x = 30 + (i % 4) * 16;
      const y = 56 + Math.floor(i / 4) * 18;
      const on = [0, 1, 3, 4].includes(i);
      return `<rect x="${x}" y="${y}" width="13" height="14" rx="3" fill="${on ? P.mint : '#eef2f7'}"/>` +
        (on ? `<path d="M${x + 3} ${y + 7.5} l3 3 l5 -6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : '');
    })
    .join('');
  return `<rect x="24" y="34" width="72" height="62" rx="9" fill="#fff" stroke="${P.grassDark}" stroke-width="2.5"/>
    <rect x="24" y="34" width="72" height="17" rx="9" fill="${P.coral}"/><rect x="24" y="44" width="72" height="7" fill="${P.coral}"/>
    <rect x="38" y="27" width="6" height="14" rx="3" fill="${P.ink}"/><rect x="76" y="27" width="6" height="14" rx="3" fill="${P.ink}"/>
    ${cells}`;
}

function medal(level: number): string {
  const ribbon = level === 1 ? P.mint : level === 2 ? P.violet : P.coral;
  const ribbonDark = level === 1 ? '#2fae84' : level === 2 ? P.indigo : '#e85a4a';
  return `
    <path d="M44 22 L56 56 L48 60 L34 26 Z" fill="${ribbon}" stroke="${ribbonDark}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M76 22 L64 56 L72 60 L86 26 Z" fill="${ribbonDark}" stroke="${ribbonDark}" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="60" cy="72" r="24" fill="${P.sun}" stroke="${P.orange}" stroke-width="2.5"/>
    <circle cx="60" cy="72" r="18" fill="${P.sunLight}" stroke="${P.orange}" stroke-width="1.2" stroke-opacity=".6"/>
    <path d="${starPath(60, 73, 14)}" fill="${P.sun}" stroke="${P.orange}" stroke-width="1.4" stroke-linejoin="round"/>
    <text x="60" y="80" text-anchor="middle" font-size="15" ${FONT} fill="#8a5a00">${level}</text>
    <ellipse cx="51" cy="62" rx="5" ry="3" fill="#fff" opacity=".6" transform="rotate(-30 51 62)"/>`;
}

function trophy(): string {
  return `
    <path d="M40 34 q-14 0 -12 14 q2 12 18 14" fill="none" stroke="${P.orange}" stroke-width="5" stroke-linecap="round"/>
    <path d="M80 34 q14 0 12 14 q-2 12 -18 14" fill="none" stroke="${P.orange}" stroke-width="5" stroke-linecap="round"/>
    <path d="M38 28 H82 V44 C82 60 72 70 60 70 C48 70 38 60 38 44 Z" fill="${P.sun}" stroke="${P.orange}" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="55" y="68" width="10" height="12" fill="${P.sun}" stroke="${P.orange}" stroke-width="2"/>
    <rect x="44" y="80" width="32" height="12" rx="3" fill="${P.woodDark}" stroke="${P.ink}" stroke-opacity=".3" stroke-width="1.4"/>
    <path d="${starPath(60, 46, 10)}" fill="#fff" opacity=".9"/>
    <path d="M44 34 q0 14 6 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
}

/** (+ 2026-10-07) Màu cúp tuần theo thử thách: [thân cúp, viền]. */
const CUP: Record<string, [string, string]> = {
  faster: [P.sun, P.orange],
  perfect: ['#cfeaff', P.waterDark],
  days4: [P.mintLight, '#2fae84'],
  review3: ['#e6ddff', P.violet],
  vn: [P.coralLight, '#e85a4a'],
  ear: ['#ffd3e2', '#e0668f'],
  record: [P.sunLight, P.orange],
};

/** Hình nhỏ trên thân cúp — mỗi thử thách một hình (tâm cx, cy). */
function cupGlyph(id: string, cx: number, cy: number, ink: string): string {
  switch (id) {
    case 'faster': // mũi tên tốc độ + vệt gió
      return `<path d="M${cx - 9} ${cy - 7} L${cx + 1} ${cy} L${cx - 9} ${cy + 7} M${cx - 1} ${cy - 7} L${cx + 9} ${cy} L${cx - 1} ${cy + 7}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'perfect': // hồng tâm
      return `<circle cx="${cx}" cy="${cy}" r="9" fill="#fff" stroke="${ink}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="${P.coral}"/>`;
    case 'days4': // 4 ô lịch đã tích
      return [0, 1, 2, 3].map((i) => `<rect x="${cx - 9 + (i % 2) * 10}" y="${cy - 9 + Math.floor(i / 2) * 10}" width="8" height="8" rx="2" fill="${P.mint}" stroke="${ink}" stroke-width="1.2"/>`).join('');
    case 'review3': // mũi tên vòng
      return `<path d="M${cx + 8} ${cy - 2} A8 8 0 1 1 ${cx + 2} ${cy - 8}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M${cx - 1} ${cy - 12} L${cx + 5} ${cy - 8} L${cx} ${cy - 3}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'vn': // ngôi sao vàng trên nền đỏ
      return `<circle cx="${cx}" cy="${cy}" r="10" fill="#e8443a" stroke="#fff" stroke-width="1.6"/><path d="${starPath(cx, cy + 0.5, 7)}" fill="${P.sun}"/>`;
    case 'ear': // sóng âm
      return `<circle cx="${cx - 6}" cy="${cy}" r="3" fill="${ink}"/><path d="M${cx - 1} ${cy - 6} q5 6 0 12 M${cx + 4} ${cy - 10} q8 10 0 20" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'record': // tia chớp
      return `<path d="M${cx + 2} ${cy - 11} L${cx - 6} ${cy + 1} L${cx} ${cy + 1} L${cx - 3} ${cy + 11} L${cx + 7} ${cy - 2} L${cx + 1} ${cy - 2} Z" fill="#fff" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
    default:
      return `<path d="${starPath(cx, cy, 9)}" fill="#fff" opacity=".9"/>`;
  }
}

/** Cúp tuần: chiếc cúp màu theo thử thách + hình thử thách trên thân cúp + lấp lánh. */
function weekCup(id: string): string {
  const [body, edge] = CUP[id] ?? CUP.faster;
  return `
    <path d="M40 30 q-15 0 -13 15 q2 13 19 15" fill="none" stroke="${edge}" stroke-width="5" stroke-linecap="round"/>
    <path d="M80 30 q15 0 13 15 q-2 13 -19 15" fill="none" stroke="${edge}" stroke-width="5" stroke-linecap="round"/>
    <path d="M37 24 H83 V42 C83 59 73 70 60 70 C47 70 37 59 37 42 Z" fill="${body}" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="55" y="68" width="10" height="11" fill="${body}" stroke="${edge}" stroke-width="2"/>
    <rect x="42" y="79" width="36" height="13" rx="3.5" fill="${P.woodDark}" stroke="${P.ink}" stroke-opacity=".3" stroke-width="1.4"/>
    <rect x="50" y="83" width="20" height="5" rx="2" fill="${P.sunLight}" opacity=".85"/>
    ${cupGlyph(id, 60, 44, P.ink)}
    <path d="M42 30 q0 14 5 21" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    ${sparkle(96, 26, 7, P.sun)}${sparkle(24, 70, 5, '#fff')}`;
}

/** Nón lá + nốt nhạc (dân ca). */
function nonLa(): string {
  return `
    <path d="M60 26 L96 72 Q60 84 24 72 Z" fill="${P.sandDark}" stroke="${P.woodDark}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M60 26 L96 72 Q78 78 60 79 Z" fill="${P.sand}" opacity=".7"/>
    <path d="M60 26 L42 76 M60 26 L52 79 M60 26 L68 79 M60 26 L78 76" stroke="${P.woodDark}" stroke-width="1" stroke-opacity=".45"/>
    <path d="M30 66 Q60 76 90 66" fill="none" stroke="${P.coral}" stroke-width="3" stroke-linecap="round"/>
    ${noteGlyph(84, 44, 5, P.indigo)}
    ${sparkle(30, 40, 6, P.sun)}`;
}

function mic(): string {
  return `
    <rect x="48" y="20" width="24" height="42" rx="12" fill="${P.indigo}" stroke="${P.ink}" stroke-opacity=".35" stroke-width="1.6"/>
    <path d="M52 32 H68 M52 40 H68 M52 48 H68" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 46 q0 22 20 22 q20 0 20 -22" fill="none" stroke="${P.ink}" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/>
    <path d="M60 68 V80 M50 82 H70" stroke="${P.ink}" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 30 q-6 10 0 20 M92 30 q6 10 0 20" fill="none" stroke="${P.violet}" stroke-width="3" stroke-linecap="round"/>
    ${sparkle(92, 18, 7, P.sun)}`;
}

function loudSoft(): string {
  return `
    <text x="44" y="74" text-anchor="middle" font-size="58" font-style="italic" font-family="Georgia,'Times New Roman',serif" font-weight="700" fill="${P.ink}">f</text>
    <text x="80" y="76" text-anchor="middle" font-size="30" font-style="italic" font-family="Georgia,'Times New Roman',serif" font-weight="700" fill="${P.indigo}">p</text>
    <path d="M30 88 L58 82 M30 88 L58 94" stroke="${P.coral}" stroke-width="3" stroke-linecap="round"/>`;
}

function stacLeg(): string {
  return `
    ${noteGlyph(34, 70, 6, P.ink)}
    <circle cx="33" cy="82" r="3" fill="${P.coral}"/>
    ${beamedNotes(64, 66, 6, P.indigo)}
    <path d="M60 80 Q72 92 86 76" fill="none" stroke="${P.coral}" stroke-width="3" stroke-linecap="round"/>`;
}

/** Hình ở giữa sticker (toạ độ trong khung 120×120, tâm 60 60). */
function emblem(s: Sticker, earned: boolean): string {
  switch (s.kind) {
    case 'island': {
      const isl = islandIcon(s.week ?? 1, earned ? 'done' : 'current');
      return `<svg x="10" y="18" width="100" height="84" viewBox="0 0 96 80">${isl.innerHTML}</svg>`;
    }
    case 'medal':
      return s.level === 3 ? trophy() : medal(s.level ?? 1);
    case 'songs':
      return `${beamedNotes(34, 76, 9, '#fff')}${sparkle(30, 32, 7, P.sun)}`;
    case 'streak':
      return flame(56, 66, 1.25);
    case 'week':
      return calendar();
    case 'folk':
      return nonLa();
    case 'mic':
      return mic();
    case 'dynamics':
      return s.mode === 'stac-leg' ? stacLeg() : loudSoft();
    case 'challenge':
      // phóng to cúp cho đầy huy hiệu (tâm 60 60)
      return `<g transform="translate(60 62) scale(1.16) translate(-60 -58)">${weekCup(s.challenge ?? 'faster')}</g>`;
  }
}

/** Huy hiệu số (mốc bài hát / chuỗi ngày) — vẽ NGOÀI lớp bóng xám để sticker còn khóa vẫn đọc được mốc. */
function badge(s: Sticker, earned: boolean): string {
  if (!s.n || (s.kind === 'songs' && s.n === 1) || (s.kind !== 'songs' && s.kind !== 'streak' && s.kind !== 'week')) return '';
  if (!earned) return numberBadge(s.n, '#e4e0f4', '#8c84b8');
  return s.kind === 'songs' ? numberBadge(s.n, P.sun, '#8a5a00') : numberBadge(s.n, '#fff', '#c2412b');
}

/** SVG sticker 120×120 (đặt kích thước bằng CSS). */
export function stickerArt(s: Sticker, earned = s.earned): SVGSVGElement {
  const [c1, c2, edge] = DISC[s.kind];
  const g = uid('stk-g');
  const sil = uid('stk-sil');
  const inner = earned
    ? `<defs><radialGradient id="${g}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
       <ellipse cx="60" cy="114" rx="38" ry="4.5" fill="${P.ink}" opacity=".12"/>
       <circle cx="60" cy="60" r="55" fill="#fff" stroke="${P.ink}" stroke-opacity=".12" stroke-width="1.5"/>
       <circle cx="60" cy="60" r="47" fill="url(#${g})" stroke="${edge}" stroke-width="2"/>
       <path d="M24 44 A40 40 0 0 1 52 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>
       <g stroke-linejoin="round">${emblem(s, true)}</g>${badge(s, true)}`
    : `<defs><filter id="${sil}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.79  0 0 0 0 0.77  0 0 0 0 0.9  0 0 0 1 0"/></filter></defs>
       <circle cx="60" cy="60" r="53" fill="#f6f4fd" stroke="#d6d0ee" stroke-width="3" stroke-dasharray="7 6"/>
       <g filter="url(#${sil})">${emblem(s, false)}</g>${badge(s, false)}`;
  const svg = svgRoot('0 0 120 120', `sticker-art ${earned ? 'earned' : 'locked'} kind-${s.kind}`, inner);
  return svg;
}
