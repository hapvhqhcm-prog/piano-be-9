/**
 * (+ 2026-10-15) TRANH "TƯ THẾ TAY" — mỗi nguyên tắc (src/lessons/handTechnique.ts) có tranh ĐÚNG ✓ và CHƯA ĐÚNG ✗
 * (cổ tay có thêm kiểu sai thứ hai). Vẽ thuần SVG bằng bộ vẽ chung art/handKit.ts; hoạt hình bằng CSS (tự tắt khi máy bật
 * "Giảm chuyển động", dừng khi khuất màn — pauseWhenHidden). Module NẠP MUỘN (chunk riêng).
 *
 * principleMarkup() trả về chuỗi (test được trong node); principleSvg() dựng phần tử <svg role="img" aria-label=…>.
 */
import type { HandPrincipleId, HandVariant } from '../../lessons/handTechnique';
import { P, SVG_NS, checkBadge, pauseWhenHidden } from './art/svgKit';
import {
  BAD,
  GOOD,
  OUTLINE,
  SKIN,
  arrow,
  crossBadge,
  limbs,
  n,
  panelBg,
  ring,
  seg,
  sideHand,
  sideKeys,
  step,
  tag,
  tension,
  type Pt,
} from './art/handKit';
import { POSTURE_VIEWBOX, postureMarkup } from './postureArt';

export interface PrincipleArt {
  viewBox: string;
  inner: string;
  /** Mô tả cho trình đọc màn hình */
  label: string;
}

export interface ArtOpts {
  /** Tranh nhỏ (hình thu nhỏ): bỏ nhãn chữ trong tranh */
  bare?: boolean;
}

const W = 240;
const H = 170;
const VB = `0 0 ${W} ${H}`;

/** Hoạt hình chung (lớp hp-*). Trạng thái tĩnh (không hoạt hình) vẫn là một tranh đúng nghĩa. */
const STYLE = `<style>
  .hp-a { transform-box: view-box; }
  .hp-press { animation: hp-press 2.6s ease-in-out infinite; }
  .hp-keydown { animation: hp-keydown 2.6s ease-in-out infinite; }
  .hp-flow { stroke-dasharray: 3 9; animation: hp-flow 2.6s linear infinite, hp-flowop 2.6s ease-in-out infinite; }
  .hp-say1 { animation: hp-say1 2.6s ease-in-out infinite; }
  .hp-say2 { opacity: 0; animation: hp-say2 2.6s ease-in-out infinite; }
  .hp-walkA { animation: hp-walkA 2.4s ease-in-out infinite; }
  .hp-walkB { animation: hp-walkB 2.4s ease-in-out infinite; }
  .hp-ball { animation: hp-ball 2.4s ease-in-out infinite; }
  .hp-liftA { animation: hp-liftA 2.4s ease-in-out infinite; }
  .hp-liftB { animation: hp-liftB 2.4s ease-in-out infinite; }
  .hp-glowA { animation: hp-glowA 2.4s ease-in-out infinite; }
  .hp-glowB { animation: hp-glowB 2.4s ease-in-out infinite; }
  .hp-ballT { animation: hp-ballT 2.4s ease-in-out infinite; }
  .hp-lifted { opacity: .42; transform: translateY(-6px); }
  .hp-keyA { animation: hp-keyA 2.4s ease-in-out infinite; }
  .hp-keyB { animation: hp-keyB 2.4s ease-in-out infinite; }
  .hp-bounce { animation: hp-bounce 1.6s cubic-bezier(.3,.7,.4,1) infinite; }
  .hp-tap { animation: hp-tap 1.6s ease-out infinite; }
  .hp-pulse { animation: hp-pulse 1.6s ease-in-out infinite; }
  @keyframes hp-press { 0%, 20% { transform: translateY(0); } 40%, 62% { transform: translateY(5px); } 82%, 100% { transform: translateY(0); } }
  @keyframes hp-keydown { 0%, 22% { transform: translateY(0); } 40%, 62% { transform: translateY(6px); } 80%, 100% { transform: translateY(0); } }
  @keyframes hp-flow { to { stroke-dashoffset: -48; } }
  @keyframes hp-flowop { 0% { opacity: 0; } 10%, 50% { opacity: 1; } 64%, 100% { opacity: 0; } }
  @keyframes hp-say1 { 0%, 18% { opacity: 0; } 28%, 60% { opacity: 1; } 68%, 100% { opacity: 0; } }
  @keyframes hp-say2 { 0%, 64% { opacity: 0; } 72%, 94% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes hp-walkA { 0%, 55% { transform: translateY(0); } 62%, 88% { transform: translateY(-12px); } 95%, 100% { transform: translateY(0); } }
  @keyframes hp-walkB { 0%, 35% { transform: translateY(-12px); } 42%, 92% { transform: translateY(0); } 98%, 100% { transform: translateY(-12px); } }
  @keyframes hp-keyA { 0%, 55% { transform: translateY(3px); } 62%, 88% { transform: translateY(0); } 95%, 100% { transform: translateY(3px); } }
  @keyframes hp-keyB { 0%, 35% { transform: translateY(0); } 42%, 92% { transform: translateY(3px); } 98%, 100% { transform: translateY(0); } }
  @keyframes hp-liftA { 0%, 55% { opacity: 1; transform: translateY(0); } 62%, 88% { opacity: .42; transform: translateY(-6px); } 95%, 100% { opacity: 1; transform: translateY(0); } }
  @keyframes hp-liftB { 0%, 35% { opacity: .42; transform: translateY(-6px); } 42%, 92% { opacity: 1; transform: translateY(0); } 98%, 100% { opacity: .42; transform: translateY(-6px); } }
  @keyframes hp-glowA { 0%, 55% { opacity: .9; } 62%, 88% { opacity: 0; } 95%, 100% { opacity: .9; } }
  @keyframes hp-glowB { 0%, 35% { opacity: 0; } 42%, 92% { opacity: .9; } 98%, 100% { opacity: 0; } }
  @keyframes hp-ballT { 0%, 42% { transform: translateX(0); } 52%, 88% { transform: translateX(29.7px); } 96%, 100% { transform: translateX(0); } }
  @keyframes hp-ball { 0%, 42% { transform: translateX(0); } 52%, 88% { transform: translateX(42px); } 96%, 100% { transform: translateX(0); } }
  @keyframes hp-bounce { 0% { transform: rotate(0deg); } 12% { transform: rotate(3deg); } 30% { transform: rotate(-16deg); } 70% { transform: rotate(-16deg); } 100% { transform: rotate(0deg); } }
  @keyframes hp-tap { 0%, 6% { transform: translateY(0); } 12% { transform: translateY(6px); } 24%, 100% { transform: translateY(0); } }
  @keyframes hp-pulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) {
    .hp-press, .hp-keydown, .hp-flow, .hp-say1, .hp-say2, .hp-walkA, .hp-walkB, .hp-keyA, .hp-keyB, .hp-ball, .hp-liftA, .hp-liftB, .hp-glowA, .hp-glowB, .hp-ballT, .hp-bounce, .hp-tap, .hp-pulse { animation: none; }
  }
</style>`;

