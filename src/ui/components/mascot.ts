/**
 * "Bé Nốt" — nhân vật đồng hành: một nốt nhạc móc đơn tròn trĩnh biết cười, vẫy tay, cổ vũ.
 * Vẽ bằng SVG (không cần ảnh ngoài). Màu tô bằng thuộc tính SVG (lớp `mn-*`) nên không phụ thuộc CSS;
 * riêng tay vẫy giữ lớp `wave-arm` (hiệu ứng vẫy trong theme.css, tâm xoay 28px 96px).
 *
 * (+ 2026-10-15, OWNER duyệt "Nhân vật & bản đồ sinh động hơn") Thêm 6 trạng thái: vỗ tay khen (clap), động viên (encourage),
 * ngạc nhiên (surprise), ngủ gật (sleepy), chỉ tay (point), nhảy múa (dance). Chuyển động (styles/mascot.css):
 *  - vào trạng thái mới: "nảy" nhẹ 0,3 s; nghỉ: thở (transform trên CHÍNH thẻ <svg> → GPU ghép lớp, không vẽ lại tranh);
 *  - chớp mắt: MỘT bộ hẹn giờ chung cho mọi Bé Nốt (không rAF), bỏ qua khi app ẩn / "Giảm chuyển động" / tranh khuất;
 *  - mấp máy môi khi giọng đọc đang nói: voice.ts gắn lớp `bn-speaking` lên <html> (CSS lo phần còn lại);
 *  - cử chỉ riêng (vỗ tay, giơ ngón cái, chỉ tay…) lặp vài lần rồi dừng; tranh khuất → dừng hẳn (pauseWhenHidden).
 */
import { P, noteGlyph, pauseWhenHidden, sparkle, starPath, uid } from './art/svgKit';
import '../../styles/mascot.css';

export type Mood = 'happy' | 'cheer' | 'think' | 'wave' | 'love' | 'clap' | 'encourage' | 'surprise' | 'sleepy' | 'point' | 'dance';

/** Mọi trạng thái (thứ tự cho bảng xem thử / test). */
export const MOODS: readonly Mood[] = ['happy', 'wave', 'cheer', 'think', 'love', 'clap', 'encourage', 'surprise', 'sleepy', 'point', 'dance'];

/** Tên trạng thái (aria-label / bảng xem thử). */
export const MOOD_LABEL: Readonly<Record<Mood, string>> = {
  happy: 'vui',
  wave: 'vẫy tay chào',
  cheer: 'reo mừng',
  think: 'suy nghĩ',
  love: 'thương con',
  clap: 'vỗ tay khen',
  encourage: 'động viên',
  surprise: 'ngạc nhiên',
  sleepy: 'ngủ gật',
  point: 'chỉ tay',
  dance: 'nhảy múa',
};

/**
 * Tình huống trên các màn → trạng thái Bé Nốt (chỉ đổi HÌNH, không đổi lúc nào nói gì).
 * praise: làm đúng · bigWin: xong buổi / kỷ lục · retry: cần thử lại · puzzle: gãi đầu suy nghĩ · wow: bất ngờ ·
 * guide: chỉ vào nút / phím · perform: biểu diễn, cập bến · greet: chào · idle: nghỉ · thanks: thương · nap: để lâu không chạm.
 */
export type Cue = 'idle' | 'greet' | 'praise' | 'bigWin' | 'retry' | 'puzzle' | 'wow' | 'guide' | 'perform' | 'thanks' | 'nap';
export const CUE_MOOD: Readonly<Record<Cue, Mood>> = {
  idle: 'happy',
  greet: 'wave',
  praise: 'clap',
  bigWin: 'cheer',
  retry: 'encourage',
  puzzle: 'think',
  wow: 'surprise',
  guide: 'point',
  perform: 'dance',
  thanks: 'love',
  nap: 'sleepy',
};
export const cue = (c: Cue): Mood => CUE_MOOD[c];

const SVG = 'http://www.w3.org/2000/svg';
const INK = '#2a2350';
const BODY_DARK = '#4338b8';
const HAND = '#c8bcff';
const MOUTH = '#c2324d';

const heart = (x: number, y: number, s: number, c: string) =>
  `<path d="M${x} ${y + 3 * s} c${-5 * s} ${-3.4 * s} ${-6 * s} ${-7 * s} ${-3.2 * s} ${-8.4 * s} c${1.5 * s} ${-0.8 * s} ${2.8 * s} 0 ${3.2 * s} ${1.2 * s} c${0.4 * s} ${-1.2 * s} ${1.7 * s} ${-2 * s} ${3.2 * s} ${-1.2 * s} c${2.8 * s} ${1.4 * s} ${1.8 * s} ${5 * s} ${-3.2 * s} ${8.4 * s} Z" fill="${c}"/>`;

