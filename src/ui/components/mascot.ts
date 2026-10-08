/**
 * "Bé Nốt" — nhân vật đồng hành: một nốt nhạc móc đơn tròn trĩnh biết cười, vẫy tay, cổ vũ.
 * Vẽ bằng SVG (không cần ảnh ngoài). Màu tô bằng thuộc tính SVG (lớp `mn-*`) nên không phụ thuộc CSS;
 * riêng tay vẫy giữ lớp `wave-arm` (hiệu ứng vẫy trong theme.css, tâm xoay 28px 96px).
 */
import { P, sparkle, starPath, uid } from './art/svgKit';

export type Mood = 'happy' | 'cheer' | 'think' | 'wave' | 'love';

const SVG = 'http://www.w3.org/2000/svg';
const INK = '#2a2350';
const BODY_DARK = '#4338b8';

const heart = (x: number, y: number, s: number, c: string) =>
  `<path d="M${x} ${y + 3 * s} c${-5 * s} ${-3.4 * s} ${-6 * s} ${-7 * s} ${-3.2 * s} ${-8.4 * s} c${1.5 * s} ${-0.8 * s} ${2.8 * s} 0 ${3.2 * s} ${1.2 * s} c${0.4 * s} ${-1.2 * s} ${1.7 * s} ${-2 * s} ${3.2 * s} ${-1.2 * s} c${2.8 * s} ${1.4 * s} ${1.8 * s} ${5 * s} ${-3.2 * s} ${8.4 * s} Z" fill="${c}"/>`;

/** Một cánh tay (nét cong) + bàn tay tròn ở đầu. */
const arm = (d: string, hx: number, hy: number, cls = '') =>
  `<g${cls ? ` class="${cls}"` : ''}><path d="${d}" fill="none" stroke="${BODY_DARK}" stroke-width="6.5" stroke-linecap="round"/>` +
  `<circle cx="${hx}" cy="${hy}" r="6" fill="#c8bcff" stroke="${BODY_DARK}" stroke-width="2"/></g>`;

/**
 * (+ 2026-10-08) 🎁 Trang phục Bé Nốt (quà mở khóa theo đảo — lessons/unlocks.ts). Mã lạ / null = không mặc gì.
 * Vẽ ĐÈ lên trên cùng (sau mặt, tay) trong cùng khung 120×140.
 */
export const OUTFITS: Readonly<Record<string, string>> = {
  cap:
    `<path d="M31 75 q1 -22 25 -22 q22 0 25 19 Z" fill="${P.coral}" stroke="${INK}" stroke-opacity=".4" stroke-width="1.6"/>` +
    `<path d="M28 76 q26 -9 56 -4 q-2 6 -8 7 q-22 -3 -46 3 Z" fill="#e85a4a" stroke="${INK}" stroke-opacity=".4" stroke-width="1.4"/>` +
    `<circle cx="56" cy="53" r="3" fill="#e85a4a"/><path d="M44 60 q10 -5 22 -1" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>`,
  headphones:
    `<path d="M24 94 Q22 56 56 56 Q88 56 91 90" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="15" y="86" width="14" height="22" rx="7" fill="${P.coral}" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="86" y="81" width="14" height="22" rx="7" fill="${P.coral}" stroke="${INK}" stroke-width="2"/>`,
  bowtie:
    `<path d="M44 111 L56 117 L44 123 Z M68 111 L56 117 L68 123 Z" fill="#e8443a" stroke="${INK}" stroke-opacity=".5" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<circle cx="56" cy="117" r="3.2" fill="#c2324d"/>`,
  sunglasses:
    `<rect x="36" y="81" width="19" height="13" rx="5" fill="#1d1838"/><rect x="58" y="80" width="19" height="13" rx="5" fill="#1d1838"/>` +
    `<path d="M55 86 h3 M36 85 l-8 -3 M77 84 l8 -4" stroke="#1d1838" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M40 84 l5 -1 M62 83 l5 -1" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>`,
  wizard:
    `<path d="M33 72 L52 18 L78 70 Z" fill="${P.violet}" stroke="${INK}" stroke-opacity=".5" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<ellipse cx="55" cy="72" rx="28" ry="6" fill="${P.indigo}" stroke="${INK}" stroke-opacity=".5" stroke-width="1.6"/>` +
    `<path d="${starPath(56, 50, 5)}" fill="${P.sun}"/><path d="${starPath(47, 62, 3)}" fill="${P.sun}"/>`,
  mask:
    `<path fill-rule="evenodd" d="M27 88 Q56 72 88 82 L88 95 Q56 86 27 101 Z M40 89 a6 5.5 0 1 0 12 0 a6 5.5 0 1 0 -12 0 Z M61 88 a6 5.5 0 1 0 12 0 a6 5.5 0 1 0 -12 0 Z" fill="#e8443a" stroke="${INK}" stroke-opacity=".45" stroke-width="1.4"/>`,
  crown:
    `<path d="M33 72 L36 49 L46 61 L56 44 L66 61 L76 49 L79 72 Z" fill="${P.sun}" stroke="#c48a00" stroke-width="2" stroke-linejoin="round"/>` +
    `<circle cx="56" cy="64" r="3.4" fill="#e8443a"/><circle cx="43" cy="66" r="2.4" fill="${P.mint}"/><circle cx="69" cy="66" r="2.4" fill="${P.water}"/>`,
};

let currentOutfit: string | null = null;
/** (+ 2026-10-08) Đặt trang phục cho MỌI Bé Nốt vẽ từ nay (màn chính / sổ sticker gọi theo settings.cosmetics). */
export function setMascotOutfit(outfit: string | null): void {
  currentOutfit = outfit && OUTFITS[outfit] ? outfit : null;
}
export const mascotOutfit = (): string | null => currentOutfit;