/** Huy hiệu góc phải trên: ✓ hoặc ✗. */
const verdict = (good: boolean, bare?: boolean) => (bare ? '' : good ? checkBadge(W - 20, 20, 12) : crossBadge(W - 20, 20, 12));
/**
 * Nhãn chữ trong tranh, luôn nằm TRỌN trong khung và tránh VÙNG AN TOÀN của huy hiệu ✓/✗ (góc phải trên).
 * Bề rộng ước lượng giống handKit.tag().
 */
export function placeTag(x: number, y: number, text: string, size = 11): [number, number] {
  const w = Math.max(18, text.length * size * 0.56 + 10);
  const top = size * 0.95;
  const bottom = size * 0.55;
  let cx = Math.min(Math.max(x, 6 + w / 2), W - 6 - w / 2);
  const cy = Math.min(Math.max(y, 4 + top), H - 4 - bottom);
  // huy hiệu: tâm (W-20, 20), r 12 + viền → vùng x ≥ W-38, y ≤ 38
  if (cx + w / 2 > W - 38 && cy - top < 38) cx = W - 40 - w / 2;
  return [cx, cy];
}
const label = (bare: boolean | undefined, x: number, y: number, text: string, color: string, size = 11) => {
  if (bare) return '';
  const [cx, cy] = placeTag(x, y, text, size);
  return tag(cx, cy, text, color, size);
};

// Cảnh nhìn ngang cận cảnh: tỉ lệ bàn tay, mép trước & mặt phím trắng, tâm đầu ngón nằm trên mặt phím
const S = 1.9;
const KX = 138;
const KY = 122;
const TIP_Y = KY - 4.5 * S;

