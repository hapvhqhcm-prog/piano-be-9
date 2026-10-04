/**
 * Tranh minh họa tư thế ngồi đàn (nhìn ngang): bé ngồi trên ghế trước đàn.
 * Phần cần chú ý (lưng / chân / tay) được tô sáng và nhấp nháy nhẹ.
 */
export type PosturePart = 'back' | 'feet' | 'hands' | 'all';

const SVG = 'http://www.w3.org/2000/svg';

export function postureArt(focus: PosturePart): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 320 230');
  svg.setAttribute('class', `posture-art focus-${focus}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <!-- sàn -->
    <rect x="0" y="212" width="320" height="18" rx="4" class="pa-floor"/>
    <!-- đàn piano -->
    <rect x="214" y="44" width="96" height="168" rx="8" class="pa-piano"/>
    <rect x="196" y="108" width="40" height="14" rx="3" class="pa-keys"/>
    <rect x="200" y="108" width="6" height="8" class="pa-black"/><rect x="212" y="108" width="6" height="8" class="pa-black"/><rect x="226" y="108" width="6" height="8" class="pa-black"/>
    <rect x="224" y="58" width="76" height="34" rx="4" class="pa-music"/>
    <!-- ghế -->
    <rect x="70" y="140" width="84" height="12" rx="4" class="pa-bench"/>
    <rect x="78" y="152" width="8" height="60" class="pa-bench"/><rect x="138" y="152" width="8" height="60" class="pa-bench"/>
    <!-- bé -->
    <circle cx="112" cy="58" r="22" class="pa-head"/>
    <path d="M94 50 q18 -22 38 -2" class="pa-hair"/>
    <circle cx="121" cy="57" r="2.6" class="pa-eye"/>
    <path d="M116 68 q6 4 11 0" class="pa-smile"/>
    <path d="M110 82 L106 140" class="pa-body part-back"/>
    <path d="M106 140 L160 140 L164 206" class="pa-leg part-feet"/>
    <path d="M164 206 h18" class="pa-foot part-feet"/>
    <path d="M110 96 q34 6 52 16 q20 10 36 -2" class="pa-arm part-hands"/>
    <circle cx="200" cy="108" r="6" class="pa-handball part-hands"/>
    <!-- nhãn -->
    <g class="pa-tip tip-back"><path d="M80 70 L80 130" class="pa-guide"/><text x="40" y="104">thẳng</text></g>
    <g class="pa-tip tip-feet"><text x="170" y="198">chạm sàn</text></g>
    <g class="pa-tip tip-hands"><text x="150" y="88">tay tròn</text></g>`;
  return svg;
}
