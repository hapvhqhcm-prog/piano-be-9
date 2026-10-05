/**
 * Tranh chào mừng ở màn đầu: Bé Nốt vẫy tay cạnh cây đàn piano (iPad trên giá nhạc), nốt nhạc bay lơ lửng.
 */
import { mascot } from '../mascot';
import { P, beamedNotes, noteGlyph, sparkle, starPath, svgRoot, uid } from './svgKit';

export function heroArt(): SVGSVGElement {
  const body = uid('ha-body');
  const lid = uid('ha-lid');

  // 14 phím trắng, phím đen theo mẫu 2–3
  const x0 = 178;
  const kw = 184 / 14;
  let whites = '';
  for (let i = 1; i < 14; i++) whites += `M${(x0 + i * kw).toFixed(1)} 142 V170 `;
  let blacks = '';
  for (let i = 0; i < 14; i++) {
    if ([0, 1, 3, 4, 5].includes(i % 7) && i < 13) {
      const cx = x0 + (i + 1) * kw;
      blacks += `<rect x="${(cx - 4).toFixed(1)}" y="142" width="8" height="17" rx="1.6" fill="${P.night}"/>`;
    }
  }

  const svg = svgRoot(
    '0 0 400 240',
    'hero-art',
    `
    <style>
      .ha-float { animation: ha-float 3.2s ease-in-out infinite; transform-box: fill-box; }
      .ha-float.d1 { animation-delay: -1.1s; } .ha-float.d2 { animation-delay: -2.2s; }
      .ha-bob { animation: ha-bob 2.4s ease-in-out infinite; }
      .ha-twinkle { animation: ha-tw 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes ha-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-9px) rotate(6deg); } }
      @keyframes ha-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes ha-tw { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.55); opacity: .6; } }
      @media (prefers-reduced-motion: reduce) { .ha-float, .ha-bob, .ha-twinkle { animation: none; } }
    </style>
    <defs>
      <linearGradient id="${body}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.violet}"/><stop offset="1" stop-color="${P.indigo}"/>
      </linearGradient>
      <linearGradient id="${lid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.indigo}"/><stop offset="1" stop-color="${P.indigoDark}"/>
      </linearGradient>
    </defs>

    <!-- nền: đốm màu mềm -->
    <ellipse cx="205" cy="150" rx="185" ry="84" fill="${P.lavender}"/>
    <circle cx="352" cy="44" r="24" fill="${P.sunLight}" opacity=".8"/>
    <circle cx="50" cy="70" r="16" fill="${P.mintLight}" opacity=".8"/>
    <ellipse cx="210" cy="226" rx="176" ry="9" fill="${P.ink}" opacity=".1"/>

    <!-- đàn piano -->
    <g stroke="rgba(61,52,102,.35)" stroke-width="1.5" stroke-linejoin="round">
      <rect x="186" y="208" width="12" height="16" rx="3" fill="${P.indigoDark}"/>
      <rect x="342" y="208" width="12" height="16" rx="3" fill="${P.indigoDark}"/>
      <rect x="182" y="58" width="176" height="154" rx="12" fill="url(#${body})"/>
      <rect x="176" y="48" width="188" height="16" rx="8" fill="url(#${lid})"/>
      <rect x="196" y="72" width="148" height="50" rx="9" fill="#fff" fill-opacity=".12"/>
      <rect x="196" y="178" width="148" height="26" rx="8" fill="#fff" fill-opacity=".12"/>
      <!-- iPad trên giá nhạc -->
      <rect x="236" y="68" width="70" height="54" rx="8" fill="${P.night}"/>
      <rect x="241" y="73" width="60" height="44" rx="4" fill="#eef7ff" stroke="none"/>
      <path d="M246 86 H296 M246 92 H296 M246 98 H296 M246 104 H296 M246 110 H296" stroke="#a7bde0" stroke-width="1"/>
      <rect x="220" y="120" width="102" height="7" rx="3.5" fill="${P.sun}"/>
      <!-- bàn phím -->
      <rect x="172" y="130" width="196" height="12" rx="5" fill="${P.indigoDark}"/>
      <rect x="${x0}" y="142" width="184" height="29" rx="4" fill="#fff"/>
      <path d="${whites}" stroke="#c9c2e6" stroke-width="1.2"/>
      ${blacks}
      <ellipse cx="258" cy="216" rx="5" ry="3" fill="${P.sun}"/>
      <ellipse cx="270" cy="216" rx="5" ry="3" fill="${P.sun}"/>
      <ellipse cx="282" cy="216" rx="5" ry="3" fill="${P.sun}"/>
    </g>
    ${noteGlyph(259, 104, 3.6, P.coral)}${noteGlyph(279, 96, 3.6, P.indigo)}
    <path d="${starPath(338, 92, 7)}" fill="${P.sun}" stroke="#fff" stroke-width="1.5"/>

    <!-- nốt nhạc bay -->
    <g class="ha-float">${noteGlyph(160, 52, 6, P.coral)}</g>
    <g class="ha-float d1">${beamedNotes(214, 30, 4.6, P.mint)}</g>
    <g class="ha-float d2">${noteGlyph(386, 120, 4.6, P.violet)}</g>
    <g class="ha-float d1">${noteGlyph(26, 150, 4, P.orange)}</g>
    <g class="ha-twinkle">${sparkle(300, 26, 7, P.sun)}</g>
    <g class="ha-twinkle" style="animation-delay:-.9s">${sparkle(128, 22, 5, P.pink)}</g>
    <g class="ha-twinkle" style="animation-delay:-.4s">${sparkle(378, 196, 5, P.mint)}</g>

    <g class="ha-bob" data-slot="mascot"></g>`,
  );
  const slot = svg.querySelector('[data-slot="mascot"]');
  const m = mascot('wave', 150);
  m.setAttribute('x', '20');
  m.setAttribute('y', '58');
  slot?.append(m);
  svg.setAttribute('role', 'img');
  svg.removeAttribute('aria-hidden');
  svg.setAttribute('aria-label', 'Bé Nốt vẫy tay cạnh cây đàn piano');
  return svg;
}
