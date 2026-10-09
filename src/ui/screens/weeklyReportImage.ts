import { extraWholeSongs, improvementText, minutesShort, songList, weekRange, type WeeklySummary } from '../../progress/weeklyReport';
import { islandIcon } from '../components/art/islandArt';
import { P } from '../components/art/svgKit';
import { C, card, fit, font, loadFonts, rr, star, svgToImage, wrap } from './reportImage';

/**
 * (+ 2026-10-09) Ảnh PNG "Báo cáo tuần" để gửi ông bà (Zalo / tin nhắn) — cùng phong cách ảnh báo cáo tiến bộ
 * (reportImage.ts: canvas 900 điểm ×2, phông Baloo 2 / Nunito, tranh đảo từ SVG). KHÔNG có emoji trong ảnh
 * (mỗi máy vẽ một kiểu) — chữ có emoji được lọc bỏ ký hiệu.
 */

const W = 900;
const PAD = 40;
const IW = W - PAD * 2;
const SCALE = 2;
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Bỏ emoji / ký hiệu hình (ảnh không vẽ emoji). */
export function noEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .trim();
}

/** Tên tệp ảnh: "bao-cao-tuan-2026-10-05.png" (thứ 2 của tuần; không đưa tên bé vào tên tệp). */
export function weeklyFileName(s: Pick<WeeklySummary, 'monday'>): string {
  return `bao-cao-tuan-${s.monday}.png`;
}

/** Các dòng "Tuần này con đã…" (lời thường, không emoji). */
export function highlightLines(s: WeeklySummary): string[] {
  const out: string[] = [];
  if (s.mastered.length) out.push(`Thuộc bài mới: ${songList(s.mastered, 4)}`);
  const more = extraWholeSongs(s);
  if (more.length) out.push(`Chơi trọn & đạt${s.mastered.length ? ' thêm' : ''} ${more.length} bài: ${songList(more)}`);
  const c = s.course;
  if (c?.reached.length) out.push(`Lên đảo mới: tuần ${c.reached.join(', ')}`);
  if (c?.criterion) {
    if (c.criterion.passed) out.push(`Đã đạt bài kiểm tra tuần ${c.week}`);
    else if (c.criterion.need !== null) out.push(`Bài kiểm tra tuần ${c.week}: ${c.criterion.days}/${c.criterion.need} ngày đạt`);
  }
  if (s.concerts.count) {
    const who = [...s.concerts.audience, ...(s.concerts.others ? [`${s.concerts.others} người nữa`] : [])].join(', ');
    out.push(`Biểu diễn ${s.concerts.count} lần${who ? ` — người nghe: ${who}` : ''}`);
  }
  if (s.challenge) out.push(`Thử thách “${s.challenge.title}”: ${s.challenge.done ? 'hoàn thành' : s.challenge.text}`);
  for (const i of s.improvements ?? []) out.push(`Tiến bộ — ${improvementText(i)}`);
  if (s.handsPct !== null && !(s.improvements ?? []).some((i) => i.kind === 'hands')) out.push(`Hai tay cùng lúc: ${s.handsPct}% nốt đúng`);
  return out.map(noEmoji);
}