/** Một cánh tay (nét cong) + bàn tay tròn ở đầu (+ phần thêm: ngón cái / ngón trỏ). */
const arm = (d: string, hx: number, hy: number, cls: string, more = '') =>
  `<g class="${cls}"><path d="${d}" fill="none" stroke="${BODY_DARK}" stroke-width="6.5" stroke-linecap="round"/>${more}` +
  `<circle cx="${hx}" cy="${hy}" r="6" fill="${HAND}" stroke="${BODY_DARK}" stroke-width="2"/></g>`;
/** Ngón (ngón cái giơ lên / ngón trỏ chỉ): nét viền đậm + lõi sáng. */
const finger = (d: string) =>
  `<path d="${d}" fill="none" stroke="${BODY_DARK}" stroke-width="6.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${HAND}" stroke-width="3" stroke-linecap="round"/>`;

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

/* ---------- Các phần mặt / tay theo trạng thái ---------- */

const openEye = (x: number, y: number, look = 0, dx = 0) =>
  `<ellipse cx="${x + dx}" cy="${y}" rx="5" ry="6.2" fill="${INK}"/>` +
  `<circle cx="${x + 1.6 + dx}" cy="${y - 2.4 + look}" r="2" fill="#fff"/><circle cx="${x - 1.6 + dx}" cy="${y + 2}" r="1" fill="#fff"/>`;
const HAPPY_EYES = `<path d="M40 90 q6 -8 12 0 M61 89 q6 -8 12 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
const OPEN_MOUTH =
  `<path d="M44 100 q11 1 22 -2 q-2 13 -11 13 q-9 0 -11 -11 Z" fill="${MOUTH}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<path d="M49 108 q5 -4 10 -0.5 q-2 3 -5 3 q-3 0 -5 -2.5 Z" fill="#ff8fa3"/>`;
const SMILE = `<path d="M45 100 q10 9 20 -1" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`;
const ARMS_DOWN = arm('M27 102 q-12 5 -14 15', 13, 118, 'mn-arm-l') + arm('M86 101 q12 5 14 15', 100, 117, 'mn-arm-r');

