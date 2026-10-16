/**
 * (+ 2026-10-16) Tranh "📍 Tìm Đô giữa trên đàn thật" (thuần chuỗi SVG — test được trong node; cùng bảng màu / nét với
 * handKit): đàn piano cơ 88 phím nhìn từ trên (nắp phím, TÊN HÃNG + ổ khóa ở giữa), Đô giữa (C4 — phím trắng thứ 24 từ
 * trái) tô vàng + mũi tên từ tên hãng xuống; ô phóng to La3–Sol4: nhóm 2 phím đen khoanh tròn, Đô giữa ngay bên trái nhóm.
 */
import { BAD, OUTLINE, arrow, n, tag } from './handKit';
import { P, sparkle, svgRoot } from './svgKit';

export const ART_W = 640;
export const ART_H = 300;
/** Số phím trắng của đàn 88 phím (La0 … Đô8). */
export const WHITE_KEYS = 52;
/** Chỉ số phím trắng của Đô giữa (La0 = 0, Si0 = 1, Đô1 = 2 … Đô4 = 2 + 3·7). */
export const MIDDLE_C_WHITE = 23;

/** Phím trắng `i` (La0 = 0) có phím đen ngay bên phải? (sau La, Đô, Rê, Fa, Sol — trừ Đô8 cuối đàn). */
export function blackAfter(i: number): boolean {
  if (i >= WHITE_KEYS - 1) return false;
  const letter = 'ABCDEFG'[i % 7];
  return letter !== 'B' && letter !== 'E';
}