/** 1. Bàn tay ôm quả bóng (nhìn ngang): khớp gốc cao như cây cầu ↔ tay bẹp, cầu sụp. */
function shape(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const keys = sideKeys({ x: KX, y: KY, len: 60 });
  if (good) {
    const hand = sideHand({ tip: [174, TIP_Y], pose: 'curved', scale: S });
    const [, , pip, mcp, wr] = hand.pts;
    const dip = hand.pts[1];
    // quả bóng nằm gọn dưới vòm bàn tay (giữa khớp gốc và đầu ngón), chạm mặt phím
    const bc: Pt = [(mcp[0] + dip[0]) / 2 - 2, KY - 20];
    const ball =
      `<circle cx="${n(bc[0])}" cy="${n(bc[1])}" r="18" fill="${P.orange}" stroke="${OUTLINE}" stroke-width="1.4"/>` +
      `<path d="M${n(bc[0] - 17)} ${n(bc[1] - 4)} Q${n(bc[0])} ${n(bc[1] + 8)} ${n(bc[0] + 17)} ${n(bc[1] - 4)} M${n(bc[0])} ${n(bc[1] - 18)} Q${n(bc[0] - 9)} ${n(bc[1])} ${n(bc[0])} ${n(bc[1] + 18)}" stroke="${P.sunLight}" stroke-width="3" fill="none"/>`;
    const bridge = `<path d="M${n(wr[0])} ${n(wr[1] - 24)} Q${n(mcp[0])} ${n(mcp[1] - 44)} ${n(pip[0] + 8)} ${n(pip[1] - 18)}" stroke="${GOOD}" stroke-width="3.2" stroke-dasharray="7 5" fill="none" stroke-linecap="round"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: bàn tay khum tròn như ôm quả bóng, khớp gốc ngón cao như cây cầu',
      inner: STYLE + panelBg(W, H, 'good') + keys + ball + hand.svg + bridge + label(o.bare, mcp[0] - 34, 14, 'cây cầu', GOOD, 12) + verdict(true, o.bare),
    };
  }
  const hand = sideHand({ tip: [206, TIP_Y], pose: 'flat', scale: S });
  const mcp = hand.pts[3];
  return {
    viewBox: VB,
    label: 'Chưa đúng: bàn tay bẹp, khớp gốc ngón sụp xuống',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      keys +
      hand.svg +
      ring(mcp, 22, BAD, 'hp-pulse') +
      `<path d="M${n(mcp[0] - 62)} ${n(mcp[1] - 44)} Q${n(mcp[0])} ${n(mcp[1] - 22)} ${n(mcp[0] + 62)} ${n(mcp[1] - 40)}" stroke="${BAD}" stroke-width="3" stroke-dasharray="6 5" fill="none" stroke-linecap="round"/>` +
      label(o.bare, mcp[0], mcp[1] - 56, 'cầu sụp', BAD, 12) +
      verdict(false, o.bare),
  };
}

/** 2. Đầu ngón đứng vững — khớp đầu không gãy (nguyên nhân số 1 làm tiếng đàn yếu). */
function tip(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const tipPt: Pt = [good ? 176 : 184, TIP_Y];
  const hand = sideHand({ tip: tipPt, pose: good ? 'curved' : 'collapsed', scale: S });
  const dip = hand.pts[1];
  const mark = good
    ? `<circle cx="${n(tipPt[0])}" cy="${KY}" r="4.2" fill="${GOOD}" stroke="#fff" stroke-width="1.6"/>` +
      `<path d="M${n(tipPt[0] + 8)} ${n(tipPt[1] - 6)} L206 64" stroke="${GOOD}" stroke-width="1.8" stroke-dasharray="3 3"/>` +
      label(o.bare, 206, 58, 'đầu ngón', GOOD, 12)
    : ring(dip, 16, BAD, 'hp-pulse') +
      `<path d="M${n(dip[0] + 12)} ${n(dip[1] - 12)} L200 64" stroke="${BAD}" stroke-width="1.8" stroke-dasharray="3 3"/>` +
      label(o.bare, 204, 58, 'gãy!', BAD, 12);
  const press = good ? ' class="hp-a hp-press"' : '';
  return {
    viewBox: VB,
    label: good
      ? 'Đúng: đầu ngón ngay sau móng chạm phím, khớp đầu ngón đứng vững'
      : 'Chưa đúng: khớp đầu ngón bị gãy lõm vào, chạm phím bằng bụng ngón',
    inner:
      STYLE +
      panelBg(W, H, good ? 'good' : 'bad') +
      sideKeys({ x: KX, y: KY, len: 60, keyClass: good ? 'hp-a hp-keydown' : '' }) +
      `<g${press}>${hand.svg}</g>` +
      mark +
      verdict(good, o.bare),
  };
}

/** Bàn tay NHÌN TỪ TRÊN XUỐNG trên 7 phím trắng (tay phải, ngón cái ở Đô). */
function topKeys(overlay = ''): string {
  let s = `<rect x="14" y="16" width="${W - 28}" height="${H - 34}" rx="6" fill="${P.ink}"/>`;
  for (let i = 0; i < 7; i++) s += `<rect x="${18 + i * 29.7}" y="20" width="27.7" height="${H - 46}" rx="3" fill="#fff"/>`;
  s += overlay;
  for (const i of [0, 1, 3, 4, 5]) s += `<rect x="${18 + (i + 1) * 29.7 - 9}" y="20" width="16" height="64" rx="2.5" fill="${P.night}"/>`;
  return s;
}
const TOP_X = (i: number) => 18 + i * 29.7 + 13.85;

/** Đầu ngón 2–5 (nhìn từ trên). */
const TOP_TIPS: ReadonlyArray<Pt> = [
  [TOP_X(1), 92],
  [TOP_X(2), 86],
  [TOP_X(3), 91],
  [TOP_X(4), 100],
];

/** Bàn tay phải nhìn từ trên: ngón 2–5 cong trên phím, đường khớp gốc, ngón cái cong nằm nghiêng. `finger` bọc từng ngón 2–5. */
function topHand(o: { finger?: (k: number, svg: string) => string } = {}): string {
  const skin = SKIN.base;
  const fingers = TOP_TIPS.map(([x, y], k) => {
    const f = seg([x - 1, 120], [x, y], 17 - k * 1.2, skin);
    const svg = f.under + f.over + `<ellipse cx="${n(x)}" cy="${n(y - 1)}" rx="4.6" ry="3.4" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`;
    return o.finger ? o.finger(k, svg) : svg;
  });
  const palm = `<path d="M${n(TOP_X(0) + 8)} 150 Q${n(TOP_X(0) + 4)} 112 ${n(TOP_X(1) - 8)} 112 L${n(TOP_X(4) + 6)} 114 Q${n(TOP_X(4) + 14)} 128 ${n(TOP_X(4) + 6)} 150 Z" fill="${skin}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  const knuckles = TOP_TIPS.map(([x]) => `<path d="M${n(x - 5)} 118 q5 -3 10 0" stroke="${SKIN.dark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('');
  const arm = seg([TOP_X(2) + 6, 176], [TOP_X(2) + 4, 152], 54, P.violet);
  const base: Pt = [TOP_X(0) + 18, 140];
  const mid: Pt = [TOP_X(0) + 4, 126];
  const tp: Pt = [TOP_X(0) - 1, 112];
  const th =
    limbs([seg(base, mid, 17, skin), seg(mid, tp, 15, skin)]) +
    `<ellipse cx="${n(tp[0] - 3.4)}" cy="${n(tp[1] + 1)}" rx="2.4" ry="4.4" transform="rotate(-24 ${n(tp[0] - 3.4)} ${n(tp[1] + 1)})" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`;
  return arm.under + arm.over + fingers.join('') + palm + knuckles + th;
}

/** 3. Ngón cái: chạm bằng cạnh đầu ngón, mềm, hơi cong ↔ cứng, thõng xuống khỏi mép phím. */
function thumb(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const skin = SKIN.base;
  // ngón 2–5 nhìn từ trên: gốc ở hàng khớp y≈112, đầu ngón trên phím
  const tips = [
    [TOP_X(1), 92],
    [TOP_X(2), 86],
    [TOP_X(3), 91],
    [TOP_X(4), 100],
  ] as const;
  const fingers = tips.map(([x, y], k) => seg([x - 1, 120], [x, y], 17 - k * 1.2, skin));
  const nails = tips.map(([x, y]) => `<ellipse cx="${n(x)}" cy="${n(y - 1)}" rx="4.6" ry="3.4" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`).join('');
  const palm = `<path d="M${n(TOP_X(0) + 8)} 150 Q${n(TOP_X(0) + 4)} 112 ${n(TOP_X(1) - 8)} 112 L${n(TOP_X(4) + 6)} 114 Q${n(TOP_X(4) + 14)} 128 ${n(TOP_X(4) + 6)} 150 Z" fill="${skin}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  const knuckles = tips.map(([x]) => `<path d="M${n(x - 5)} 118 q5 -3 10 0" stroke="${SKIN.dark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('');
  const arm = seg([TOP_X(2) + 6, 176], [TOP_X(2) + 4, 152], 54, P.violet);
  // ngón cái
  const base: Pt = [TOP_X(0) + 18, 140];
  let th: string;
  let thumbTip: Pt;
  if (good) {
    // cong nhẹ, nằm nghiêng: đầu ngón trên phím Đô gần mép, móng thấy ở CẠNH
    const mid: Pt = [TOP_X(0) + 4, 126];
    thumbTip = [TOP_X(0) - 1, 112];
    th = limbs([seg(base, mid, 17, skin), seg(mid, thumbTip, 15, skin)]);
    th += `<ellipse cx="${n(thumbTip[0] - 3.4)}" cy="${n(thumbTip[1] + 1)}" rx="2.4" ry="4.4" transform="rotate(-24 ${n(thumbTip[0] - 3.4)} ${n(thumbTip[1] + 1)})" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`;
  } else {
    // cứng, duỗi thẳng, thõng ra ngoài mép phím
    thumbTip = [TOP_X(0) - 10, H - 10];
    th = limbs([seg(base, thumbTip, 16, skin)]);
    th += `<ellipse cx="${n(thumbTip[0] - 1)}" cy="${n(thumbTip[1] + 2)}" rx="4.4" ry="3" fill="${SKIN.nail}" stroke="${SKIN.dark}" stroke-width=".9"/>`;
  }
  const marks = good
    ? ring(thumbTip, 11, GOOD) + label(o.bare, TOP_X(0) + 6, 158, 'cạnh ngón', GOOD)
    : ring(thumbTip, 11, BAD, 'hp-pulse') + tension([TOP_X(0) + 6, 140], BAD, 0.9) + label(o.bare, TOP_X(0) + 50, 158, 'thõng, cứng', BAD);
  return {
    viewBox: VB,
    label: good
      ? 'Đúng: ngón cái hơi cong, chạm phím bằng cạnh đầu ngón (nhìn từ trên xuống)'
      : 'Chưa đúng: ngón cái duỗi cứng, thõng ra ngoài mép phím (nhìn từ trên xuống)',
    inner:
      STYLE +
      panelBg(W, H, good ? 'good' : 'bad') +
      topKeys() +
      arm.under +
      arm.over +
      limbs(fingers) +
      nails +
      palm +
      knuckles +
      th +
      marks +
      verdict(good, o.bare),
  };
}

/** 4. Cổ tay ngang phím: cẳng tay – cổ tay – bàn tay thẳng hàng ↔ võng xuống / nhô lên. */
function wrist(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const pose = good ? 'curved' : v === 'bad' ? 'wristLow' : 'wristHigh';
  const hand = sideHand({ tip: [180, TIP_Y], pose, scale: S });
  const [, , , mcp, wr, el] = hand.pts;
  const foreDeg = (Math.atan2(el[1] - wr[1], el[0] - wr[0]) * 180) / Math.PI;
  const far = step(wr, 80, foreDeg);
  const up = 26; // phía trên nét (nửa bề dày cẳng tay + khoảng hở)
  const line = good
    ? `<path d="M${n(far[0])} ${n(far[1] - up)} L${n(mcp[0] + 18)} ${n(mcp[1] - up + 2)}" stroke="${GOOD}" stroke-width="3.2" stroke-dasharray="7 5" stroke-linecap="round"/>`
    : `<path d="M${n(far[0])} ${n(far[1] - up)} L${n(wr[0])} ${n(wr[1] - up)} L${n(mcp[0] + 18)} ${n(mcp[1] - up + 2)}" stroke="${BAD}" stroke-width="3.2" stroke-dasharray="7 5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const text = good ? 'thẳng hàng' : v === 'bad' ? 'võng xuống' : 'nhô lên';
  const at: Pt = good ? [78, 22] : v === 'bad' ? [72, 150] : [150, 24];
  return {
    viewBox: VB,
    label: good
      ? 'Đúng: cẳng tay, cổ tay và bàn tay thẳng một đường, ngang mặt phím'
      : v === 'bad'
        ? 'Chưa đúng: cổ tay võng xuống thấp hơn phím'
        : 'Chưa đúng: cổ tay nhô cao hơn bàn tay',
    inner:
      STYLE +
      panelBg(W, H, good ? 'good' : 'bad') +
      sideKeys({ x: KX, y: KY, len: 60 }) +
      hand.svg +
      line +
      (good ? '' : ring(wr, 22, BAD, 'hp-pulse')) +
      label(o.bare, at[0], at[1], text, good ? GOOD : BAD, 12) +
      verdict(good, o.bare),
  };
}

/** Thân + đầu bé (nhìn ngang, bên trái tranh) cho cảnh cả cánh tay. */
function torso(shoulderUp: boolean): string {
  const sh = shoulderUp ? -12 : 0;
  return (
    `<path d="M-8 ${H} L-8 ${64 + sh} Q4 ${44 + sh} 26 ${48 + sh} Q42 ${54 + sh} 42 ${74 + sh} L44 ${H} Z" fill="${P.indigo}" stroke="${OUTLINE}" stroke-width="1.4"/>` +
    `<rect x="7" y="27" width="13" height="18" rx="5" fill="${P.skin}" stroke="${OUTLINE}" stroke-width="1.2"/>` +
    `<circle cx="15" cy="12" r="19" fill="${P.skin}" stroke="${OUTLINE}" stroke-width="1.4"/>` +
    `<path d="M-5 16 Q-7 -10 15 -8 Q35 -7 34 8 Q25 4 17 6 Q11 2 5 8 Q1 12 2 20 Z" fill="${P.hair}"/>` +
    `<ellipse cx="26" cy="12" rx="2.3" ry="3" fill="${P.night}"/>` +
    (shoulderUp
      ? `<path d="M23 24 q4 -2 8 0" stroke="#c2324d" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
      : `<path d="M24 22 q4 3 7 -1" stroke="#c2324d" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)
  );
}

/** 5. Sức nặng cánh tay: vai thả lỏng → sức nặng chảy qua ngón cong xuống tận đáy phím → nhấc nhẹ. */
function weight(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const s = 1.25;
  const ky = 122;
  const hand = sideHand({ tip: [good ? 182 : 190, ky - 4.5 * s], pose: good ? 'curved' : 'stiff', scale: s, sleeve: null, forearm: 52 });
  const [tp, dip, pip, mcp, wr, el] = hand.pts;
  const shoulder: Pt = good ? [28, 52] : [28, 38];
  const upper = seg(shoulder, el, 26, P.violet);
  const keys = sideKeys({ x: 152, y: ky, len: 30, keyClass: good ? 'hp-a hp-keydown' : '', pressed: !good, bed: !good });
  if (good) {
    const flow = `M${n(shoulder[0])} ${n(shoulder[1])} L${n(el[0])} ${n(el[1])} L${n(wr[0])} ${n(wr[1])} L${n(mcp[0])} ${n(mcp[1])} L${n(pip[0])} ${n(pip[1])} L${n(dip[0])} ${n(dip[1])} L${n(tp[0])} ${n(tp[1] + 6)}`;
    return {
      viewBox: VB,
      label: 'Đúng: vai thả lỏng, sức nặng cánh tay chảy qua ngón cong xuống đáy phím, rồi nhấc nhẹ lên',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        keys +
        torso(false) +
        `<g class="hp-a hp-press">${upper.under}${hand.svg}${upper.over}</g>` +
        `<path class="hp-flow" d="${flow}" stroke="${P.sun}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
        (o.bare
          ? ''
          : `<g class="hp-say1">${label(false, 186, 58, 'thả ↓', GOOD, 13)}</g><g class="hp-say2">${label(false, 186, 58, 'nhấc ↑', P.indigo, 13)}</g>` +
            label(false, 200, 156, 'chạm đáy phím', P.woodDark, 10)) +
        verdict(true, o.bare),
    };
  }
  return {
    viewBox: VB,
    label: 'Chưa đúng: vai gồng nhô lên, ngón duỗi cứng, ấn mạnh xuống phím',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      keys +
      torso(true) +
      upper.under +
      hand.svg +
      upper.over +
      tension([34, 30], BAD, 1.1) +
      ring(shoulder, 15, BAD, 'hp-pulse') +
      arrow([wr[0] + 12, wr[1] - 56], [wr[0] + 12, wr[1] - 20], BAD, 4.5) +
      label(o.bare, 92, 18, 'gồng vai', BAD, 12) +
      label(o.bare, wr[0] + 48, wr[1] - 44, 'ấn!', BAD, 12) +
      verdict(false, o.bare),
  };
}

