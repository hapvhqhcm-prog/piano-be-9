/**
 * "Bé Nốt" — nhân vật đồng hành: một nốt nhạc móc đơn biết cười, vẫy tay, cổ vũ.
 * Vẽ bằng SVG (không cần ảnh ngoài).
 */
export type Mood = 'happy' | 'cheer' | 'think' | 'wave' | 'love';

const SVG = 'http://www.w3.org/2000/svg';

export function mascot(mood: Mood = 'happy', size = 120): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 120 140');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String((size * 140) / 120));
  svg.setAttribute('class', `mascot mood-${mood}`);
  svg.setAttribute('aria-hidden', 'true');
  const mouth =
    mood === 'think'
      ? '<path d="M47 104 q7 -3 14 0" class="m-line"/>'
      : mood === 'cheer' || mood === 'love'
        ? '<path d="M44 100 q10 14 22 0 z" class="m-mouth"/>'
        : '<path d="M45 101 q9 9 18 0" class="m-line"/>';
  const eyes =
    mood === 'love'
      ? '<path d="M42 88 c-4 -6 4 -9 5 -3 c1 -6 9 -3 5 3 l-5 5 z" class="m-heart"/><path d="M62 88 c-4 -6 4 -9 5 -3 c1 -6 9 -3 5 3 l-5 5 z" class="m-heart"/>'
      : mood === 'cheer'
        ? '<path d="M41 90 q5 -6 10 0" class="m-line"/><path d="M61 90 q5 -6 10 0" class="m-line"/>'
        : '<circle cx="46" cy="89" r="4.5" class="m-eye"/><circle cx="66" cy="89" r="4.5" class="m-eye"/><circle cx="47.5" cy="87.5" r="1.5" fill="#fff"/><circle cx="67.5" cy="87.5" r="1.5" fill="#fff"/>';
  const arm =
    mood === 'wave' || mood === 'cheer'
      ? '<path d="M28 96 q-14 -10 -10 -26" class="m-arm wave-arm"/><path d="M84 98 q12 -4 16 -18" class="m-arm"/>'
      : mood === 'think'
        ? '<path d="M30 100 q-10 4 -8 14" class="m-arm"/><path d="M82 102 q-6 6 -18 4" class="m-arm"/>'
        : '<path d="M28 100 q-12 4 -14 14" class="m-arm"/><path d="M84 100 q12 4 14 14" class="m-arm"/>';
  svg.innerHTML = `
    <defs>
      <radialGradient id="m-body-${mood}" cx="0.35" cy="0.35" r="0.8">
        <stop offset="0" stop-color="#8fb2ff"/><stop offset="1" stop-color="#3b6fd8"/>
      </radialGradient>
    </defs>
    <!-- thân nốt (đầu nốt hình bầu dục) -->
    <path d="M78 22 L80 92" class="m-stem"/>
    <path d="M80 22 q24 6 26 30 q-8 -12 -26 -14 z" class="m-flag"/>
    <ellipse cx="56" cy="96" rx="34" ry="28" transform="rotate(-12 56 96)" fill="url(#m-body-${mood})" class="m-body"/>
    <ellipse cx="44" cy="84" rx="9" ry="5" fill="#fff" opacity="0.35" transform="rotate(-20 44 84)"/>
    ${eyes}
    <circle cx="37" cy="100" r="5" class="m-cheek"/><circle cx="75" cy="100" r="5" class="m-cheek"/>
    ${mouth}
    ${arm}`;
  return svg;
}
