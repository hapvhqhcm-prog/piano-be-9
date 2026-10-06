/**
 * Biểu tượng đảo cho bản đồ các tuần (giáo trình v5.1: 31 tuần): mỗi tuần một hòn đảo nhỏ vẽ theo chủ đề (đảo phím đen, làng Đô Rê Mi,
 * cầu thang Sol, rừng nhịp, sân khấu…). Dựng từ khối chung: nền đảo + đồ vật theo chủ đề.
 *
 *  - 'done'    : đủ màu + ngôi sao nhỏ ở góc
 *  - 'current' : đủ màu (màn hình bản đồ tự thêm hiệu ứng phát sáng)
 *  - 'locked'  : bóng mờ nhạt màu + ổ khóa nhỏ
 *
 * viewBox 96×80, vài chục nét mỗi đảo — nhẹ để vẽ 25 cái cùng lúc.
 */
import { P, beamedNotes, noteGlyph, sparkle, starPath, svgRoot, uid } from './svgKit';

export type IslandState = 'done' | 'current' | 'locked';

type Base = 'grass' | 'sand' | 'snow' | 'rock' | 'sea';

/* ---------- Khối chung ---------- */

function base(kind: Base): string {
  const top = { grass: P.grass, sand: P.sand, snow: '#eef3ff', rock: P.stone, sea: P.water }[kind];
  const side = kind === 'sand' ? P.sandDark : kind === 'rock' ? P.stoneDark : P.sand;
  const sea = kind === 'sea';
  return `
    <ellipse cx="48" cy="68" rx="45" ry="9" fill="${P.water}" opacity=".35" stroke="none"/>
    <path d="M18 70 q4 -2 8 0 M68 72 q4 -2 8 0" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M12 52 Q13 68 48 71 Q83 68 84 52 Z" fill="${side}"/>
    <path d="M14 58 Q30 66 48 66.5 Q66 66 82 58" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="48" cy="52" rx="36" ry="10" fill="${top}"/>
    ${sea ? `<path d="M30 52 q4 -2 8 0 q4 2 8 0 M52 56 q4 -2 8 0 q4 2 8 0" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/>` : `<ellipse cx="40" cy="48.5" rx="17" ry="3.6" fill="#fff" opacity=".28" stroke="none"/>`}`;
}

const tree = (x: number, y: number, r: number, c: string) =>
  `<rect x="${x - 1.6}" y="${y - r * 0.9}" width="3.2" height="${r * 0.9}" rx="1.4" fill="${P.wood}"/>` +
  `<circle cx="${x}" cy="${y - r * 1.25}" r="${r}" fill="${c}"/>` +
  `<circle cx="${x - r * 0.35}" cy="${y - r * 1.55}" r="${r * 0.3}" fill="#fff" opacity=".3" stroke="none"/>`;

const pine = (x: number, y: number, hgt: number, c: string) => {
  const w = hgt * 0.42;
  return (
    `<rect x="${x - 1.5}" y="${y - 4}" width="3" height="4" fill="${P.wood}"/>` +
    `<path d="M${x} ${y - hgt} L${x + w * 0.7} ${y - hgt * 0.5} H${x + w * 0.35} L${x + w} ${y - 3} H${x - w} L${x - w * 0.35} ${y - hgt * 0.5} H${x - w * 0.7} Z" fill="${c}"/>`
  );
};

const flag = (x: number, y: number, c: string) =>
  `<path d="M${x} ${y} V${y - 12}" stroke="${P.ink}" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/>` +
  `<path d="M${x} ${y - 12} L${x + 9} ${y - 9} L${x} ${y - 6} Z" fill="${c}"/>`;

const mountain = (x1: number, peakX: number, peakY: number, x2: number, y: number, c: string) => {
  const capY = peakY + (y - peakY) * 0.3;
  const lx = peakX - (peakX - x1) * 0.3;
  const rx = peakX + (x2 - peakX) * 0.3;
  return (
    `<path d="M${x1} ${y} L${peakX} ${peakY} L${x2} ${y} Z" fill="${c}"/>` +
    `<path d="M${lx} ${capY} L${peakX} ${peakY} L${rx} ${capY} L${rx - (rx - peakX) * 0.4} ${capY - 2} L${peakX} ${capY + 2} L${lx + (peakX - lx) * 0.4} ${capY - 2} Z" fill="#fff"/>`
  );
};