/** 6. Ngón nghỉ nằm nhẹ trên phím ↔ ngón út vểnh lên. */
function quiet(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const keys = sideKeys({ x: KX, y: KY, len: 60 });
  const front = sideHand({ tip: [170, TIP_Y], pose: 'curved', scale: S });
  const mcp = front.pts[3];
  let back = '';
  let marks = '';
  if (good) {
    const tips: Pt[] = [];
    for (const [dx, sc] of [
      [30, 1.55],
      [16, 1.75],
    ] as const) {
      const t: Pt = [170 + dx, KY - 4.5 * sc];
      tips.push(t);
      back += sideHand({ tip: t, pose: 'resting', scale: sc, skin: SKIN.back, sleeve: null, nail: false }).svg;
    }
    marks = tips.map((t) => `<circle cx="${n(t[0])}" cy="${KY}" r="3.4" fill="${GOOD}" stroke="#fff" stroke-width="1.2"/>`).join('') + label(o.bare, 202, 64, 'nằm nhẹ', GOOD, 12);
  } else {
    // ngón út vểnh thẳng lên, ngón áp út co cao khỏi phím
    const k = 1.6;
    const m: Pt = [mcp[0] + 10, mcp[1] - 4];
    const p1 = step(m, 17 * k, -34);
    const p2 = step(p1, 12 * k, -44);
    const p3 = step(p2, 9 * k, -50);
    const r1 = step(m, 19 * k, -10);
    const r2 = step(r1, 12 * k, 34);
    const r3 = step(r2, 9 * k, 80);
    back =
      limbs([seg(m, r1, 10.5 * k, SKIN.back), seg(r1, r2, 9.5 * k, SKIN.back), seg(r2, r3, 9 * k, SKIN.back)]) +
      limbs([seg(m, p1, 9.5 * k, SKIN.back), seg(p1, p2, 8.5 * k, SKIN.back), seg(p2, p3, 8 * k, SKIN.back)]);
    marks = ring(p3, 14, BAD, 'hp-pulse') + tension([p3[0] + 10, p3[1] + 8], BAD, 0.9) + label(o.bare, p3[0] - 44, p3[1] - 2, 'vểnh!', BAD, 12);
  }
  return {
    viewBox: VB,
    label: good ? 'Đúng: ngón đang đánh cong, các ngón nghỉ nằm nhẹ trên phím' : 'Chưa đúng: ngón út vểnh thẳng lên, ngón áp út co cao khỏi phím',
    inner: STYLE + panelBg(W, H, good ? 'good' : 'bad') + keys + back + front.svg + marks + verdict(good, o.bare),
  };
}