function eyesOf(mood: Mood): string {
  switch (mood) {
    case 'love':
      return heart(46, 86, 0.95, '#ff4f7e') + heart(67, 86, 0.95, '#ff4f7e');
    case 'cheer':
    case 'clap':
    case 'dance':
      return HAPPY_EYES;
    case 'think':
      return (
        openEye(46, 88, -1.4) +
        openEye(67, 87, -1.4) +
        `<path d="M40 77 q6 -4 11 -1 M62 74 q6 -3 11 1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
      );
    case 'encourage':
      // mắt mở to, lông mày nhướn "cố lên!"
      return openEye(46, 89) + openEye(67, 88) + `<path d="M39 78 q6 -3 12 0 M61 77 q6 -3 12 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'surprise':
      return (
        `<circle cx="46" cy="88" r="7.6" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="67" cy="87" r="7.6" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
        `<circle cx="46" cy="89" r="3.4" fill="${INK}"/><circle cx="67" cy="88" r="3.4" fill="${INK}"/>` +
        `<path d="M38 74 q8 -6 15 -1 M60 72 q8 -5 15 1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`
      );
    case 'sleepy':
      return `<path d="M40 89 q6 5 12 0 M61 88 q6 5 12 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'point':
      return openEye(46, 89, 0, 1.6) + openEye(67, 88, 0, 1.6);
    default:
      return openEye(46, 89) + openEye(67, 88);
  }
}

function mouthOf(mood: Mood): string {
  switch (mood) {
    case 'think':
      return `<path d="M50 105 q5 -3 11 0.5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'surprise':
      return `<ellipse cx="55" cy="105" rx="4.6" ry="5.6" fill="${MOUTH}" stroke="${INK}" stroke-width="2.2"/>`;
    case 'sleepy':
      return `<ellipse cx="56" cy="104" rx="3" ry="2.4" fill="${MOUTH}" stroke="${INK}" stroke-width="1.6"/>`;
    case 'cheer':
    case 'love':
    case 'wave':
    case 'clap':
    case 'encourage':
    case 'dance':
      return OPEN_MOUTH;
    default:
      return SMILE;
  }
}

function armsOf(mood: Mood): string {
  switch (mood) {
    case 'wave':
      return arm('M28 96 q-12 -8 -10 -24', 18, 70, 'mn-arm-l wave-arm') + arm('M86 100 q12 4 15 14', 101, 115, 'mn-arm-r');
    case 'cheer':
      return arm('M28 96 q-12 -8 -10 -24', 18, 70, 'mn-arm-l wave-arm') + arm('M86 96 q10 -6 12 -22', 98, 72, 'mn-arm-r');
    case 'think':
      return arm('M28 102 q-10 6 -8 16', 20, 119, 'mn-arm-l') + arm('M84 104 q-4 8 -16 9', 66, 113, 'mn-arm-r');
    case 'clap':
      return arm('M28 102 q4 14 19 15', 47, 117, 'mn-arm-l mn-clap-l') + arm('M86 101 q-2 15 -19 16', 67, 117, 'mn-arm-r mn-clap-r');
    case 'encourage':
      return arm('M27 102 q-12 5 -14 15', 13, 118, 'mn-arm-l') + arm('M86 98 q14 -4 16 -22', 102, 74, 'mn-arm-r mn-pump', finger('M102 70 v-9'));
    case 'surprise':
      return arm('M28 96 q-14 -6 -14 -22', 14, 72, 'mn-arm-l') + arm('M86 96 q12 -6 13 -22', 99, 72, 'mn-arm-r');
    case 'point':
      return arm('M27 102 q-12 5 -14 15', 13, 118, 'mn-arm-l') + arm('M86 103 q11 1 17 8', 103, 111, 'mn-arm-r mn-point', finger('M107 112 l5 1.6'));
    case 'dance':
      return arm('M28 96 q-14 -8 -9 -26', 19, 68, 'mn-arm-l mn-dance-l') + arm('M86 96 q10 -6 12 -22', 98, 72, 'mn-arm-r mn-dance-r');
    default:
      return ARMS_DOWN;
  }
}

function extrasOf(mood: Mood): string {
  switch (mood) {
    case 'cheer':
      return sparkle(12, 46, 6, P.sun) + sparkle(106, 52, 5, P.coral) + `<path d="${starPath(20, 24, 5)}" fill="${P.sun}"/>`;
    case 'love':
      return heart(102, 50, 0.9, P.pink) + heart(16, 56, 0.7, '#ff4f7e');
    case 'think':
      return `<circle cx="24" cy="66" r="3" fill="${P.violetLight}"/><circle cx="17" cy="54" r="4.4" fill="${P.violetLight}"/><text x="6" y="42" font-size="20" font-weight="800" fill="${P.violet}" font-family="system-ui,sans-serif">?</text>`;
    case 'wave':
      return sparkle(104, 40, 5, P.sun);
    case 'clap':
      return `<g class="mn-pop">${sparkle(57, 128, 4.4, P.sun)}${sparkle(20, 62, 5, P.sun)}${sparkle(104, 66, 4.4, P.coral)}</g>`;
    case 'encourage':
      return sparkle(112, 56, 4.4, P.sun) + `<path d="${starPath(14, 60, 5)}" fill="${P.sun}"/>`;
    case 'surprise':
      return `<text x="4" y="52" font-size="22" font-weight="800" fill="${P.coral}" font-family="system-ui,sans-serif">!</text><path d="M20 40 l-4 -6 M27 37 l-1 -7 M12 46 l-6 -2" stroke="${P.coral}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'sleepy':
      return (
        `<g class="mn-zzz" fill="${P.violet}" font-family="system-ui,sans-serif" font-weight="800">` +
        `<text x="16" y="66" font-size="15">Z</text><text x="8" y="48" font-size="12">z</text><text x="18" y="34" font-size="9">z</text></g>`
      );
    case 'point':
      return sparkle(110, 96, 4, P.sun);
    case 'dance':
      return `<g class="mn-notes">${noteGlyph(8, 44, 3.2, P.coral)}${noteGlyph(104, 64, 2.6, P.mint)}${noteGlyph(30, 26, 2.4, P.violet)}</g>`;
    default:
      return '';
  }
}

/** Chân: nhảy múa thì co một chân. */
const feet = (mood: Mood) =>
  `<ellipse cx="44" cy="127" rx="9" ry="5.2" fill="${P.coral}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5"/>` +
  (mood === 'dance'
    ? `<ellipse cx="76" cy="118" rx="9" ry="5.2" transform="rotate(-24 76 118)" fill="${P.coral}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5"/>`
    : `<ellipse cx="70" cy="125" rx="9" ry="5.2" fill="${P.coral}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5"/>`);

/** Trạng thái có mắt mở (được chớp mắt). */
const BLINKS: ReadonlySet<Mood> = new Set<Mood>(['happy', 'wave', 'think', 'encourage', 'surprise', 'point']);

export function mascot(mood: Mood = 'happy', size = 120, outfit: string | null = currentOutfit): SVGSVGElement {
  if (!MOOD_LABEL[mood]) mood = 'happy';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 120 140');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String((size * 140) / 120));
  svg.setAttribute('class', `mascot bn mood-${mood}${BLINKS.has(mood) ? ' can-blink' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('aria-label', `Bé Nốt ${MOOD_LABEL[mood]}`);
  svg.setAttribute('data-mood', mood);
  const g = uid('mn-body');
  const gs = uid('mn-stem');
  // Miệng "đang nói" (ẩn, CSS hiện khi <html> có lớp bn-speaking) — trạng thái ngủ gật thì không nói
  const talk = mood === 'sleepy' ? '' : `<ellipse class="mn-talk" cx="55" cy="104" rx="7" ry="6" fill="${MOUTH}" stroke="${INK}" stroke-width="2.2"/>`;

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
    ${feet(mood)}
    <path d="M80 92 L80 20" stroke="#5546d8" stroke-width="7" stroke-linecap="round"/>
    <path d="M81 17 q22 4 26 26 q2 9 -4 16 q2 -14 -9 -21 q-6 -4 -13 -4 Z" fill="url(#${gs})"/>
    <path d="M86 21 q12 3 16 13" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="57" cy="96" rx="35" ry="29" transform="rotate(-12 57 96)" fill="url(#${g})" stroke="${INK}" stroke-opacity=".25" stroke-width="1.6"/>
    <ellipse cx="42" cy="80" rx="11" ry="5.5" fill="#fff" opacity=".4" transform="rotate(-24 42 80)"/>
    <circle cx="33" cy="88" r="2.2" fill="#fff" opacity=".5"/>
    <g class="mn-eyes">${eyesOf(mood)}</g>
    <ellipse cx="36" cy="101" rx="6" ry="4" fill="#ff9fb6" opacity="${mood === 'sleepy' ? '.95' : '.75'}"/><ellipse cx="78" cy="98" rx="6" ry="4" fill="#ff9fb6" opacity=".75"/>
    <g class="mn-mouth">${mouthOf(mood)}</g>${talk}
    ${armsOf(mood)}
    ${extrasOf(mood)}
    ${outfit && OUTFITS[outfit] ? `<g class="mascot-outfit outfit-${outfit}">${OUTFITS[outfit]}</g>` : ''}`;
  pauseWhenHidden(svg);
  if (BLINKS.has(mood)) startBlinking();
  return svg;
}

/* ---------- Chớp mắt: MỘT bộ hẹn giờ chung (không rAF) ---------- */

let blinkTimer = 0;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function startBlinking(): void {
  if (blinkTimer || typeof window === 'undefined' || typeof document === 'undefined' || !document.querySelectorAll) return;
  const tick = () => {
    const all = document.querySelectorAll<SVGSVGElement>('svg.mascot.can-blink');
    if (!all.length) {
      blinkTimer = 0; // không còn Bé Nốt nào → thôi hẹn giờ (Bé Nốt mới sẽ bật lại)
      return;
    }
    blinkTimer = window.setTimeout(tick, 3400 + Math.random() * 2600);
    if (document.hidden || reducedMotion()) return;
    all.forEach((el) => {
      if (el.classList.contains('anim-paused')) return;
      el.classList.add('blink');
      window.setTimeout(() => el.classList.remove('blink'), 170);
    });
  };
  blinkTimer = window.setTimeout(tick, 2200 + Math.random() * 1200);
}

/* ---------- Ngủ gật khi để lâu không chạm ---------- */

/** Để màn hình yên bao lâu thì Bé Nốt ngủ gật. */
export const NAP_AFTER_MS = 45_000;
/** Bị đánh thức: ngạc nhiên bao lâu rồi về trạng thái cũ. */
export const WAKE_MS = 1100;

/**
 * Bé Nốt `el` ngủ gật sau `ms` không có chạm / phím nào; chạm → giật mình (surprise) rồi về `awake`.
 * Chỉ đổi hình (không nói gì). Trả về hàm gỡ (gọi khi rời màn).
 */
export function napWhenIdle(el: SVGSVGElement, awake: Mood, size: number, ms = NAP_AFTER_MS): () => void {
  let cur = el;
  let timer = 0;
  let wakeTimer = 0;
  let asleep = false;
  const show = (m: Mood) => {
    if (!cur.isConnected) return;
    const n = mascot(m, size);
    cur.replaceWith(n);
    cur = n;
  };
  const arm = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!cur.isConnected) return stop();
      asleep = true;
      show('sleepy');
    }, ms);
  };
  const poke = () => {
    if (asleep) {
      asleep = false;
      show('surprise');
      window.clearTimeout(wakeTimer);
      wakeTimer = window.setTimeout(() => !asleep && show(awake), WAKE_MS);
    }
    arm();
  };
  const events = ['pointerdown', 'keydown'] as const;
  for (const ev of events) document.addEventListener(ev, poke, { capture: true, passive: true });
  function stop() {
    window.clearTimeout(timer);
    window.clearTimeout(wakeTimer);
    for (const ev of events) document.removeEventListener(ev, poke, { capture: true });
  }
  arm();
  return stop;
}
