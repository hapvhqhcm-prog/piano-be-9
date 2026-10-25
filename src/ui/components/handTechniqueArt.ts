/**
 * (+ 2026-10-15) TRANH "TƯ THẾ TAY" — mỗi nguyên tắc (src/lessons/handTechnique.ts) có tranh ĐÚNG ✓ và CHƯA ĐÚNG ✗
 * (cổ tay có thêm kiểu sai thứ hai). Hoạt hình bằng CSS (tự tắt khi máy bật "Giảm chuyển động", dừng khi khuất màn —
 * pauseWhenHidden). Module NẠP MUỘN (chunk riêng).
 *
 * (2026-10-18, bé + bố mẹ chê "bàn tay xấu quá" hai lần → OWNER: KHÔNG vẽ bàn tay người nữa) Mỗi tranh là một SƠ ĐỒ
 * TRỪU TƯỢNG (art/diagramKit.ts): chấm đầu ngón có số, "cây cầu" nét tròn to, khối cẳng tay, quả nặng, phím đàn —
 * nét tròn to viền mực như Bé Nốt, nhiều khoảng trắng, huy hiệu ✓ / ✗ to, nhãn ≤ 6 chữ, emoji gốc của máy làm điểm nhấn.
 *
 * principleMarkup() trả về chuỗi (test được trong node); principleSvg() dựng phần tử <svg role="img" aria-label=…>.
 */
import type { HandPrincipleId, HandVariant } from '../../lessons/handTechnique';
import { P, SVG_NS, checkBadge, pauseWhenHidden } from './art/svgKit';
import {
  ARCH,
  BAD,
  DOT,
  GOOD,
  INK,
  archAt,
  archD,
  arrow,
  ball,
  crossBadge,
  dot,
  emoji,
  forearm,
  frontKeys,
  frontX,
  n,
  panelBg,
  ring,
  sideKeys,
  stroke,
  tag,
  tension,
  type Pt,
} from './art/diagramKit';
import { POSTURE_VIEWBOX, postureMarkup } from './postureArt';

export interface PrincipleArt {
  viewBox: string;
  inner: string;
  /** Mô tả cho trình đọc màn hình */
  label: string;
}