/** 7. Ngồi: dùng tranh tư thế (postureArt 'sit'). */
function sitArt(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  let inner = postureMarkup('sit', { variant: good ? 'good' : 'bad' });
  if (o.bare) inner = inner.replace(/<g class="pz-measure">[\s\S]*?<\/g>\s*$/, '');
  return {
    viewBox: POSTURE_VIEWBOX,
    label: good
      ? 'Đúng: ngồi thẳng hơi nghiêng tới, khuỷu tay hơi trước người, cẳng tay ngang phím, kê gối và kê chân'
      : 'Chưa đúng: ngồi quá xa, lưng gù, chân lơ lửng không chạm sàn',
    inner,
  };
}

/**
 * 8a. Đàn liền (nhìn từ trên xuống, cùng kiểu thẻ ngón cái): ngón 2 và ngón 3 thay nhau giữ phím — ngón sau chạm xuống
 * rồi ngón trước mới nhấc (luôn có một "chân" chạm đất), quả bóng sức nặng lăn theo ngón đang giữ ↔ nhấc hết, tiếng hở.
 */
function legato(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const glow = (i: number, cls: string) =>
    `<rect class="${cls}" x="${n(18 + i * 29.7)}" y="20" width="27.7" height="${H - 46}" rx="3" fill="${P.sunLight}" opacity=".9"/>`;
  const keys = topKeys(good ? glow(1, 'hp-a hp-glowA') + glow(2, 'hp-a hp-glowB') : '');
  const hand = topHand({
    finger: (k, svg) =>
      k === 0
        ? `<g class="${good ? 'hp-a hp-liftA' : 'hp-lifted'}">${svg}</g>`
        : k === 1
          ? `<g class="${good ? 'hp-a hp-liftB' : 'hp-lifted'}">${svg}</g>`
          : svg,
  });
  if (good) {
    const wave = `<path d="M20 10 q7 -5 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0" stroke="${GOOD}" stroke-width="2.8" fill="none"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: đàn liền — ngón sau chạm phím rồi ngón trước mới nhấc, như đi bộ, tiếng nối liền',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        keys +
        hand +
        `<g class="hp-a hp-ballT"><circle cx="${n(TOP_X(1))}" cy="128" r="9" fill="${P.sun}" stroke="#fff" stroke-width="2.4"/></g>` +
        wave +
        label(o.bare, 212, 158, 'đi bộ', GOOD, 12) +
        verdict(true, o.bare),
    };
  }
  const wave =
    `<path d="M20 10 q7 -5 14 0 t14 0 t14 0 t14 0" stroke="${BAD}" stroke-width="2.8" fill="none"/>` +
    `<path d="M134 10 q7 -5 14 0 t14 0 t14 0 t14 0" stroke="${BAD}" stroke-width="2.8" fill="none"/>`;
  return {
    viewBox: VB,
    label: 'Chưa đúng: nhấc hết các ngón cùng lúc, giữa hai nốt có khoảng hở im lặng',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      keys +
      hand +
      ring([(TOP_X(1) + TOP_X(2)) / 2, 84], 30, BAD, 'hp-pulse') +
      wave +
      label(o.bare, 105, 14, 'hở', BAD, 12) +
      verdict(false, o.bare),
  };
}

/** 8b. Đàn ngắt: cổ tay nảy nhẹ, đầu ngón chạm rồi bật lên ↔ ấn cả cánh tay nặng nề. */
function staccato(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const keys = sideKeys({ x: KX, y: KY, len: 60, keyClass: good ? 'hp-a hp-tap' : '', pressed: !good, bed: !good });
  if (good) {
    // cẳng tay đứng yên; bàn tay nảy quanh cổ tay
    const hand = sideHand({ tip: [176, TIP_Y], pose: 'curved', scale: S, sleeve: null, forearm: 0.01 });
    const wr = hand.pts[4];
    const fore = seg(step(wr, 140, 179), wr, 21 * S, SKIN.base);
    const arc = `<path d="M182 96 Q196 40 218 62" stroke="${P.violet}" stroke-width="2.8" stroke-dasharray="4 5" fill="none" stroke-linecap="round"/><circle cx="219" cy="64" r="6" fill="${P.coral}" stroke="#fff" stroke-width="1.6"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: đàn ngắt — cổ tay mềm nảy nhẹ, đầu ngón chạm phím rồi bật lên ngay',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        keys +
        fore.under +
        `<g class="hp-a hp-bounce" style="transform-origin: ${n(wr[0])}px ${n(wr[1])}px">${hand.svg}</g>` +
        fore.over +
        arc +
        label(o.bare, 150, 22, 'bật!', P.violet, 12) +
        verdict(true, o.bare),
    };
  }
  const hand = sideHand({ tip: [184, TIP_Y + 6], pose: 'stiff', scale: S });
  const wr = hand.pts[4];
  return {
    viewBox: VB,
    label: 'Chưa đúng: ấn cả cánh tay xuống, giữ phím lâu, tiếng nặng nề',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      keys +
      hand.svg +
      arrow([wr[0] - 6, 6], [wr[0] - 6, wr[1] - 26], BAD, 5) +
      arrow([wr[0] + 34, 10], [wr[0] + 34, wr[1] - 30], BAD, 4) +
      label(o.bare, wr[0] + 88, 30, 'nặng nề', BAD, 12) +
      verdict(false, o.bare),
  };
}