export function mascot(mood: Mood = 'happy', size = 120, outfit: string | null = currentOutfit): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 120 140');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String((size * 140) / 120));
  svg.setAttribute('class', `mascot mood-${mood}`);
  svg.setAttribute('aria-hidden', 'true');
  const g = uid('mn-body');
  const gs = uid('mn-stem');

  const mouth =
    mood === 'think'
      ? `<path d="M50 105 q5 -3 11 0.5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
      : mood === 'cheer' || mood === 'love' || mood === 'wave'
        ? `<path d="M44 100 q11 1 22 -2 q-2 13 -11 13 q-9 0 -11 -11 Z" fill="#c2324d" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
          `<path d="M49 108 q5 -4 10 -0.5 q-2 3 -5 3 q-3 0 -5 -2.5 Z" fill="#ff8fa3"/>`
        : `<path d="M45 100 q10 9 20 -1" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`;

  const openEye = (x: number, y: number, look = 0) =>
    `<ellipse cx="${x}" cy="${y}" rx="5" ry="6.2" fill="${INK}"/>` +
    `<circle cx="${x + 1.6}" cy="${y - 2.4 + look}" r="2" fill="#fff"/><circle cx="${x - 1.6}" cy="${y + 2}" r="1" fill="#fff"/>`;
  const eyes =
    mood === 'love'
      ? heart(46, 86, 0.95, '#ff4f7e') + heart(67, 86, 0.95, '#ff4f7e')
      : mood === 'cheer'
        ? `<path d="M40 90 q6 -8 12 0 M61 89 q6 -8 12 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`
        : mood === 'think'
          ? openEye(46, 88, -1.4) + openEye(67, 87, -1.4) +
            `<path d="M40 77 q6 -4 11 -1 M62 74 q6 -3 11 1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
          : openEye(46, 89) + openEye(67, 88);

  const arms =
    mood === 'wave' || mood === 'cheer'
      ? arm('M28 96 q-12 -8 -10 -24', 18, 70, 'wave-arm') +
        (mood === 'cheer' ? arm('M86 96 q10 -6 12 -22', 98, 72) : arm('M86 100 q12 4 15 14', 101, 115))
      : mood === 'think'
        ? arm('M28 102 q-10 6 -8 16', 20, 119) + arm('M84 104 q-4 8 -16 9', 66, 113)
        : arm('M27 102 q-12 5 -14 15', 13, 118) + arm('M86 101 q12 5 14 15', 100, 117);

  const extras =
    mood === 'cheer'
      ? sparkle(12, 46, 6, P.sun) + sparkle(106, 52, 5, P.coral) + `<path d="${starPath(20, 24, 5)}" fill="${P.sun}"/>`
      : mood === 'love'
        ? heart(102, 50, 0.9, P.pink) + heart(16, 56, 0.7, '#ff4f7e')
        : mood === 'think'
          ? `<circle cx="24" cy="66" r="3" fill="${P.violetLight}"/><circle cx="17" cy="54" r="4.4" fill="${P.violetLight}"/><text x="6" y="42" font-size="20" font-weight="800" fill="${P.violet}" font-family="system-ui,sans-serif">?</text>`
          : mood === 'wave'
            ? sparkle(104, 40, 5, P.sun)
            : '';

  svg.innerHTML = `
    <defs>
      <radialGradient id="${g}" cx="0.36" cy="0.32" r="0.85">
        <stop offset="0" stop-color="#a99bff"/><stop offset=".55" stop-color="#7563f2"/><stop offset="1" stop-color="#4f42cf"/>
      </radialGradient>
      <linearGradient id="${gs}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6c5cf0"/><stop offset="1" stop-color="${BODY_DARK}"/>
      </linearGradient>
    </defs>
    <ellipse cx="58" cy="133" rx="30" ry="4.5" fill="${INK}" opacity=".12"/>
    <!-- chân -->
    <ellipse cx="44" cy="127" rx="9" ry="5.2" fill="${P.coral}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5"/>
    <ellipse cx="70" cy="125" rx="9" ry="5.2" fill="${P.coral}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5"/>
    <!-- thân nốt + cờ -->
    <path d="M80 92 L80 20" stroke="#5546d8" stroke-width="7" stroke-linecap="round"/>
    <path d="M81 17 q22 4 26 26 q2 9 -4 16 q2 -14 -9 -21 q-6 -4 -13 -4 Z" fill="url(#${gs})"/>
    <path d="M86 21 q12 3 16 13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="57" cy="96" rx="35" ry="29" transform="rotate(-12 57 96)" fill="url(#${g})" stroke="${INK}" stroke-opacity=".25" stroke-width="1.6"/>
    <ellipse cx="42" cy="80" rx="11" ry="5.5" fill="#fff" opacity=".4" transform="rotate(-24 42 80)"/>
    <circle cx="33" cy="88" r="2.2" fill="#fff" opacity=".5"/>
    ${eyes}
    <ellipse cx="36" cy="101" rx="6" ry="4" fill="#ff9fb6" opacity=".75"/><ellipse cx="78" cy="98" rx="6" ry="4" fill="#ff9fb6" opacity=".75"/>
    ${mouth}
    ${arms}
    ${extras}
    ${outfit && OUTFITS[outfit] ? `<g class="mascot-outfit outfit-${outfit}">${OUTFITS[outfit]}</g>` : ''}`;
  return svg;
}