export interface ArtOpts {
  /** Tranh nhỏ (hình thu nhỏ): bỏ nhãn chữ / emoji / huy hiệu trong tranh */
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
  .hp-drop { animation: hp-drop 2.6s ease-in infinite; }
  .hp-say1 { animation: hp-say1 2.6s ease-in-out infinite; }
  .hp-say2 { opacity: 0; animation: hp-say2 2.6s ease-in-out infinite; }
  .hp-liftA { animation: hp-liftA 2.4s ease-in-out infinite; }
  .hp-liftB { animation: hp-liftB 2.4s ease-in-out infinite; }
  .hp-glowA { animation: hp-glowA 2.4s ease-in-out infinite; }
  .hp-glowB { animation: hp-glowB 2.4s ease-in-out infinite; }
  .hp-bounce { animation: hp-bounce 1.6s cubic-bezier(.3,.7,.4,1) infinite; }
  .hp-tap { animation: hp-tap 1.6s ease-out infinite; }
  .hp-pulse { animation: hp-pulse 1.6s ease-in-out infinite; }
  @keyframes hp-press { 0%, 20% { transform: translateY(0); } 40%, 62% { transform: translateY(5px); } 82%, 100% { transform: translateY(0); } }
  @keyframes hp-keydown { 0%, 22% { transform: translateY(0); } 40%, 62% { transform: translateY(6px); } 80%, 100% { transform: translateY(0); } }
  @keyframes hp-drop { 0% { transform: translateY(-44px); opacity: 0; } 12% { opacity: 1; } 38% { transform: translateY(0); } 44%, 62% { transform: translateY(5px); } 78% { transform: translateY(-10px); } 92%, 100% { transform: translateY(-44px); opacity: 0; } }
  @keyframes hp-say1 { 0%, 18% { opacity: 0; } 28%, 60% { opacity: 1; } 68%, 100% { opacity: 0; } }
  @keyframes hp-say2 { 0%, 64% { opacity: 0; } 72%, 94% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes hp-liftA { 0%, 55% { transform: translateY(0); } 62%, 88% { transform: translateY(-12px); } 95%, 100% { transform: translateY(0); } }
  @keyframes hp-liftB { 0%, 35% { transform: translateY(-12px); } 42%, 92% { transform: translateY(0); } 98%, 100% { transform: translateY(-12px); } }
  @keyframes hp-glowA { 0%, 55% { opacity: 1; } 62%, 88% { opacity: 0; } 95%, 100% { opacity: 1; } }
  @keyframes hp-glowB { 0%, 35% { opacity: 0; } 42%, 92% { opacity: 1; } 98%, 100% { opacity: 0; } }
  @keyframes hp-bounce { 0%, 8% { transform: translateY(0); } 40% { transform: translateY(-30px); } 72%, 100% { transform: translateY(0); } }
  @keyframes hp-tap { 0%, 4% { transform: translateY(3px); } 14%, 100% { transform: translateY(0); } }
  @keyframes hp-pulse { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) {
    .hp-press, .hp-keydown, .hp-drop, .hp-say1, .hp-say2, .hp-liftA, .hp-liftB, .hp-glowA, .hp-glowB, .hp-bounce, .hp-tap, .hp-pulse { animation: none; }
    .hp-say2 { opacity: 0; }
  }
</style>`;

/** Huy hiệu góc phải trên (to): ✓ hoặc ✗. */
const BADGE_R = 14;
const verdict = (good: boolean, bare?: boolean) => (bare ? '' : good ? checkBadge(W - 21, 21, BADGE_R) : crossBadge(W - 21, 21, BADGE_R));
/**
 * Nhãn chữ nhỏ trong tranh, luôn nằm TRỌN trong khung và tránh VÙNG AN TOÀN của huy hiệu ✓/✗ (góc phải trên).
 * Bề rộng ước lượng giống diagramKit.tag().
 */
export function placeTag(x: number, y: number, text: string, size = 11): [number, number] {
  const w = Math.max(18, text.length * size * 0.56 + 10);
  const top = size * 0.95;
  const bottom = size * 0.55;
  let cx = Math.min(Math.max(x, 6 + w / 2), W - 6 - w / 2);
  const cy = Math.min(Math.max(y, 4 + top), H - 4 - bottom);
  // huy hiệu: tâm (W-21, 21), r 14 + viền → vùng x ≥ W-38, y ≤ 38
  if (cx + w / 2 > W - 38 && cy - top < 38) cx = W - 40 - w / 2;
  return [cx, cy];
}
const label = (bare: boolean | undefined, x: number, y: number, text: string, color: string, size = 12) => {
  if (bare) return '';
  const [cx, cy] = placeTag(x, y, text, size);
  return tag(cx, cy, text, color, size);
};
const emo = (bare: boolean | undefined, x: number, y: number, ch: string, size = 22, cls = '') => (bare ? '' : emoji(x, y, ch, size, cls));

// ───────────────────────────── cảnh NHÌN THẲNG: 5 phím, 5 chấm đầu ngón, cây cầu ─────────────────────────────
const FK = { x0: 30, kw: 36, y: 114, h: 42 } as const;
const fx = (i: number) => frontX(FK.x0, FK.kw, i);
/** Chấm đầu ngón đặt NGỒI trên mặt phím trắng thứ i */
const DOT_R = 11;
const onKey = (i: number, lift = 0): Pt => [fx(i), FK.y - DOT_R - 1.5 - lift];

/** Tham số t của archD có toạ độ x cho trước (giải số — x(t) đơn điệu). */
function tAtX(a: Pt, b: Pt, x: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if ((archAt(a, b, 1, m)[0] - x) * Math.sign(b[0] - a[0]) < 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Cây cầu qua các chấm: nét cong từ chấm `from` tới chấm `to` cao `lift`, "cột cầu" xuống các chấm giữa.
 * Trả về {svg, dưới} — `under` vẽ trước chấm (cột cầu), `over` = nét cầu (vẽ trước chấm để chấm nằm trên chân cầu).
 */
function bridge(tips: Pt[], from: number, to: number, lift: number, w = 10): string {
  const a = tips[from];
  const b = tips[to];
  let s = '';
  for (let i = from + 1; i < to; i++) {
    const p = archAt(a, b, lift, tAtX(a, b, tips[i][0]));
    s += stroke(`M${n(p[0])} ${n(p[1])} L${n(tips[i][0])} ${n(tips[i][1])}`, ARCH, 5);
  }
  return s + stroke(archD(a, b, lift), ARCH, w);
}

/** 1. Cây cầu: khớp gốc cao, năm chấm đứng trên phím ↔ cầu sụp, chấm bẹp. */
function shape(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const keys = frontKeys(FK.x0, FK.y, 5, FK.kw, FK.h);
  if (good) {
    const tips = [0, 1, 2, 3, 4].map((i) => onKey(i));
    return {
      viewBox: VB,
      label: 'Đúng: bàn tay khum tròn như cây cầu cao, năm đầu ngón đứng trên phím',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        keys +
        bridge(tips, 0, 4, 66) +
        tips.map((p, i) => dot(p, i + 1)).join('') +
        label(o.bare, 120, 15, 'cầu cao', GOOD, 13) +
        verdict(true, o.bare),
    };
  }
  // cầu sụp: nét gần như phẳng, võng xuống giữa; ba chấm giữa bị đè bẹp
  const a: Pt = [fx(0), onKey(0)[1] - 8];
  const b: Pt = [fx(4), onKey(4)[1] - 8];
  const flat = (i: number) => `<ellipse cx="${n(fx(i))}" cy="${n(FK.y - 6)}" rx="14" ry="6.5" fill="${DOT}" stroke="${INK}" stroke-width="3"/>`;
  const mid = archAt(a, b, -7, 0.5);
  return {
    viewBox: VB,
    label: 'Chưa đúng: bàn tay bẹp, cây cầu sụp xuống, đầu ngón nằm bẹp',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      keys +
      [1, 2, 3].map(flat).join('') +
      stroke(archD(a, b, -7), ARCH, 10) +
      dot(onKey(0), 1) +
      dot(onKey(4), 5) +
      ring([mid[0], mid[1] + 2], 26, BAD, 'hp-pulse') +
      arrow([mid[0] - 34, 38], [mid[0] - 34, 64], BAD, 3.4) +
      arrow([mid[0] + 34, 38], [mid[0] + 34, 64], BAD, 3.4) +
      label(o.bare, 120, 38, 'cầu sụp', BAD, 13) +
      verdict(false, o.bare),
  };
}

// ───────────────────────────── cảnh NHÌN NGANG: khối cẳng tay → nét bàn tay → chấm đầu ngón trên phím ─────────────────────────────
const SK = { x: 128, y: 122 } as const;
/** Chấm đầu ngón đứng trên mặt phím nhìn ngang */
const SIDE_TIP: Pt = [166, SK.y - 10];

/** 2. Đầu ngón đứng vững (chấm đứng trên mép phím) ↔ khớp đầu gãy (chấm bẹp nằm dài trên phím). */
function tip(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const arm = forearm([78, 74], 80, 22);
  if (good) {
    const hand = stroke(`M78 74 C104 54 140 46 156 62 C166 72 167 88 ${n(SIDE_TIP[0])} ${n(SIDE_TIP[1] - 6)}`, ARCH, 10);
    return {
      viewBox: VB,
      label: 'Đúng: đầu ngón ngay sau móng chạm phím, khớp đầu ngón đứng vững',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        sideKeys({ x: SK.x, y: SK.y, len: 52, keyClass: 'hp-a hp-keydown' }) +
        arm +
        `<g class="hp-a hp-press">${hand}${dot(SIDE_TIP, '', { r: 10 })}</g>` +
        `<path d="M${n(SIDE_TIP[0] + 14)} ${n(SIDE_TIP[1] - 4)} L196 76" stroke="${GOOD}" stroke-width="2" stroke-dasharray="3 3"/>` +
        emo(o.bare, 60, 34, '👆', 26) +
        label(o.bare, 200, 66, 'đầu ngón', GOOD, 13) +
        verdict(true, o.bare),
    };
  }
  const joint: Pt = [150, 98];
  const hand = stroke(`M78 76 C106 62 136 62 146 80 L${n(joint[0])} ${n(joint[1])}`, ARCH, 10);
  const lying = `<ellipse cx="172" cy="${n(SK.y - 6)}" rx="22" ry="6.5" fill="${DOT}" stroke="${INK}" stroke-width="3"/>`;
  const kink = stroke(`M${n(joint[0])} ${n(joint[1])} L156 ${n(SK.y - 7)} L160 ${n(SK.y - 6)}`, ARCH, 9);
  return {
    viewBox: VB,
    label: 'Chưa đúng: khớp đầu ngón bị gãy lõm vào, chạm phím bằng bụng ngón',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      sideKeys({ x: SK.x, y: SK.y, len: 52 }) +
      arm +
      hand +
      kink +
      lying +
      ring(joint, 15, BAD, 'hp-pulse') +
      `<path d="M${n(joint[0] + 12)} ${n(joint[1] - 12)} L196 76" stroke="${BAD}" stroke-width="2" stroke-dasharray="3 3"/>` +
      label(o.bare, 200, 66, 'gãy!', BAD, 13) +
      verdict(false, o.bare),
  };
}

// ───────────────────────────── cảnh NHÌN TỪ TRÊN (ngón cái) ─────────────────────────────
function topKeys(): string {
  let s = `<rect x="14" y="16" width="${W - 28}" height="${H - 34}" rx="8" fill="${P.wood}" stroke="rgba(61,52,102,.42)" stroke-width="1.3"/>`;
  for (let i = 0; i < 7; i++) s += `<rect x="${n(19 + i * 29.7)}" y="21" width="27.2" height="${H - 46}" rx="4" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
  for (const i of [0, 1, 3, 4, 5]) s += `<rect x="${n(19 + (i + 1) * 29.7 - 9)}" y="21" width="16" height="62" rx="3" fill="${P.night}" stroke="${INK}" stroke-width="1.6"/>`;
  return s;
}
const TOP_X = (i: number) => 19 + i * 29.7 + 13.6;
/** Đầu ngón 2–5 (nhìn từ trên) */
const TOP_TIPS: Pt[] = [
  [TOP_X(1), 98],
  [TOP_X(2), 93],
  [TOP_X(3), 97],
  [TOP_X(4), 104],
];

/** 3. Ngón cái: chấm nằm NGHIÊNG ở cạnh phím ↔ chấm thõng ra ngoài mép phím. */
function thumb(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  // cây cầu nhìn từ trên: vòng cung dưới các đầu ngón, cột cầu lên từng chấm
  const a: Pt = [TOP_X(1) - 10, 132];
  const b: Pt = [TOP_X(4) + 8, 134];
  let s = '';
  for (const t of TOP_TIPS) {
    const p = archAt(a, b, 16, tAtX(a, b, t[0]));
    s += stroke(`M${n(p[0])} ${n(p[1])} L${n(t[0])} ${n(t[1])}`, ARCH, 5);
  }
  s += stroke(archD(a, b, 16), ARCH, 9);
  const thumbTip: Pt = good ? [TOP_X(0) - 4, 118] : [TOP_X(0) - 10, H - 10];
  const thumbStroke = stroke(good ? `M${n(a[0])} ${n(a[1])} Q${n(TOP_X(0) + 6)} 136 ${n(thumbTip[0] + 3)} ${n(thumbTip[1] + 6)}` : `M${n(a[0])} ${n(a[1])} L${n(thumbTip[0] + 4)} ${n(thumbTip[1] - 6)}`, ARCH, 6);
  const thumbDot = `<ellipse cx="${n(thumbTip[0])}" cy="${n(thumbTip[1])}" rx="8" ry="12" transform="rotate(${good ? -28 : 0} ${n(thumbTip[0])} ${n(thumbTip[1])})" fill="${DOT}" stroke="${INK}" stroke-width="3"/>` +
    `<text x="${n(thumbTip[0])}" y="${n(thumbTip[1] + 4)}" font-size="12" font-weight="900" font-family="Baloo 2, Nunito, sans-serif" fill="#fff" text-anchor="middle">1</text>`;
  const marks = good
    ? ring(thumbTip, 17, GOOD) + label(o.bare, TOP_X(0) + 34, 160, 'cạnh ngón', GOOD)
    : ring(thumbTip, 15, BAD, 'hp-pulse') + tension([TOP_X(0) + 14, 140], BAD, 0.9) + label(o.bare, TOP_X(0) + 64, 160, 'thõng, cứng', BAD);
  return {
    viewBox: VB,
    label: good
      ? 'Đúng: ngón cái hơi cong, chạm phím bằng cạnh đầu ngón (nhìn từ trên xuống)'
      : 'Chưa đúng: ngón cái duỗi cứng, thõng ra ngoài mép phím (nhìn từ trên xuống)',
    inner:
      STYLE +
      panelBg(W, H, good ? 'good' : 'bad') +
      topKeys() +
      s +
      thumbStroke +
      TOP_TIPS.map((t, i) => dot(t, i + 2, { r: 10 })).join('') +
      thumbDot +
      marks +
      verdict(good, o.bare),
  };
}

/** 4. Cổ tay ngang phím: khối cẳng tay → nét bàn tay thẳng một đường ↔ võng xuống / nhô lên. */
function wrist(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const wr: Pt = [86, 88];
  const dip: Pt = [108, v === 'bad' ? 108 : v === 'bad2' ? 64 : 88];
  const end = `C142 82 ${n(SIDE_TIP[0] - 2)} 80 ${n(SIDE_TIP[0])} ${n(SIDE_TIP[1] - 6)}`;
  const hand = good ? stroke(`M${n(wr[0])} ${n(wr[1])} L120 87 ${end}`, ARCH, 10) : stroke(`M${n(wr[0])} ${n(wr[1])} Q${n(dip[0])} ${n(dip[1] + (v === 'bad' ? 10 : -10))} 124 86 ${end}`, ARCH, 10);
  const line = good
    ? `<path d="M10 64 L150 62" stroke="${GOOD}" stroke-width="3.4" stroke-dasharray="8 6" stroke-linecap="round"/>`
    : `<path d="M10 64 L${n(dip[0])} ${n(dip[1] - 22)} L150 62" stroke="${BAD}" stroke-width="3.4" stroke-dasharray="8 6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const text = good ? 'thẳng hàng' : v === 'bad' ? 'võng xuống' : 'nhô lên';
  const at: Pt = good ? [80, 40] : v === 'bad' ? [80, 150] : [150, 30];
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
      sideKeys({ x: SK.x, y: SK.y, len: 52 }) +
      forearm(wr, 84, 22) +
      hand +
      dot(SIDE_TIP, '', { r: 10 }) +
      line +
      (good ? '' : ring([dip[0], dip[1] + (v === 'bad' ? 4 : -4)], 18, BAD, 'hp-pulse')) +
      label(o.bare, at[0], at[1], text, good ? GOOD : BAD, 13) +
      verdict(good, o.bare),
  };
}

/** 5. Sức nặng cánh tay: quả nặng RƠI xuống phím, chìm tới đáy rồi nảy nhẹ lên ↔ khối cứng bị ấn mạnh, gồng. */
function weight(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const kx = 120;
  const ky = 122;
  const bx = 168;
  if (good) {
    const trail = `<path d="M${bx} 30 V70" stroke="${P.violetLight}" stroke-width="3" stroke-dasharray="4 6" stroke-linecap="round"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: vai thả lỏng, sức nặng cánh tay rơi xuống đáy phím như quả bóng, rồi nhấc nhẹ lên',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        sideKeys({ x: kx, y: ky, len: 60, keyClass: 'hp-a hp-keydown' }) +
        trail +
        `<g class="hp-a hp-drop">${ball([bx, ky - 17], 16)}</g>` +
        emo(o.bare, 66, 76, '⬇️', 30) +
        (o.bare
          ? ''
          : `<g class="hp-say1">${label(false, 66, 38, 'thả ↓', GOOD, 14)}</g><g class="hp-say2">${label(false, 66, 38, 'nhấc ↑', P.indigo, 14)}</g>` +
            label(false, 68, 150, 'chạm đáy phím', P.woodDark, 11)) +
        verdict(true, o.bare),
    };
  }
  const block = `<rect x="${bx - 20}" y="${ky - 42}" width="40" height="36" rx="7" fill="#8c84b8" stroke="${INK}" stroke-width="3"/>` + `<path d="M${bx - 12} ${ky - 33} H${bx + 12}" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`;
  return {
    viewBox: VB,
    label: 'Chưa đúng: vai gồng, ấn mạnh cả cánh tay xuống phím',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      sideKeys({ x: kx, y: ky, len: 60, pressed: true, bed: true }) +
      `<g transform="translate(0 6)">${block}</g>` +
      arrow([bx - 10, 14], [bx - 10, 64], BAD, 4.5) +
      arrow([bx + 12, 14], [bx + 12, 64], BAD, 4.5) +
      tension([bx + 40, 70], BAD, 1) +
      emo(o.bare, 66, 76, '💪', 30) +
      label(o.bare, 66, 38, 'gồng, ấn', BAD, 14) +
      verdict(false, o.bare),
  };
}