const ARTS: Record<HandPrincipleId, (v: HandVariant, o: ArtOpts) => PrincipleArt> = {
  shape,
  tip,
  thumb,
  wrist,
  weight,
  quiet,
  sit: sitArt,
  legato,
  staccato,
};

/** Tranh (chuỗi) của một nguyên tắc ở một biến thể. Biến thể không có (vd 'bad2' ngoài cổ tay) → 'bad'. */
export function principleMarkup(id: HandPrincipleId, variant: HandVariant, opts: ArtOpts = {}): PrincipleArt {
  const v: HandVariant = variant === 'bad2' && id !== 'wrist' ? 'bad' : variant;
  return ARTS[id](v, opts);
}

/** Dựng <svg role="img"> có aria-label; hoạt hình dừng khi khuất màn / "Giảm chuyển động". */
export function principleSvg(id: HandPrincipleId, variant: HandVariant, opts: ArtOpts & { className?: string } = {}): SVGSVGElement {
  const a = principleMarkup(id, variant, opts);
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', a.viewBox);
  svg.setAttribute('class', `hp-art hp-p-${id} hp-v-${variant}${opts.bare ? ' hp-bare' : ''} ${opts.className ?? ''}`.trim());
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', a.label);
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = a.inner;
  return pauseWhenHidden(svg);
}
