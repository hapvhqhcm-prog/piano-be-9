/**
 * Tranh cho STICKER BẤT NGỜ 🎁 (lessons/bonusStickers.ts): huy hiệu tròn bế viền trắng giống sticker thường,
 * hình ở giữa là emoji to (rô-bốt, siêu nhân, khủng long…). Và QUẢ TRỨNG BÍ ẨN có vết nứt lộ dần sau mỗi lần chạm.
 */
import type { BonusDef } from '../../../lessons/bonusStickers';
import { P, sparkle, svgRoot, uid } from './svgKit';

/** SVG sticker bất ngờ 120×120 (kích thước đặt bằng CSS). */
export function bonusStickerArt(d: BonusDef): SVGSVGElement {
  const g = uid('bon-g');
  const inner = `<defs><radialGradient id="${g}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${d.bg[0]}"/><stop offset="1" stop-color="${d.bg[1]}"/></radialGradient></defs>
    <ellipse cx="60" cy="114" rx="38" ry="4.5" fill="${P.ink}" opacity=".12"/>
    <circle cx="60" cy="60" r="55" fill="#fff" stroke="${P.ink}" stroke-opacity=".12" stroke-width="1.5"/>
    <circle cx="60" cy="60" r="47" fill="url(#${g})" stroke="${P.ink}" stroke-opacity=".18" stroke-width="2"/>
    <path d="M24 44 A40 40 0 0 1 52 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>
    <text x="60" y="78" text-anchor="middle" font-size="50">${d.emoji}</text>
    ${sparkle(98, 24, 6, P.sun)}`;
  return svgRoot('0 0 120 120', 'sticker-art earned kind-bonus', inner);
}

/** Quả trứng bí ẩn: `cracks` = 0..2 vết nứt đã lộ (lần chạm thứ 3 thì nở). */
export function eggArt(cracks: number): SVGSVGElement {
  const g = uid('egg-g');
  const crack1 = `<path d="M30 70 l10 -8 l7 9 l9 -10 l8 8" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const crack2 = `<path d="M64 69 l9 -9 l8 7 l7 -6 M47 71 l-3 12 l7 6" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const inner = `<defs><radialGradient id="${g}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fffdf5"/><stop offset=".7" stop-color="#ffeec2"/><stop offset="1" stop-color="#f6cf72"/></radialGradient></defs>
    <ellipse cx="60" cy="114" rx="30" ry="5" fill="${P.ink}" opacity=".14"/>
    <path d="M60 8 C88 8 104 52 104 74 C104 98 86 112 60 112 C34 112 16 98 16 74 C16 52 32 8 60 8 Z" fill="url(#${g})" stroke="${P.sandDark}" stroke-width="2.5"/>
    <circle cx="42" cy="44" r="7" fill="${P.violetLight}"/><circle cx="76" cy="36" r="5" fill="${P.mint}"/>
    <circle cx="80" cy="88" r="8" fill="${P.coralLight}"/><circle cx="38" cy="92" r="5" fill="${P.sun}"/>
    <path d="M38 26 q8 -10 18 -12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <text x="60" y="80" text-anchor="middle" font-size="30" font-weight="800" fill="${P.violet}" font-family="system-ui,sans-serif" opacity=".55">?</text>
    ${cracks >= 1 ? crack1 : ''}${cracks >= 2 ? crack2 : ''}`;
  return svgRoot('0 0 120 120', 'egg-art', inner);
}