/** 6. Ngón nghỉ nằm nhẹ trên phím ↔ một chấm vểnh lên cao. */
function quiet(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  if (good) {
    const tips = [0, 1, 2, 3, 4].map((i) => onKey(i, i === 2 ? -5 : 0));
    return {
      viewBox: VB,
      label: 'Đúng: ngón đang đánh nhấn phím, các ngón nghỉ nằm nhẹ trên phím',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        frontKeys(FK.x0, FK.y, 5, FK.kw, FK.h, { press: (i) => (i === 2 ? 1 : 0), glow: (i) => (i === 2 ? 1 : 0) }) +
        bridge(tips, 0, 4, 58) +
        tips.map((p, i) => dot(p, i + 1, i === 2 ? {} : { fill: '#5d9be0' })).join('') +
        [0, 1, 3, 4].map((i) => `<path d="M${n(fx(i) - 8)} ${n(FK.y + 4)} H${n(fx(i) + 8)}" stroke="${GOOD}" stroke-width="3" stroke-linecap="round"/>`).join('') +
        label(o.bare, 120, 18, 'nằm nhẹ', GOOD, 13) +
        verdict(true, o.bare),
    };
  }
  const tips = [0, 1, 2, 3].map((i) => onKey(i, i === 2 ? -5 : i === 3 ? 10 : 0));
  const up: Pt = [fx(4) + 4, 46];
  const spring = `<path d="M${n(fx(4))} ${n(FK.y - 2)} l-6 -8 l12 -8 l-12 -8 l12 -8 l-6 -6" stroke="${BAD}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0"/>`;
  const a = tips[0];
  const b = tips[3];
  return {
    viewBox: VB,
    label: 'Chưa đúng: ngón út vểnh thẳng lên, ngón áp út co cao khỏi phím',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      frontKeys(FK.x0, FK.y, 5, FK.kw, FK.h, { press: (i) => (i === 2 ? 1 : 0), glow: (i) => (i === 2 ? 1 : 0) }) +
      bridge(tips, 0, 3, 54) +
      stroke(`M${n(archAt(a, b, 54, 0.92)[0])} ${n(archAt(a, b, 54, 0.92)[1])} L${n(up[0])} ${n(up[1])}`, ARCH, 5) +
      spring +
      tips.map((p, i) => dot(p, i + 1)).join('') +
      dot(up, 5) +
      ring(up, 18, BAD, 'hp-pulse') +
      tension([up[0] + 2, up[1] + 26], BAD, 0.9) +
      label(o.bare, up[0] - 40, 16, 'vểnh!', BAD, 13) +
      verdict(false, o.bare),
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

/** 8a. Đàn liền: hai chấm thay nhau GIỮ phím, sóng tiếng liền một dải ↔ nhấc cả hai, sóng đứt quãng. */
function legato(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const x0 = 40;
  const kw = 40;
  const y = 114;
  const at = (i: number): Pt => [frontX(x0, kw, i), y - 12.5];
  const wave = (from: number, to: number, color: string) => {
    let d = `M${from} 44`;
    for (let x = from; x + 14 <= to; x += 14) d += ` q7 -7 14 0`;
    return `<path d="${d}" stroke="${color}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  };
  if (good) {
    // phím sáng luân phiên (luôn có một phím được giữ) + chấm nhấc luân phiên
    const glow = (i: number, cls: string) =>
      `<rect class="hp-a ${cls}" x="${n(x0 + i * kw + 1)}" y="${y}" width="${kw - 2}" height="42" rx="5" fill="${P.sunLight}" stroke="${INK}" stroke-width="2.2"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: đàn liền — ngón sau chạm phím rồi ngón trước mới nhấc, như đi bộ, tiếng nối liền',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        frontKeys(x0, y, 4, kw, 42, { blacks: [0, 2] }) +
        glow(1, 'hp-glowA') +
        glow(2, 'hp-glowB') +
        `<g class="hp-a hp-liftA">${dot(at(1), 2)}</g>` +
        `<g class="hp-a hp-liftB">${dot(at(2), 3)}</g>` +
        wave(30, 202, GOOD) +
        emo(o.bare, 52, 76, '🚶', 26) +
        label(o.bare, 120, 74, 'liền', GOOD, 13) +
        verdict(true, o.bare),
    };
  }
  return {
    viewBox: VB,
    label: 'Chưa đúng: nhấc hết các ngón cùng lúc, giữa hai nốt có khoảng hở im lặng',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      frontKeys(x0, y, 4, kw, 42, { blacks: [0, 2] }) +
      dot([at(1)[0], at(1)[1] - 22], 2) +
      dot([at(2)[0], at(2)[1] - 22], 3) +
      arrow([at(1)[0] - 22, 100], [at(1)[0] - 22, 80], BAD, 3) +
      arrow([at(2)[0] + 22, 100], [at(2)[0] + 22, 80], BAD, 3) +
      wave(30, 100, BAD) +
      wave(142, 202, BAD) +
      ring([121, 44], 16, BAD, 'hp-pulse') +
      label(o.bare, 120, 16, 'hở', BAD, 13) +
      verdict(false, o.bare),
  };
}

/** 8b. Đàn ngắt: chấm chạm phím rồi BẬT lên ngay như quả bóng ↔ ấn cả cánh tay, giữ lâu, nặng nề. */
function staccato(v: HandVariant, o: ArtOpts): PrincipleArt {
  const good = v === 'good';
  const x0 = 60;
  const kw = 40;
  const y = 114;
  const cx = frontX(x0, kw, 1);
  if (good) {
    const bounce = `<path d="M${n(cx + 14)} ${y - 18} Q${n(cx + 40)} 40 ${n(cx + 58)} 70" stroke="${P.violet}" stroke-width="3" stroke-dasharray="4 6" fill="none" stroke-linecap="round"/>`;
    return {
      viewBox: VB,
      label: 'Đúng: đàn ngắt — cổ tay mềm nảy nhẹ, đầu ngón chạm phím rồi bật lên ngay',
      inner:
        STYLE +
        panelBg(W, H, 'good') +
        frontKeys(x0, y, 3, kw, 42, { blacks: [0, 1], keyClass: (i) => (i === 1 ? 'hp-a hp-tap' : '') }) +
        bounce +
        arrow([cx, 66], [cx, 30], P.violet, 3.6) +
        `<g class="hp-a hp-bounce">${dot([cx, y - 12.5], 3)}</g>` +
        emo(o.bare, 46, 50, '🐇', 26) +
        label(o.bare, cx + 58, 84, 'bật!', P.violet, 13) +
        verdict(true, o.bare),
    };
  }
  const arm = forearm([cx - 14, 66], 90, 24, 18);
  return {
    viewBox: VB,
    label: 'Chưa đúng: ấn cả cánh tay xuống, giữ phím lâu, tiếng nặng nề',
    inner:
      STYLE +
      panelBg(W, H, 'bad') +
      frontKeys(x0, y, 3, kw, 42, { blacks: [0, 1], press: (i) => (i === 1 ? 1 : 0), glow: (i) => (i === 1 ? 1 : 0) }) +
      arm +
      stroke(`M${n(cx - 14)} 66 L${n(cx)} ${y - 8}`, ARCH, 10) +
      dot([cx, y - 7], 3) +
      arrow([cx + 30, 18], [cx + 30, 70], BAD, 4.5) +
      arrow([cx + 52, 26], [cx + 52, 74], BAD, 4) +
      `<path d="M${n(cx - 16)} ${y + 54} H${n(cx + 88)}" stroke="${BAD}" stroke-width="5" stroke-linecap="round"/>` +
      label(o.bare, 196, 104, 'nặng nề', BAD, 13) +
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
  const art = ARTS[id](v, opts);
  // tranh thu nhỏ: bỏ cả số trên chấm đầu ngón (quá nhỏ để đọc — chỉ còn hình)
  return opts.bare ? { ...art, inner: art.inner.replace(/<text[^>]*>\d<\/text>/g, '') } : art;
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
