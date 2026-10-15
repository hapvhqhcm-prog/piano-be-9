/**
 * Tranh minh họa tư thế ngồi đàn (nhìn ngang): bé ngồi trên ghế đàn trước cây đàn piano đứng
 * (thấy phím, giá nhạc, iPad trên giá). Phần cần chú ý (lưng / chân / tay) có viền xanh nhấp nháy nhẹ
 * và huy hiệu ✓ — gần như không cần chữ.
 *
 * (+ 2026-10-15) focus 'sit' = tranh ĐO TƯ THẾ NGỒI: khuỷu tay hơi trước người, cẳng tay ngang phím (kê gối nếu ghế thấp),
 * chân đặt vững trên hộp kê chân, lưng thẳng hơi nghiêng tới. `variant: 'bad'` = ngồi xa, lưng gù, chân lơ lửng.
 * Lõi là chuỗi SVG (postureMarkup) — dùng lại trong thẻ "Tư thế tay" (handTechniqueArt.ts) và test được không cần DOM.
 *
 * Màu tô bằng thuộc tính SVG + <style> riêng (lớp `pz-*`) nên không phụ thuộc CSS chung.
 */
import { P, checkBadge, noteGlyph, uid } from './art/svgKit';

export type PosturePart = 'back' | 'feet' | 'hands' | 'all' | 'sit';

const SVG = 'http://www.w3.org/2000/svg';
const OL = 'rgba(61,52,102,.38)'; // viền mảnh
const BAD = '#e8574a';
export const POSTURE_VIEWBOX = '84 0 280 244';