const burst = (x: number, y: number, r: number, c: string) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d += `M${(x + Math.cos(a) * r * 0.45).toFixed(1)} ${(y + Math.sin(a) * r * 0.45).toFixed(1)} L${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)} `;
  }
  return `<path d="${d}" stroke="${c}" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="1.6" fill="${c}" stroke="none"/>`;
};

/* ---------- Đồ vật theo tuần ---------- */

const PROPS: Record<number, { base: Base; art: string }> = {
  // 1 · Đảo Phím Đen — cây dừa + bàn phím nhỏ (sinh đôi, sinh ba)
  1: {
    base: 'grass',
    art: `
      <path d="M26 53 Q23 38 29 25" fill="none" stroke="${P.wood}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M29 25 q-13 -5 -19 4 q10 -4 19 -4 Z M29 25 q12 -9 20 -1 q-10 -3 -20 1 Z M29 25 q1 -13 -10 -15 q5 6 10 15 Z M29 25 q8 2 12 10 q-6 -6 -12 -10 Z" fill="${P.grassDark}"/>
      <circle cx="28" cy="27" r="2.2" fill="${P.woodDark}"/><circle cx="31.5" cy="27.5" r="2" fill="${P.woodDark}"/>
      <rect x="42" y="37" width="31.5" height="16" rx="2.5" fill="#fff"/>
      <path d="M46.5 38 V53 M51 38 V53 M55.5 38 V53 M60 38 V53 M64.5 38 V53 M69 38 V53" stroke="${P.ink}" stroke-opacity=".25" stroke-width=".8"/>
      <g fill="${P.night}" stroke="none"><rect x="45" y="37" width="3" height="9" rx=".8"/><rect x="49.5" y="37" width="3" height="9" rx=".8"/><rect x="58.5" y="37" width="3" height="9" rx=".8"/><rect x="63" y="37" width="3" height="9" rx=".8"/><rect x="67.5" y="37" width="3" height="9" rx=".8"/></g>`,
  },
  // 2 · Làng Đô Rê Mi — ba ngôi nhà cao dần
  2: {
    base: 'grass',
    art: [
      [22, 13, P.coral, P.indigo],
      [40, 18, P.sun, P.violet],
      [58, 23, P.mint, P.indigo],
    ]
      .map(([x, hh, c, r]) => {
        const X = x as number;
        const H = hh as number;
        return `<rect x="${X}" y="${53 - H}" width="15" height="${H}" rx="1.5" fill="${c}"/>
          <path d="M${X - 2.5} ${54 - H} L${X + 7.5} ${45 - H} L${X + 17.5} ${54 - H} Z" fill="${r}"/>
          <rect x="${X + 5}" y="${46}" width="5" height="7" rx="2.5" fill="${P.woodDark}"/>
          <rect x="${X + 4.5}" y="${57 - H}" width="6" height="4.5" rx="1" fill="#fff" opacity=".85"/>`;
      })
      .join(''),
  },
  // 3 · Cầu thang Sol — 5 bậc cầu vồng + nốt nhạc trên đỉnh
  3: {
    base: 'grass',
    art:
      [P.coral, P.orange, P.sun, P.mint, P.violet]
        .map((c, i) => `<rect x="${23 + i * 10}" y="${48 - i * 6.5}" width="10" height="${6 + i * 6.5}" rx="1.5" fill="${c}"/>`)
        .join('') + noteGlyph(70, 16, 3.4, P.indigo),
  },
  // 4 · Rừng Nhịp — cây tròn + trống nhỏ
  4: {
    base: 'grass',
    art: `${tree(26, 50, 10, P.grassDark)}${tree(68, 50, 12, P.mint)}
      <rect x="40" y="40" width="17" height="13" rx="2" fill="${P.coral}"/>
      <ellipse cx="48.5" cy="40" rx="8.5" ry="3" fill="${P.sunLight}"/>
      <path d="M40.5 43 l4 8 l4 -8 l4 8 l4 -8" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M44 33 l3 6 M55 32 l-3 6" stroke="${P.woodDark}" stroke-width="2" stroke-linecap="round"/>`,
  },
  // 5 · Sân khấu nhỏ — lều xiếc sọc
  5: {
    base: 'grass',
    art: `
      <rect x="30" y="34" width="36" height="19" rx="1.5" fill="${P.sunLight}"/>
      <path d="M43 53 L48 38 L53 53 Z" fill="${P.indigoDark}"/>
      <path d="M26 35 L48 15 L70 35 Q64.5 38 59 35 Q53.5 38 48 35 Q42.5 38 37 35 Q31.5 38 26 35 Z" fill="${P.coral}"/>
      <path d="M48 15 L41 35.5 M48 15 L55 35.5" stroke="#fff" stroke-width="3"/>
      ${flag(48, 15, P.sun)}`,
  },
  // 6 · Hồ Tấm Gương — cây soi bóng xuống hồ
  6: {
    base: 'grass',
    art: `
      <ellipse cx="48" cy="54.5" rx="24" ry="6" fill="${P.water}"/>
      ${tree(48, 50, 10, P.grassDark)}
      <ellipse cx="48" cy="57" rx="7" ry="2.4" fill="${P.grassDark}" opacity=".35" stroke="none"/>
      ${sparkle(34, 55, 2.4, '#fff')}${sparkle(62, 53.5, 2, '#fff')}
      ${sparkle(70, 24, 3.2, P.sun)}`,
  },
  // 7 · Thư viện Nốt — chồng sách + nốt nhạc
  7: {
    base: 'grass',
    art: `
      <rect x="29" y="45" width="38" height="8" rx="1.5" fill="${P.coral}"/><path d="M31 49 H65" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
      <rect x="32" y="37" width="32" height="8" rx="1.5" fill="${P.indigo}"/><path d="M34 41 H62" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
      <rect x="30" y="29" width="34" height="8" rx="1.5" fill="${P.mint}"/><path d="M32 33 H62" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
      ${noteGlyph(46, 22, 3.6, P.violet)}`,
  },
  // 8 · Lâu đài Âm nhạc
  8: {
    base: 'grass',
    art: `
      <rect x="34" y="30" width="28" height="23" fill="${P.lavender}"/>
      <path d="M34 30 v-4 h4 v4 h4 v-4 h4 v4 h4 v-4 h4 v4 h4 v-4 h4 v4" fill="${P.lavender}"/>
      <rect x="25" y="26" width="11" height="27" rx="1" fill="#fff"/><rect x="60" y="26" width="11" height="27" rx="1" fill="#fff"/>
      <path d="M23.5 27 L30.5 12 L37.5 27 Z M58.5 27 L65.5 12 L72.5 27 Z" fill="${P.violet}"/>
      <path d="M43 53 V44 a5 5 0 0 1 10 0 V53 Z" fill="${P.indigoDark}"/>
      <circle cx="30.5" cy="35" r="2" fill="${P.indigo}"/><circle cx="65.5" cy="35" r="2" fill="${P.indigo}"/>
      ${flag(65.5, 12, P.sun)}`,
  },
  // 9 · Cầu Hai Tay — cầu vòm qua suối
  9: {
    base: 'grass',
    art: `
      <path d="M41 43 Q45 52 40 62 L57 62 Q52 52 55 43 Z" fill="${P.water}"/>
      <path d="M20 52 Q48 18 76 52" fill="none" stroke="${P.woodDark}" stroke-width="7" stroke-linecap="round"/>
      <path d="M20 52 Q48 18 76 52" fill="none" stroke="${P.wood}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M22 42 Q48 10 74 42" fill="none" stroke="${P.violet}" stroke-width="2" stroke-linecap="round"/>
      <path d="M30 40.5 V35 M39 34.5 V27 M48 32 V25.5 M57 34.5 V27 M66 40.5 V35" stroke="${P.violet}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  // 10 · Thung lũng Song Ca — hai quả đồi, hai chú chim hót
  10: {
    base: 'grass',
    art: `
      <path d="M14 53 Q28 22 48 50 Q66 26 82 53 Z" fill="${P.mint}"/>
      <circle cx="29" cy="31" r="5" fill="${P.coral}"/><path d="M33.5 30 l4 1.4 l-4 1.4 Z" fill="${P.orange}"/><circle cx="30.5" cy="29.5" r=".9" fill="${P.ink}" stroke="none"/>
      <circle cx="67" cy="33" r="5" fill="${P.sun}"/><path d="M62.5 32 l-4 1.4 l4 1.4 Z" fill="${P.orange}"/><circle cx="65.5" cy="31.5" r=".9" fill="${P.ink}" stroke="none"/>
      ${beamedNotes(43, 22, 2.6, P.violet)}`,
  },
  // 11 · Núi Sol — núi tuyết cắm cờ
  11: {
    base: 'grass',
    art: `${mountain(18, 46, 13, 78, 53, P.stoneDark)}<path d="M46 13 L78 53 H58 Z" fill="${P.ink}" opacity=".12" stroke="none"/>${flag(46, 13, P.coral)}${noteGlyph(70, 22, 2.6, P.indigo)}`,
  },
  // 12 · Vũ hội Valse — nhà vòm khiêu vũ
  12: {
    base: 'grass',
    art: `
      <ellipse cx="48" cy="51" rx="21" ry="4" fill="#fff"/>
      <path d="M32 50 V32 M42 51 V32 M54 51 V32 M64 50 V32" stroke="${P.ink}" stroke-opacity=".3" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M32 50 V32 M42 51 V32 M54 51 V32 M64 50 V32" stroke="#fff" stroke-opacity="1" stroke-width="3" stroke-linecap="round"/>
      <path d="M26 33 Q30 14 48 12 Q66 14 70 33 Z" fill="${P.coral}"/>
      <path d="M26 33 H70" stroke="${P.sun}" stroke-width="3" stroke-linecap="round"/>
      <path d="M48 12 V6" stroke="${P.sun}" stroke-width="2" stroke-linecap="round"/><circle cx="48" cy="5" r="2" fill="${P.sun}"/>
      <circle cx="44" cy="45" r="1.6" fill="${P.violet}" stroke="none"/><circle cx="48" cy="42" r="1.6" fill="${P.violet}" stroke="none"/><circle cx="52" cy="45" r="1.6" fill="${P.violet}" stroke="none"/>`,
  },
  // 13 · Hang Phím Đen — hang đá có "răng" phím đen + dơi
  13: {
    base: 'grass',
    art: `
      <path d="M17 53 Q16 24 48 19 Q80 24 79 53 Z" fill="${P.stone}"/>
      <path d="M33 53 Q32 31 48 30 Q64 31 63 53 Z" fill="#5a4b92"/>
      <g fill="${P.night}" stroke="#fff" stroke-opacity=".5" stroke-width=".8"><rect x="38" y="31" width="4" height="9" rx="1"/><rect x="44" y="30" width="4" height="9" rx="1"/><rect x="52" y="30.5" width="4" height="9" rx="1"/></g>
      <path d="M48 12 q-3 -4 -7 -3 q2 2 1 4 q3 -1 6 -1 q3 0 6 1 q-1 -2 1 -4 q-4 -1 -7 3 Z" fill="${P.night}"/>`,
  },
  // 14 · Sa mạc Nhịp Chấm — xương rồng + nốt có chấm
  14: {
    base: 'sand',
    art: `
      <path d="M32 53 V26 a4 4 0 0 1 8 0 V53 Z" fill="${P.grassDark}"/>
      <path d="M32 40 h-4 a3 3 0 0 1 -3 -3 v-6 a2.5 2.5 0 0 1 5 0 v4 h2 Z M40 36 h4 v-7 a2.5 2.5 0 0 1 5 0 v8 a3 3 0 0 1 -3 3 h-6 Z" fill="${P.grassDark}"/>
      <circle cx="36" cy="24" r="2.4" fill="${P.pink}"/>
      ${noteGlyph(60, 44, 4, P.indigo)}<circle cx="70" cy="43" r="2" fill="${P.indigo}" stroke="none"/>
      <circle cx="74" cy="16" r="6" fill="${P.sun}"/>`,
  },
  // 15 · Thác Gam — nước chảy xuống từng bậc đá
  15: {
    base: 'grass',
    art: `
      <path d="M18 53 V19 Q18 16 21 16 H35 V27 H48 V37 H61 V53 Z" fill="${P.stoneDark}"/>
      <path d="M29 17 V30 H42 V40 H55 V53" fill="none" stroke="${P.water}" stroke-width="6.5" stroke-linejoin="round"/>
      <path d="M28 20 V28 M41 32 V38 M54 42 V50" stroke="#fff" stroke-opacity=".8" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="58" cy="52" r="3" fill="#fff" opacity=".85"/><circle cx="63" cy="51" r="2" fill="#fff" opacity=".85"/><circle cx="52" cy="51.5" r="2.2" fill="#fff" opacity=".85"/>
      ${tree(72, 51, 7, P.grassDark)}`,
  },
  // 16 · Nhà hát Cấp 2 — rèm đỏ và mái tam giác
  16: {
    base: 'grass',
    art: `
      <rect x="26" y="27" width="44" height="26" rx="1.5" fill="${P.sunLight}"/>
      <path d="M22 28 L48 11 L74 28 Z" fill="${P.violet}"/>
      <path d="${starPath(48, 21.5, 4.2)}" fill="${P.sun}"/>
      <path d="M33 53 V33 H63 V53 Z" fill="${P.indigoDark}"/>
      <path d="M33 33 H48 Q42 42 38 53 H33 Z M63 33 H48 Q54 42 58 53 H63 Z" fill="#e8455f"/>
      <path d="M33 33 H63" stroke="${P.sun}" stroke-width="2.2"/>`,
  },
  // 17 · Rừng Hợp Âm — ba cây thông + hợp âm 3 nốt
  17: {
    base: 'grass',
    art: `${pine(28, 54, 28, P.grassDark)}${pine(46, 54, 36, '#3e9d6a')}${pine(64, 54, 26, P.mint)}
      <g fill="${P.violet}" stroke="none"><ellipse cx="76" cy="30" rx="3.2" ry="2.4" transform="rotate(-20 76 30)"/><ellipse cx="76" cy="24.5" rx="3.2" ry="2.4" transform="rotate(-20 76 24.5)"/><ellipse cx="76" cy="19" rx="3.2" ry="2.4" transform="rotate(-20 76 19)"/></g>
      <path d="M79 30 V9" stroke="${P.violet}" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  // 18 · Biển Đổi Thế — thuyền buồm
  18: {
    base: 'sea',
    art: `
      <path d="M48 45 V14" stroke="${P.woodDark}" stroke-width="2" stroke-linecap="round"/>
      <path d="M49.5 15 L68 42 H49.5 Z" fill="#fff"/>
      <path d="M46.5 20 L32 42 H46.5 Z" fill="${P.sunLight}"/>
      <path d="M48 14 l8 2.5 l-8 2.5 Z" fill="${P.coral}"/>
      <path d="M28 45 H70 L64 54 Q48 56 33 54 Z" fill="${P.coral}"/>
      <path d="M31 48 H67" stroke="#fff" stroke-width="1.6"/>`,
  },
  // 19 · Thung lũng Vui Buồn — mặt trời và mặt trăng
  19: {
    base: 'grass',
    art: `
      <path d="M14 53 Q30 28 48 50 Q66 30 82 53 Z" fill="${P.mint}"/>
      <circle cx="28" cy="20" r="7" fill="${P.sun}"/>
      <path d="M28 9 V11 M28 29 V31 M17 20 H19 M37 20 H39 M20 12 l1.5 1.5 M34.5 26.5 l1.5 1.5 M20 28 l1.5 -1.5 M34.5 13.5 l1.5 -1.5" stroke="${P.orange}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M70 12 a8.5 8.5 0 1 0 6 14 a7 7 0 1 1 -6 -14 Z" fill="${P.violetLight}"/>
      ${sparkle(58, 14, 2.4, P.violetLight)}`,
  },
  // 20 · Tháp Nốt Cao — tháp sọc cao vút
  20: {
    base: 'grass',
    art: `
      <path d="M39 53 L42.5 16 H53.5 L57 53 Z" fill="#fff"/>
      <path d="M41.6 25 H54.4 L55.3 34 H40.7 Z M39.9 43 H56.1 L57 53 H39 Z" fill="${P.coral}"/>
      <path d="M40.5 16.5 H55.5" stroke="${P.indigo}" stroke-width="3" stroke-linecap="round"/>
      <path d="M43 15 Q43 6 48 4 Q53 6 53 15 Z" fill="${P.violet}"/>
      <rect x="46" y="18.5" width="4" height="5" rx="2" fill="${P.sun}"/>
      ${noteGlyph(66, 18, 3, P.indigo)}${noteGlyph(28, 30, 2.4, P.violet)}`,
  },
  // 21 · Cung điện Minuet — mái vòm củ hành + vương miện
  21: {
    base: 'grass',
    art: `
      <rect x="24" y="33" width="48" height="20" rx="1.5" fill="${P.sunLight}"/>
      <path d="M40 33 Q38 22 48 15 Q58 22 56 33 Z" fill="${P.violet}"/>
      <path d="M24 33 Q23 26 28.5 22 Q34 26 33 33 Z M63 33 Q62 26 67.5 22 Q73 26 72 33 Z" fill="${P.indigo}"/>
      <path d="M42 13 L43 7 L45.6 10 L48 6 L50.4 10 L53 7 L54 13 Z" fill="${P.sun}"/>
      <path d="M44 53 V45 a4 4 0 0 1 8 0 V53 Z" fill="${P.indigoDark}"/>
      <path d="M28 39 V45 M34 39 V45 M62 39 V45 M68 39 V45" stroke="${P.violet}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  // 22 · Vườn Beethoven — vòm hoa hồng
  22: {
    base: 'grass',
    art: `
      <path d="M28 53 V33 Q48 10 68 33 V53" fill="none" stroke="${P.grassDark}" stroke-width="3.2" stroke-linecap="round"/>
      ${[
        [28, 38],
        [31, 28],
        [39, 21],
        [48, 18.5],
        [57, 21],
        [65, 28],
        [68, 38],
        [28, 47],
        [68, 47],
      ]
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.3" fill="${i % 2 ? P.pink : '#e8455f'}"/>`)
        .join('')}
      <ellipse cx="48" cy="51" rx="9" ry="4" fill="${P.grassDark}"/>
      ${noteGlyph(46, 40, 3, P.indigo)}`,
  },
  // 23 · Thư viện Lớn — toà nhà cột cổ điển
  23: {
    base: 'grass',
    art: `
      <rect x="24" y="49" width="48" height="4" rx="1" fill="#fff"/>
      <rect x="27" y="29" width="42" height="20" fill="${P.lavender}"/>
      <path d="M31 30 V48 M39 30 V48 M48 30 V48 M57 30 V48 M65 30 V48" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <path d="M22 29 L48 13 L74 29 Z" fill="${P.indigo}"/>
      <path d="M43 24 h10 v-4 h-10 Z" fill="#fff"/><path d="M48 20 V24" stroke="${P.indigo}" stroke-width=".8"/>`,
  },
  // 24 · Đỉnh Hai Tay — hai đỉnh núi tuyết
  24: {
    base: 'snow',
    art: `${mountain(16, 36, 18, 58, 53, P.stone)}${mountain(36, 60, 10, 82, 53, P.stoneDark)}${flag(60, 10, P.coral)}${sparkle(24, 14, 2.6, P.sun)}`,
  },
  // 25 · Đại hòa nhạc — đàn grand + pháo hoa
  25: {
    base: 'grass',
    art: `
      ${burst(22, 16, 9, P.coral)}${burst(76, 13, 8, P.mint)}${burst(52, 8, 6, P.sun)}
      <path d="M24 30 L54 10 Q58 8 60 12 L64 24 Z" fill="#4a3f8a"/>
      <path d="M44 30 L55 16" stroke="${P.sun}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M22 30 H46 Q52 30 55 25 Q59 20 66 20 Q75 20 75 29 Q75 38 66 40 H22 Z" fill="${P.night}"/>
      <rect x="22" y="40" width="36" height="4" rx="1" fill="#fff"/>
      <path d="M26 40 v2.4 M29 40 v2.4 M35 40 v2.4 M38 40 v2.4 M41 40 v2.4 M47 40 v2.4 M50 40 v2.4" stroke="${P.night}" stroke-width="1.6"/>
      <path d="M26 44 V53 M70 40 V53" stroke="${P.night}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M48 44 V50" stroke="${P.sun}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
};

/* ---------- đảo của các tuần mới trong giáo trình v5 (30 tuần) và v5.1 (31 tuần: tuần 19 mới, Cầu Vạch Phụ thành tuần 23) ---------- */
const NEW_PROPS: Record<number, { base: Base; art: string }> = {
  // 5 · Đồi Năm Ngón — đồi xanh với 5 bông hoa (5 ngón)
  5: {
    base: 'grass',
    art: `
      <path d="M18 50 Q34 26 52 38 Q66 28 80 50 Z" fill="${P.grassDark}"/>
      ${[24, 36, 48, 60, 72]
        .map((x, i) => `<path d="M${x} 50 V${42 - (i % 2) * 4}" stroke="${P.grassDark}" stroke-width="1.4"/><circle cx="${x}" cy="${40 - (i % 2) * 4}" r="3.4" fill="${[P.coral, P.sun, P.pink, P.violetLight, P.orange][i]}"/>`)
        .join('')}
      ${sparkle(50, 14, 2.6, P.sun)}`,
  },
  // 9 · Bến Đò Nhịp Hai — sông và con đò
  9: {
    base: 'sand',
    art: `
      <path d="M14 46 Q48 40 82 46 L82 52 Q48 48 14 52 Z" fill="${P.water}"/>
      <path d="M30 42 Q48 50 66 42 L62 38 H34 Z" fill="${P.wood}"/>
      <path d="M48 38 V18" stroke="${P.ink}" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M49 19 L62 34 H49 Z" fill="#fff"/>
      ${noteGlyph(70, 24, 3, P.indigo)}${noteGlyph(26, 22, 3, P.coral)}`,
  },
  // 13 · Vườn Tháp Chuông — tháp chuông nhỏ
  13: {
    base: 'grass',
    art: `
      <rect x="38" y="24" width="20" height="28" rx="2" fill="${P.lavender}"/>
      <path d="M34 25 L48 10 L62 25 Z" fill="${P.indigo}"/>
      <path d="M43 32 Q48 26 53 32 V38 H43 Z" fill="${P.sun}"/>
      <circle cx="48" cy="39" r="1.6" fill="${P.orange}"/>
      ${sparkle(28, 22, 2.4, P.sun)}${sparkle(70, 18, 2.4, P.mint)}`,
  },
  // 18 · Suối Móc Kép — dòng suối chảy với chùm nốt nhanh
  18: {
    base: 'rock',
    art: `
      <path d="M30 14 Q38 26 34 34 Q30 42 40 52 H54 Q46 42 50 34 Q54 26 46 14 Z" fill="${P.water}"/>
      <path d="M36 22 Q40 30 38 36 M46 26 Q48 34 46 42" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${beamedNotes(62, 30, 3.4, P.indigo)}`,
  },
  // 19 · Phố Xích Lô (v5.1, tách từ tuần 18) — xích lô trên phố, nốt nhạc nhảy lệch phách
  19: {
    base: 'sand',
    art: `
      <path d="M12 52 H84" stroke="${P.stone}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="30" cy="44" r="8" fill="none" stroke="${P.ink}" stroke-opacity=".8" stroke-width="2"/>
      <circle cx="64" cy="44" r="8" fill="none" stroke="${P.ink}" stroke-opacity=".8" stroke-width="2"/>
      <path d="M30 44 L46 44 L60 30 M46 44 L64 44" fill="none" stroke="${P.ink}" stroke-opacity=".8" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M22 36 Q22 24 34 24 H40 V38 H24 Z" fill="${P.coral}"/>
      <path d="M58 30 H66" stroke="${P.ink}" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>
      ${noteGlyph(74, 22, 3, P.indigo)}${noteGlyph(50, 14, 3, P.violet)}${sparkle(84, 34, 2.2, P.sun)}`,
  },
  // 23 · Cầu Vạch Phụ — cây cầu có các vạch kẻ phụ như khuông nhạc (tuần 22 ở v5)
  23: {
    base: 'grass',
    art: `
      <path d="M16 44 Q48 20 80 44" fill="none" stroke="${P.wood}" stroke-width="4" stroke-linecap="round"/>
      ${[26, 36, 48, 60, 70].map((x) => `<path d="M${x - 5} ${44 - 22 * Math.sin((Math.PI * (x - 16)) / 64)} h10" stroke="${P.ink}" stroke-opacity=".75" stroke-width="1.4" stroke-linecap="round"/>`).join('')}
      <ellipse cx="48" cy="18" rx="4.2" ry="3.2" fill="${P.ink}" transform="rotate(-20 48 18)"/>`,
  },
};

/**
 * Giáo trình v5.1 (31 tuần): tuần MỚI → hình của tuần CŨ cùng nội dung (theo các bảng chuyển dữ liệu
 * src/progress/migrations.ts: rev 2 → 3 rồi rev 3 → 4, tuần ≥ 19 +1). Hình vẽ PROPS vẫn đánh số theo giáo trình 25 tuần cũ.
 */
const ART_OF_WEEK: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 6: 5, 7: 6, 8: 7, 10: 8, 11: 9, 12: 10, 14: 11, 15: 12, 16: 13, 17: 14,
  20: 15, 21: 16, 22: 17, 24: 18, 25: 19, 26: 20, 27: 23, 28: 24, 29: 21, 30: 22, 31: 25,
};

const FALLBACK = { base: 'grass' as Base, art: beamedNotes(40, 46, 4, P.violet) };

/** Biểu tượng đảo tuần `week` (1–31, giáo trình v5.1) ở trạng thái `state`. */
export function islandIcon(week: number, state: IslandState): SVGElement {
  const p = NEW_PROPS[week] ?? PROPS[ART_OF_WEEK[week] ?? -1] ?? FALLBACK;
  const body = `<g stroke="rgba(61,52,102,.3)" stroke-width="1.1" stroke-linejoin="round">${base(p.base)}${p.art}</g>`;
  let inner: string;
  if (state === 'locked') {
    const f = uid('isl-mute');
    inner = `
      <defs><filter id="${f}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0.12"/></filter></defs>
      <g filter="url(#${f})" opacity=".5">${body}</g>
      <g transform="translate(76 56)">
        <circle r="11" fill="#fff" stroke="${P.stoneDark}" stroke-width="1.5"/>
        <path d="M-3.6 -1.5 v-2.6 a3.6 3.6 0 0 1 7.2 0 v2.6" fill="none" stroke="${P.stoneDark}" stroke-width="2" stroke-linecap="round"/>
        <rect x="-5.6" y="-1.8" width="11.2" height="8.4" rx="2" fill="${P.stoneDark}"/>
        <circle cy="2.2" r="1.3" fill="#fff"/>
      </g>`;
  } else if (state === 'done') {
    inner = `${body}
      <g transform="translate(80 15)">
        <circle r="11" fill="#fff" opacity=".95"/>
        <path d="${starPath(0, 0.6, 8.6)}" fill="${P.sun}" stroke="${P.orange}" stroke-width="1.4" stroke-linejoin="round"/>
      </g>`;
  } else {
    inner = body;
  }
  const svg = svgRoot('0 0 96 80', `island-art state-${state}`, inner);
  svg.setAttribute('data-week', String(week));
  return svg;
}

/** Bảng xem thử toàn bộ 31 đảo × 3 trạng thái (chỉ để phát triển / chụp màn hình). */
export function islandArtPreview(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute('style', 'display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:8px;background:#fff8ee');
  const states: IslandState[] = ['current', 'done', 'locked'];
  for (let w = 1; w <= 31; w++) {
    const cell = document.createElement('div');
    cell.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;font:12px sans-serif;color:#3d3466');
    const icon = islandIcon(w, states[w % 3]);
    icon.setAttribute('width', '120');
    icon.setAttribute('height', '100');
    cell.append(icon, `Tuần ${w}`);
    wrap.append(cell);
  }
  for (const s of states) {
    const cell = document.createElement('div');
    cell.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;font:12px sans-serif');
    const icon = islandIcon(1, s);
    icon.setAttribute('width', '120');
    icon.setAttribute('height', '100');
    cell.append(icon, s);
    wrap.append(cell);
  }
  return wrap;
}