export async function renderWeeklyImage(s: WeeklySummary): Promise<HTMLCanvasElement> {
  await loadFonts();
  const hero = s.course ? await svgToImage(islandIcon(s.course.week, s.course.passedNow ? 'done' : 'current'), 220, 184) : null;

  const MAXH = 3000;
  const big = document.createElement('canvas');
  big.width = W * SCALE;
  big.height = MAXH * SCALE;
  const ctx = big.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, MAXH);
  const sky = ctx.createLinearGradient(0, 0, 0, 420);
  sky.addColorStop(0, '#e9f6ff');
  sky.addColorStop(1, 'rgba(255,247,234,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 420);

  // ---------- Đầu trang ----------
  let y = PAD;
  const headH = 232;
  const textX = PAD + 32;
  const textW = IW - 32 - (hero ? 240 : 32);
  const g = ctx.createLinearGradient(PAD, y, PAD + IW, y + headH);
  g.addColorStop(0, '#5b54d6');
  g.addColorStop(1, '#8a6cff');
  rr(ctx, PAD, y, IW, headH, 30);
  ctx.fillStyle = g;
  ctx.fill();
  if (hero) {
    ctx.save();
    rr(ctx, PAD, y, IW, headH, 30);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.arc(PAD + IW - 125, y + headH / 2, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(hero, PAD + IW - 240, y + (headH - 184) / 2, 220, 184);
  }
  ctx.fillStyle = P.sunLight;
  ctx.font = font(800, 20);
  ctx.fillText(s.inProgress ? 'BÁO CÁO TUẦN (ĐANG DIỄN RA)' : 'BÁO CÁO TUẦN HỌC ĐÀN', textX, y + 52);
  ctx.fillStyle = '#fff';
  fit(ctx, s.name ? `Bé ${s.name}` : 'Bé học đàn', textX, y + 112, textW, 800, 54);
  ctx.font = font(700, 22);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(`Tuần ${weekRange(s)}`, textX, y + 148);
  if (s.course) {
    const chip = noEmoji(`Tuần ${s.course.week}: ${s.course.title} · ${s.course.island}`);
    ctx.font = font(700, 18);
    let t = chip;
    while (ctx.measureText(t).width > textW - 28 && t.length > 6) t = `${t.slice(0, -2)}…`;
    const cw = ctx.measureText(t).width + 28;
    rr(ctx, textX, y + 166, cw, 34, 17);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(t, textX + 14, y + 189);
  }
  y += headH + 24;

  // ---------- Số liệu ----------
  const tiles: Array<[string, string]> = [
    [`${s.days}/7`, 'ngày tập'],
    [minutesShort(s.minutes), 'thời gian'],
    [s.sessions === null ? '—' : String(s.sessions), 'buổi học'],
    [String(s.stars), 'sao'],
  ];
  const tw = (IW - 3 * 14) / 4;
  tiles.forEach(([v, l], i) => {
    const x = PAD + i * (tw + 14);
    card(ctx, x, y, tw, 100);
    ctx.fillStyle = C.violet;
    fit(ctx, v, x + 18, y + 52, tw - 32, 800, 36);
    ctx.fillStyle = C.ink2;
    fit(ctx, l, x + 18, y + 82, tw - 32, 700, 17, false);
  });
  y += 100 + 14;

  // Chấm ngày T2 → CN
  {
    const hgt = 128;
    card(ctx, PAD, y, IW, hgt);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 22, true);
    ctx.fillText('Những ngày con ngồi vào đàn', PAD + 20, y + 36);
    const step = (IW - 40) / 7;
    s.dayDots.forEach((on, i) => {
      const cx = PAD + 20 + step * (i + 0.5);
      const cy = y + 74;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = on ? C.violet : C.violet100;
      ctx.fill();
      if (on) star(ctx, cx, cy, 11, P.sun);
      ctx.fillStyle = on ? C.ink : C.ink3;
      ctx.font = font(800, 15);
      ctx.textAlign = 'center';
      ctx.fillText(DOW[i], cx, y + hgt - 12);
      ctx.textAlign = 'left';
    });
    y += hgt + 24;
  }

  // ---------- Tuần này con đã… ----------
  const lines = highlightLines(s);
  if (lines.length) {
    ctx.font = font(700, 19);
    const wrapped = lines.map((l) => wrap(ctx, l, IW - 40 - 34));
    const boxH = 58 + wrapped.reduce((a, w) => a + w.length * 27 + 10, 0) + 8;
    card(ctx, PAD, y, IW, boxH);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 22, true);
    ctx.fillText('Tuần này con đã…', PAD + 20, y + 38);
    let ly = y + 74;
    for (const w of wrapped) {
      star(ctx, PAD + 30, ly - 7, 9, P.sun);
      ctx.fillStyle = C.ink;
      ctx.font = font(700, 19);
      for (const line of w) {
        ctx.fillText(line, PAD + 54, ly);
        ly += 27;
      }
      ly += 10;
    }
    y += boxH + 24;
  }

  // ---------- Nên khen & bố mẹ giúp ----------
  {
    ctx.font = font(700, 19);
    const items = [
      ...s.praise.map((t) => ({ t: noEmoji(t), good: true })),
      { t: noEmoji(s.help), good: false },
    ].map((x) => ({ ...x, lines: wrap(ctx, x.t, IW - 40 - 56) }));
    for (const it of items) {
      const hgt = 64 + it.lines.length * 28;
      card(ctx, PAD, y, IW, hgt, it.good ? C.mint50 : C.sun50, null);
      const cx = PAD + 36;
      const cy = y + 32;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = it.good ? C.mint : P.orange;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (it.good) {
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx - 1.5, cy + 5);
        ctx.lineTo(cx + 7, cy - 5);
      } else {
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx + 1, cy - 5);
        ctx.lineTo(cx + 6, cy);
        ctx.lineTo(cx + 1, cy + 5);
      }
      ctx.stroke();
      ctx.fillStyle = it.good ? '#0f5c36' : C.sun800;
      ctx.font = font(800, 17);
      ctx.fillText(it.good ? 'NÊN KHEN CON' : 'BỐ MẸ GIÚP CON', PAD + 64, y + 38);
      ctx.font = font(700, 19);
      let ly = y + 70;
      for (const line of it.lines) {
        ctx.fillText(line, PAD + 64, ly);
        ly += 28;
      }
      y += hgt + 12;
    }
  }

  // ---------- Ghi chú ----------
  const notes = [s.mic ? noEmoji(s.mic.text) : '', s.detail !== 'full' ? 'Tuần cũ: app đã gộp bớt chi tiết để tiết kiệm bộ nhớ.' : ''].filter(Boolean);
  if (notes.length) {
    y += 6;
    ctx.fillStyle = C.ink2;
    ctx.font = font(600, 16);
    for (const n of notes)
      for (const line of wrap(ctx, n, IW - 20)) {
        ctx.fillText(line, PAD + 10, y + 16);
        y += 24;
      }
  }

  y += 22;
  ctx.fillStyle = C.ink3;
  ctx.font = font(600, 15);
  ctx.textAlign = 'center';
  ctx.fillText('Báo cáo tuần · app Piano bé', W / 2, y + 10);
  ctx.textAlign = 'left';
  y += 10 + PAD;

  const out = document.createElement('canvas');
  out.width = W * SCALE;
  out.height = Math.ceil(Math.min(y, MAXH) * SCALE);
  out.getContext('2d')!.drawImage(big, 0, 0);
  big.width = big.height = 0; // giải phóng bộ nhớ (Safari giới hạn tổng canvas)
  return out;
}