/** Nét dày có viền: vẽ nét viền rộng hơn bên dưới rồi nét màu lên trên. */
const limb = (d: string, color: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${OL}" stroke-width="${w + 2.6}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Viền phát sáng xanh quanh bộ phận đang nhắc. */
const glow = (d: string, w: number) =>
  `<path class="pz-glow" d="${d}" fill="none" stroke="${P.good}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>`;

/** Nhãn chữ nhỏ có nền trắng (đọc được trên mọi nền). */
const label = (x: number, y: number, text: string, color: string) => {
  const w = text.length * 5.6 + 12;
  return `<g class="pz-pop"><rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="14" rx="7" fill="#fff" stroke="${color}" stroke-width="1.3"/><text x="${x}" y="${y + 1.6}" font-size="10" font-weight="800" font-family="Baloo 2, Nunito, sans-serif" fill="${color}" text-anchor="middle">${text}</text></g>`;
};

const crossBadge = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><circle r="12" fill="${BAD}" stroke="#fff" stroke-width="3"/><path d="M-4.4 -4.4 L4.4 4.4 M4.4 -4.4 L-4.4 4.4" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></g>`;

export interface PostureOpts {
  /** 'bad' chỉ dùng với focus 'sit' (tranh so sánh "Chưa đúng") */
  variant?: 'good' | 'bad';
}

/** Phần trong của tranh (không có thẻ <svg>), toạ độ theo POSTURE_VIEWBOX. */
export function postureMarkup(focus: PosturePart, opts: PostureOpts = {}): string {
  const sit = focus === 'sit';
  const bad = sit && opts.variant === 'bad';
  const on = (p: PosturePart) => focus === p || focus === 'all';
  const wood = uid('pz-wood');
  const shirt = uid('pz-shirt');
  const wall = uid('pz-wall');
  // Ghế 'sit' (đúng): ghế hạ 8 + gối kê; 'bad': ghế lùi xa 16 (bé phải với tay)
  const benchY = sit && !bad ? 8 : 0;
  const shiftX = bad ? -16 : 0;

  // Bàn phím nhìn hơi chếch từ trên xuống (để thấy phím trắng/đen)
  let keyLines = '';
  for (let i = 1; i < 8; i++) {
    const x = 222 + i * 5.5;
    keyLines += `M${x} 147 L${x + 4.6} 139 `;
  }
  const blacks = [1, 2, 4, 5, 6]
    .map((i) => {
      const x = 222 + i * 5.5 + 2.9;
      return `<path d="M${x - 1.6} 142.6 L${x + 1.6} 142.6 L${x + 3.6} 139 L${x + 0.4} 139 Z" fill="${P.night}"/>`;
    })
    .join('');

  // Tay: vai → khuỷu (hơi trước người) → cổ tay ngang phím. 'bad': tay duỗi thẳng vì ngồi xa.
  const arm = bad ? 'M142 108 L178 128 L224 138' : 'M158 106 L174 134 L224 138';
  const upper = bad ? 'M142 108 L152 114' : 'M158 106 L165 121';
  // Chân: 'sit' đúng → bàn chân trên hộp kê; 'bad' → bàn chân lơ lửng
  const shin = sit ? (bad ? 'M197 160 L202 196' : 'M197 160 L199 205') : 'M197 160 L199 216';
  const footShift = sit ? (bad ? 'translate(4 -24)' : 'translate(0 -11)') : '';
  const torso = bad
    ? 'M137 158 Q126 124 144 101 Q151 94 160 96 Q173 100 172 116 L170 158 Z'
    : 'M137 158 Q131 130 137 106 Q142 94 157 94 Q172 96 172 114 L170 158 Z';
  const head = bad ? 'translate(5 7)' : '';

  return `
    <style>
      .pz-glow { animation: pz-pulse 1.3s ease-in-out infinite; }
      .pz-pop { animation: pz-pop .5s cubic-bezier(.3,1.6,.5,1) both; transform-box: fill-box; transform-origin: center; }
      @keyframes pz-pulse { 50% { opacity: .12; } }
      @keyframes pz-pop { from { transform: scale(.2); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .pz-glow, .pz-pop { animation: none; } }
    </style>
    <defs>
      <linearGradient id="${wood}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#a8673f"/><stop offset="1" stop-color="#7d4a2c"/>
      </linearGradient>
      <linearGradient id="${shirt}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.violet}"/><stop offset="1" stop-color="${P.indigo}"/>
      </linearGradient>
      <linearGradient id="${wall}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${bad ? '#fff1ef' : sit ? '#ecfaf3' : '#f3eeff'}"/><stop offset="1" stop-color="#fff6ea"/>
      </linearGradient>
    </defs>

    <!-- phông nền + sàn gỗ + thảm -->
    <rect x="88" y="4" width="272" height="236" rx="26" fill="url(#${wall})"/>
    <path d="M88 228 H360 V214 Q360 240 334 240 H114 Q88 240 88 214 Z" fill="#f1d6ae"/>
    <path d="M88 228 H360" stroke="#e2bf8f" stroke-width="2"/>
    <ellipse cx="160" cy="230" rx="66" ry="5" fill="${P.lavender}" stroke="${OL}" stroke-width="1"/>

    <!-- đàn piano đứng -->
    <g stroke="${OL}" stroke-width="1.3" stroke-linejoin="round">
      <rect x="262" y="44" width="80" height="186" rx="6" fill="url(#${wood})"/>
      <rect x="268" y="56" width="66" height="70" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="268" y="176" width="66" height="44" rx="6" fill="#ffffff" fill-opacity=".1"/>
      <rect x="254" y="35" width="96" height="12" rx="5" fill="#6d3f25"/>
      <rect x="222" y="146" width="44" height="21" rx="3" fill="#8a5332"/>
      <path d="M222 147 L266 147 L270.6 139 L226.6 139 Z" fill="#fff"/>
      <path d="${keyLines}" stroke="#b9b2d8" stroke-width=".8"/>
      ${blacks}
      <rect x="229" y="167" width="8" height="61" rx="3" fill="#7d4a2c"/>
      <rect x="226" y="224" width="14" height="6" rx="2" fill="${P.sun}"/>
      <rect x="250" y="222" width="12" height="4" rx="2" fill="${P.sun}"/>
      <!-- giá nhạc + iPad -->
      <rect x="244" y="131" width="20" height="5" rx="2" fill="#6d3f25"/>
      <g transform="rotate(10 256 134)">
        <rect x="231" y="86" width="34" height="48" rx="6" fill="${P.night}"/>
        <rect x="234.5" y="90" width="27" height="40" rx="3" fill="#eaf6ff" stroke="none"/>
        <path d="M237 102 H259 M237 106 H259 M237 110 H259 M237 114 H259 M237 118 H259" stroke="#9fb4d8" stroke-width=".8"/>
        ${noteGlyph(244, 114, 2.6, P.coral)}${noteGlyph(253, 108, 2.6, P.indigo)}
      </g>
      <!-- máy đếm nhịp trên nóc đàn -->
      <path d="M292 35 L299 13 H305 L312 35 Z" fill="${P.mint}"/>
      <path d="M302 31 L308 16" stroke="${P.ink}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="306" cy="20" r="2" fill="${P.sun}"/>
    </g>

    ${
      sit && !bad
        ? `<!-- hộp kê chân -->
    <g stroke="${OL}" stroke-width="1.3"><rect x="180" y="214" width="50" height="14" rx="3" fill="${P.wood}"/><path d="M184 218 H226" stroke="${P.woodDark}" stroke-width="1.2"/></g>`
        : ''
    }

    <g${shiftX ? ` transform="translate(${shiftX} 0)"` : ''}>
    <!-- ghế đàn -->
    <g stroke="${OL}" stroke-width="1.3">
      <rect x="110" y="${170 + benchY}" width="7" height="${58 - benchY}" rx="3" fill="#8a5332"/>
      <rect x="167" y="${170 + benchY}" width="7" height="${58 - benchY}" rx="3" fill="#8a5332"/>
      <rect x="104" y="${166 + benchY}" width="76" height="7" rx="3" fill="#a8673f"/>
      <rect x="100" y="${156 + benchY}" width="84" height="12" rx="6" fill="${P.mint}"/>
      ${sit && !bad ? `<rect x="106" y="153" width="70" height="12" rx="6" fill="${P.sunLight}"/><path d="M114 159 H168" stroke="${P.sun}" stroke-width="1.4" stroke-dasharray="3 3"/>` : ''}
    </g>

    <!-- vầng sáng nhắc (dưới hình bé) -->
    ${on('back') ? glow('M134 156 Q130 128 136 102 Q140 92 150 90', 14) : ''}
    ${on('feet') ? glow('M188 225 H222', 16) + glow('M196 168 L198 216', 22) : ''}
    ${on('hands') ? glow('M170 138 L226 138 Q238 128 248 142', 20) : ''}

    <!-- bé: chân -->
    ${limb('M146 150 L196 156', '#3f3a9e', 21)}
    ${limb(shin, '#3f3a9e', 16)}
    <g stroke="${OL}" stroke-width="1.3"${footShift ? ` transform="${footShift}"` : ''}>
      <path d="M187 229 V221 Q187 214 195 214 H201 Q207 214 212 218 L219 222 Q224 225 224 229 Z" fill="${P.coral}"/>
      <rect x="186" y="226.5" width="39" height="3.5" rx="1.7" fill="#fff"/>
    </g>

    <!-- bé: thân (áo) -->
    <path d="${torso}" fill="url(#${shirt})" stroke="${OL}" stroke-width="1.4"/>
    <path d="M147 132 l2.6 5.2 5.8 .8 -4.2 4 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.2 -4 5.8 -.8 Z" fill="${P.sun}" transform="translate(6 -6)"/>

    <!-- bé: đầu -->
    <g${head ? ` transform="${head}"` : ''}>
    <rect x="153" y="84" width="12" height="14" rx="5" fill="${P.skin}" stroke="${OL}" stroke-width="1.2"/>
    <circle cx="163" cy="64" r="25" fill="${P.skin}" stroke="${OL}" stroke-width="1.4"/>
    <path d="M187 61 q5 3 1 8" fill="${P.skin}" stroke="${OL}" stroke-width="1.4"/>
    <path d="M139 70 Q133 40 160 38 Q184 37 189 56 Q178 50 168 53 Q161 47 152 53 Q147 59 148 72 Z" fill="${P.hair}"/>
    <path d="M160 39 q4 -9 12 -7 q-6 2 -6 7" fill="${P.hair}"/>
    <circle cx="150" cy="70" r="5" fill="${P.skin}" stroke="${OL}" stroke-width="1.2"/>
    <ellipse cx="176" cy="63" rx="3.1" ry="4" fill="${P.night}"/><circle cx="177.2" cy="61.6" r="1.1" fill="#fff"/>
    <path d="M171 54.5 q5 -3 9 0" fill="none" stroke="${P.hair}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="174" cy="73" rx="5" ry="3.2" fill="#ff9fb6" opacity=".7"/>
    <path d="${bad ? 'M176 79 q5 -2.5 9 0' : 'M176 78 q5 3.5 9 -1'}" fill="none" stroke="#c2324d" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    </g>

    <!-- bé: tay (vai → khuỷu → cổ tay ngang phím) -->
    ${limb(arm, P.skin, 11)}
    ${limb(upper, P.violet, 16)}
    <g stroke="${OL}" stroke-width="1.2">
      <path d="M222 138 Q226 129 236 129 Q245 130 247 140 L246 145 Q243 141 240 141 Q236 136 230 138 Z" fill="${P.skin}"/>
      <path d="M240 134 Q247 136 246.5 144" fill="none" stroke="${P.skinDark}" stroke-width="1.4" stroke-linecap="round"/>
    </g>

    ${sit ? (bad ? sitBad() : sitGood()) : ''}

    <!-- chú thích ✓ -->
    ${
      on('back')
        ? `<g class="pz-pop"><path d="M122 104 V156" stroke="${P.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${checkBadge(122, 92)}</g>`
        : ''
    }
    ${
      on('feet')
        ? `<g class="pz-pop"><path d="M184 234 H228" stroke="${P.good}" stroke-width="3.4" stroke-linecap="round"/>${checkBadge(172, 212)}</g>`
        : ''
    }
    ${
      on('hands')
        ? `<g class="pz-pop"><path d="M172 152 H222" stroke="${P.good}" stroke-width="3.4" stroke-dasharray="6 5" stroke-linecap="round"/>${checkBadge(198, 120)}
        <!-- khung phóng to: bàn tay khum như ôm quả bóng -->
        <circle cx="228" cy="96" r="2.4" fill="#fff" stroke="${P.good}" stroke-width="1.5"/>
        <circle cx="224" cy="83" r="3.4" fill="#fff" stroke="${P.good}" stroke-width="1.5"/>
        <circle cx="218" cy="38" r="31" fill="#fff" stroke="${P.good}" stroke-width="3"/>
        <circle cx="219" cy="47" r="14" fill="${P.sun}" stroke="${OL}" stroke-width="1.2"/>
        <path d="M207 41 Q219 35 231 42" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/>
        ${limb('M210 37 Q213 42 210.5 47', P.skin, 5.5)}
        <path d="M190 33 Q203 25 216 23 Q233 21 240 33 Q244 42 240 55 Q237 59 233.5 55.5 Q235 45 230 39 Q224 34 215 36 Q204 39 192 47 Z" fill="${P.skin}" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M228 27 Q236 33 236.5 45 M222 25 Q230 30 231.5 40" fill="none" stroke="${P.skinDark}" stroke-width="1.3" stroke-linecap="round"/>
        <ellipse cx="237" cy="55" rx="2.6" ry="1.8" fill="#fff" opacity=".7"/></g>`
        : ''
    }`;
}

/** Các vạch đo của tư thế đúng: lưng thẳng hơi nghiêng tới · khuỷu trước người · cẳng tay ngang phím · gối · kê chân. */
function sitGood(): string {
  const g = P.good;
  return `<g class="pz-measure">
    <path d="M128 158 L140 100" stroke="${g}" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>
    <path d="M128 158 V100" stroke="${g}" stroke-width="1.4" stroke-dasharray="2 4" opacity=".7"/>
    <path d="M172 112 V150" stroke="${P.indigo}" stroke-width="1.6" stroke-dasharray="3 3"/>
    <path d="M172 146 H176" stroke="${P.indigo}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M168 139 H272" stroke="${P.orange}" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round"/>
    ${label(124, 92, 'lưng thẳng', g)}
    ${label(306, 139, 'ngang phím', P.orange)}
    ${label(186, 108, 'khuỷu trước', P.indigo)}
    ${label(124, 146, 'gối', '#c98a12')}
    ${label(206, 238, 'kê chân', P.woodDark)}
    ${checkBadge(342, 20, 11)}
  </g>`;
}

/** Tư thế chưa đúng: ngồi xa (tay duỗi thẳng), lưng gù, chân lơ lửng. */
function sitBad(): string {
  return `<g class="pz-measure">
    <path d="M128 104 Q114 126 126 156" stroke="${BAD}" stroke-width="2.6" stroke-dasharray="5 4" fill="none" stroke-linecap="round"/>
    <circle cx="178" cy="128" r="9" fill="none" stroke="${BAD}" stroke-width="2.4" stroke-dasharray="4 3"/>
    <path d="M190 206 V226" stroke="${BAD}" stroke-width="2.2" stroke-dasharray="3 3"/>
    <path d="M186 222 L190 228 L194 222" stroke="${BAD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${label(120, 92, 'lưng gù', BAD)}
    ${label(196, 114, 'ngồi xa', BAD)}
    ${label(222, 214, 'chân hẫng', BAD)}
    ${crossBadge(342, 20)}
  </g>`;
}

export function postureArt(focus: PosturePart, opts: PostureOpts = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', POSTURE_VIEWBOX);
  svg.setAttribute('class', `posture-art focus-${focus}${opts.variant === 'bad' ? ' is-bad' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = postureMarkup(focus, opts);
  return svg;
}