/** Chuỗi SVG (bên trong thẻ <svg>) — `flash`: Đô giữa nhấp nháy nhẹ (class CSS). */
export function middleCArtMarkup(opts: { found?: boolean } = {}): string {
  const x0 = 24;
  const kbW = ART_W - 2 * x0;
  const kw = kbW / WHITE_KEYS;
  const ky = 78;
  const kh = 52;
  const parts: string[] = [];
  // Thân đàn (đen bóng) + nắp phím
  parts.push(`<rect x="10" y="14" width="${ART_W - 20}" height="${ky + kh - 6}" rx="10" fill="${P.night}" stroke="${OUTLINE}" stroke-width="1.5"/>`);
  parts.push(`<rect x="16" y="20" width="${ART_W - 32}" height="${ky - 26}" rx="6" fill="#3a3366"/>`);
  // Tên hãng đàn + ổ khóa (giữa nắp đàn)
  const cx = ART_W / 2;
  parts.push(`<text x="${cx}" y="42" font-size="15" font-weight="800" letter-spacing="3" font-family="Baloo 2, Nunito, sans-serif" fill="${P.sunLight}" text-anchor="middle">TÊN HÃNG</text>`);
  parts.push(`<g transform="translate(${cx} 56)"><circle r="4.2" fill="${P.sun}"/><rect x="-1.3" y="0" width="2.6" height="6" rx="1" fill="${P.sun}"/></g>`);
  // Phím trắng
  const mcX = x0 + MIDDLE_C_WHITE * kw;
  for (let i = 0; i < WHITE_KEYS; i++) {
    const on = i === MIDDLE_C_WHITE;
    parts.push(`<rect x="${n(x0 + i * kw)}" y="${ky}" width="${n(kw)}" height="${kh}" fill="${on ? P.sun : '#fff'}" stroke="${OUTLINE}" stroke-width="0.8"${on ? ' class="mc-key"' : ''}/>`);
  }
  // Phím đen
  for (let i = 0; i < WHITE_KEYS; i++) {
    if (!blackAfter(i)) continue;
    const bw = kw * 0.62;
    parts.push(`<rect x="${n(x0 + (i + 1) * kw - bw / 2)}" y="${ky}" width="${n(bw)}" height="${n(kh * 0.6)}" rx="1.2" fill="${P.ink}"/>`);
  }
  // Mũi tên: từ ổ khóa / tên hãng xuống Đô giữa
  parts.push(arrow([cx - 12, 60], [mcX + kw / 2 + 2, ky - 3], P.sun, 3));
  parts.push(tag(mcX + kw / 2, ky + kh + 16, 'Đô giữa', P.indigoDark, 13));
  // Khung "phóng to" quanh vùng Đô giữa trên bàn phím lớn
  const zA = x0 + (MIDDLE_C_WHITE - 2) * kw;
  const zB = x0 + (MIDDLE_C_WHITE + 5) * kw;
  parts.push(`<rect x="${n(zA - 1)}" y="${ky - 2}" width="${n(zB - zA + 2)}" height="${kh + 4}" rx="3" fill="none" stroke="${P.violet}" stroke-width="2"/>`);
  // Ô phóng to: La3 … Sol4 (7 phím trắng)
  const iy = 172;
  const ih = 112;
  const iw = 50;
  const ix = cx - (7 * iw) / 2;
  parts.push(`<path d="M${n(zA)} ${ky + kh + 2} L${n(ix)} ${iy} M${n(zB)} ${ky + kh + 2} L${n(ix + 7 * iw)} ${iy}" stroke="${P.violetLight}" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/>`);
  parts.push(`<rect x="${n(ix - 8)}" y="${iy - 8}" width="${7 * iw + 16}" height="${ih + 16}" rx="12" fill="#f7f4ff" stroke="${P.violet}" stroke-width="2"/>`);
  const names = ['La', 'Si', 'Đô', 'Rê', 'Mi', 'Fa', 'Sol'];
  for (let k = 0; k < 7; k++) {
    const on = k === 2;
    parts.push(`<rect x="${n(ix + k * iw)}" y="${iy}" width="${iw}" height="${ih}" rx="3" fill="${on ? (opts.found ? P.mintLight : P.sun) : '#fff'}" stroke="${OUTLINE}" stroke-width="1.2"${on ? ' class="mc-key"' : ''}/>`);
    parts.push(`<text x="${n(ix + k * iw + iw / 2)}" y="${iy + ih - 10}" font-size="13" font-weight="700" font-family="Baloo 2, Nunito, sans-serif" fill="${on ? P.ink : P.stoneDark}" text-anchor="middle">${names[k]}</text>`);
  }
  // Phím đen trong ô phóng to: sau La, Đô, Rê, Fa (k = 0, 2, 3, 5)
  const bw = iw * 0.6;
  for (const k of [0, 2, 3, 5]) parts.push(`<rect x="${n(ix + (k + 1) * iw - bw / 2)}" y="${iy}" width="${n(bw)}" height="${n(ih * 0.6)}" rx="3" fill="${P.ink}"/>`);
  // Nhóm 2 phím đen (Đô thăng, Rê thăng) — khoanh tròn
  const gx = ix + 3.5 * iw;
  parts.push(`<ellipse cx="${n(gx)}" cy="${n(iy + ih * 0.3)}" rx="${n(iw * 1.25)}" ry="${n(ih * 0.4)}" fill="none" stroke="${P.mint}" stroke-width="3" stroke-dasharray="7 5"/>`);
  parts.push(tag(gx + iw * 1.9, iy + 14, '2 phím đen', P.grassDark, 12));
  // Đô giữa: nhãn bên trái ô phóng to + mũi tên chỉ vào phím (dưới phím đen, trên tên nốt)
  const cX = ix + 2.5 * iw;
  const ay = iy + ih * 0.72;
  parts.push(tag(ix - 62, ay, 'Đô giữa', opts.found ? P.grassDark : P.indigoDark, 14));
  parts.push(arrow([ix - 22, ay], [cX - 12, ay], opts.found ? P.good : BAD, 3));
  if (opts.found) parts.push(sparkle(cX + 16, iy + ih * 0.55, 9, P.sun), sparkle(cX - 18, iy + ih * 0.5, 6, P.sun));
  return parts.join('');
}

export function middleCArt(opts: { found?: boolean } = {}): SVGSVGElement {
  return svgRoot(`0 0 ${ART_W} ${ART_H}`, 'mc-art', middleCArtMarkup(opts));
}
