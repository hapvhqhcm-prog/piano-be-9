import { minutesText, skillSentence, viDate, TARGET_DAYS, type ProgressReport, type SkillKind } from '../../progress/report';
import { islandIcon, type IslandState } from '../components/art/islandArt';
import { P, starPath } from '../components/art/svgKit';

/**
 * Ảnh PNG của "Báo cáo tiến bộ" để chia sẻ (Zalo / Messenger / tin nhắn): VẼ RIÊNG trên canvas (dọc, 900 × ~1900
 * điểm, ×2 cho nét) — chữ dùng phông đã nạp sẵn của app (Baloo 2 / Nunito, có bộ Tiếng Việt), tranh đảo lấy từ SVG
 * của bộ tranh (chỉ hình, không chữ) → Image. Không dùng emoji trong ảnh (mỗi máy vẽ emoji một kiểu / thiếu cờ).
 */

const W = 900;
const PAD = 40;
const IW = W - PAD * 2;
const SCALE = 2;
const DISPLAY = '"Baloo 2", "Nunito", system-ui, sans-serif';
const BODY = '"Nunito", system-ui, sans-serif';
const C = {
  bg: '#fff7ea',
  ink: '#2c2752',
  ink2: '#5b5680',
  ink3: '#8c88a8',
  line: '#e7e3f6',
  card: '#ffffff',
  surface2: '#f8f7ff',
  violet: '#5b54d6',
  violet400: '#8a7cf2',
  violet100: '#e8e4ff',
  mint: '#1a9a5a',
  mint50: '#e7f9f0',
  sun50: '#fff8e1',
  sun800: '#8a5a00',
  coral: '#f26b4e',
};

/** Trạng thái đảo trên dải bản đồ — cùng quy tắc màn chính: tuần < tuần hiện tại = đã qua. */
export function stripState(w: number, r: Pick<ProgressReport, 'week' | 'currentDone'>): IslandState {
  if (w < r.week || (w === r.week && r.currentDone)) return 'done';
  return w === r.week ? 'current' : 'locked';
}

/** Các tuần trên dải bản đồ: cả cấp hiện tại. */
export function stripWeeks(r: Pick<ProgressReport, 'level'>): number[] {
  const [a, b] = r.level.weeks;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const font = (weight: number, size: number, display = false) => `${weight} ${size}px ${display ? DISPLAY : BODY}`;

/** Tên tệp ảnh: "bao-cao-piano-2026-10-06.png" (không đưa tên bé vào tên tệp). */
export function reportFileName(r: Pick<ProgressReport, 'date'>): string {
  return `bao-cao-piano-${r.date}.png`;
}

/** Chờ phông chữ (cả bộ ký tự Tiếng Việt — unicode-range chỉ tải khi có chữ cần). */
async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'Báo cáo tiến bộ học đàn ẮẶỨỰĐđươ 0123';
  try {
    await Promise.all(
      ['800 40px "Baloo 2"', '700 40px "Baloo 2"', '600 20px "Nunito"', '800 20px "Nunito"'].map((f) => document.fonts.load(f, sample)),
    );
    await document.fonts.ready;
  } catch {
    /* thiếu phông → dùng phông hệ thống */
  }
}

function svgToImage(svg: SVGElement, w: number, hgt: number): Promise<HTMLImageElement | null> {
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(hgt));
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, fill = C.card, stroke: string | null = C.line): void {
  rr(ctx, x, y, w, hgt, 22);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Ngắt dòng theo khoảng trắng cho vừa `maxW`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Viết đoạn chữ nhiều dòng, trả về y sau dòng cuối. */
function para(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  for (const line of wrap(ctx, text, maxW)) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}

/** Chữ một dòng, tự thu nhỏ cho vừa. */
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number, display = true): void {
  let s = size;
  ctx.font = font(weight, s, display);
  while (s > 12 && ctx.measureText(text).width > maxW) ctx.font = font(weight, --s, display);
  ctx.fillText(text, x, y);
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string = P.sun): void {
  const p = new Path2D(starPath(cx, cy, r));
  ctx.fillStyle = fill;
  ctx.fill(p);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = P.orange;
  ctx.stroke(p);
}

/** Nhãn "VN" đỏ sao vàng nhỏ cho bài Việt Nam. */
function vnTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  rr(ctx, x, y - 16, 30, 20, 5);
  ctx.fillStyle = '#da251d';
  ctx.fill();
  star(ctx, x + 15, y - 5.5, 7, '#ffde00');
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, y: number): number {
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 30, true);
  ctx.fillText(text, PAD + 4, y + 30);
  return y + 46;
}

const SKILL_NAME: Record<SkillKind, string> = { reading: 'Đọc nốt', ear: 'Tai nghe', rhythm: 'Vỗ nhịp' };

/** Vẽ báo cáo lên canvas (đã cắt đúng chiều cao). */
export async function renderReportImage(r: ProgressReport): Promise<HTMLCanvasElement> {
  await loadFonts();
  const weeks = stripWeeks(r);
  const [hero, ...isl] = await Promise.all([
    svgToImage(islandIcon(r.week, r.currentDone ? 'done' : 'current'), 240, 200),
    ...weeks.map((w) => svgToImage(islandIcon(w, stripState(w, r)), 96, 80)),
  ]);

  const MAXH = 3400;
  const big = document.createElement('canvas');
  big.width = W * SCALE;
  big.height = MAXH * SCALE;
  const ctx = big.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, MAXH);
  const sky = ctx.createLinearGradient(0, 0, 0, 500);
  sky.addColorStop(0, '#e9f6ff');
  sky.addColorStop(1, 'rgba(255,247,234,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 500);

  // ---------- Đầu trang ----------
  let y = PAD;
  const textX = PAD + 32;
  const textW = IW - 32 - 250;
  ctx.font = font(700, 18);
  const chips = [r.level.name, `Tuần ${r.week}/${r.maxWeek}: ${r.weekTitle}`, `Đảo: ${r.island}`];
  // Xếp chip theo dòng
  const chipRows: string[][] = [[]];
  let rowW = 0;
  for (const c of chips) {
    const w = Math.min(textW, ctx.measureText(c).width + 28);
    if (rowW + w > textW && chipRows[chipRows.length - 1].length) {
      chipRows.push([]);
      rowW = 0;
    }
    chipRows[chipRows.length - 1].push(c);
    rowW += w + 10;
  }
  const headH = Math.max(240, 32 + 24 + 64 + 34 + 16 + chipRows.length * 40 + 20);
  const g = ctx.createLinearGradient(PAD, y, PAD + IW, y + headH);
  g.addColorStop(0, '#5b54d6');
  g.addColorStop(1, '#8a6cff');
  rr(ctx, PAD, y, IW, headH, 30);
  ctx.fillStyle = g;
  ctx.fill();
  // vòng sáng sau đảo
  ctx.save();
  rr(ctx, PAD, y, IW, headH, 30);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath();
  ctx.arc(PAD + IW - 130, y + headH / 2, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (hero) ctx.drawImage(hero, PAD + IW - 255, y + (headH - 200) / 2, 240, 200);
  let ty = y + 32 + 20;
  ctx.fillStyle = P.sunLight;
  ctx.font = font(800, 20);
  ctx.fillText('BÁO CÁO TIẾN BỘ HỌC ĐÀN', textX, ty);
  ty += 62;
  ctx.fillStyle = '#fff';
  fit(ctx, r.name ? `Bé ${r.name}` : 'Bé học đàn', textX, ty, textW, 800, 58);
  ty += 36;
  ctx.font = font(700, 22);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(`${viDate(r.from)} – ${viDate(r.to)}`, textX, ty);
  ty += 22;
  ctx.font = font(700, 18);
  for (const row of chipRows) {
    let x = textX;
    for (const c of row) {
      const w = Math.min(textW, ctx.measureText(c).width + 28);
      rr(ctx, x, ty, w, 32, 16);
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.save();
      rr(ctx, x, ty, w, 32, 16);
      ctx.clip();
      ctx.fillText(c, x + 14, ty + 22);
      ctx.restore();
      x += w + 10;
    }
    ty += 40;
  }
  y += headH + 28;

  // ---------- Hành trình ----------
  y = sectionTitle(ctx, 'Hành trình', y);
  const tiles: Array<[string, string]> = [
    [`${r.weeksPassed}/${r.maxWeek}`, 'đảo đã qua'],
    [String(r.daysPractised), 'ngày đã tập'],
    [minutesText(r.totalMinutes), 'tổng thời gian'],
    [String(r.stickers.earned), `sticker (trên ${r.stickers.total})`],
  ];
  const tw = (IW - 3 * 14) / 4;
  tiles.forEach(([v, l], i) => {
    const x = PAD + i * (tw + 14);
    card(ctx, x, y, tw, 104);
    ctx.fillStyle = C.violet;
    fit(ctx, v, x + 18, y + 54, tw - 32, 800, 36);
    ctx.fillStyle = C.ink2;
    fit(ctx, l, x + 18, y + 84, tw - 32, 700, 17, false);
  });
  y += 104 + 16;

  // Dải đảo của cấp hiện tại
  const stripH = 132;
  card(ctx, PAD, y, IW, stripH);
  ctx.fillStyle = C.ink2;
  ctx.font = font(800, 17);
  ctx.fillText(`${r.level.name} — tuần ${r.level.weeks[0]}–${r.level.weeks[1]}`, PAD + 20, y + 28);
  const cw = (IW - 24) / weeks.length;
  weeks.forEach((w, i) => {
    const cx = PAD + 12 + cw * (i + 0.5);
    const iw = Math.min(76, cw - 4);
    const ih = iw * (80 / 96);
    const st = stripState(w, r);
    if (st === 'current') {
      ctx.fillStyle = 'rgba(255,203,61,.35)';
      ctx.beginPath();
      ctx.ellipse(cx, y + 40 + ih / 2, iw / 2 + 4, ih / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const img = isl[i];
    if (img) ctx.drawImage(img, cx - iw / 2, y + 40, iw, ih);
    ctx.fillStyle = st === 'current' ? C.violet : st === 'done' ? C.ink : C.ink3;
    ctx.font = font(800, 15);
    ctx.textAlign = 'center';
    ctx.fillText(`T${w}`, cx, y + stripH - 12);
    ctx.textAlign = 'left';
  });
  y += stripH + 16;

  // Biểu đồ ngày tập
  const chartH = 270;
  card(ctx, PAD, y, IW, chartH);
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 22, true);
  ctx.fillText('Số ngày tập mỗi tuần', PAD + 20, y + 36);
  ctx.fillStyle = C.ink2;
  ctx.font = font(600, 16);
  ctx.fillText(`8 tuần gần nhất · vạch xanh = mục tiêu ${TARGET_DAYS} ngày/tuần`, PAD + 20, y + 60);
  {
    const left = PAD + 52;
    const right = PAD + IW - 24;
    const top = y + 84;
    const bottom = y + chartH - 40;
    const ph = bottom - top;
    const yv = (v: number) => bottom - (v / 7) * ph;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (const v of [0, 7]) {
      ctx.beginPath();
      ctx.moveTo(left, yv(v));
      ctx.lineTo(right, yv(v));
      ctx.stroke();
    }
    ctx.fillStyle = C.ink3;
    ctx.font = font(700, 14);
    ctx.textAlign = 'right';
    ctx.fillText('7', left - 10, yv(7) + 5);
    ctx.fillText('0', left - 10, yv(0) + 5);
    ctx.fillStyle = C.mint;
    ctx.fillText(String(TARGET_DAYS), left - 10, yv(TARGET_DAYS) + 5);
    ctx.textAlign = 'left';
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, yv(TARGET_DAYS));
    ctx.lineTo(right, yv(TARGET_DAYS));
    ctx.stroke();
    ctx.setLineDash([]);
    const step = (right - left) / r.weekly.length;
    const bw = Math.min(46, step * 0.55);
    r.weekly.forEach((wk, i) => {
      const cx = left + step * (i + 0.5);
      const last = i === r.weekly.length - 1;
      if (wk.days > 0) {
        const top2 = yv(wk.days);
        const rad = Math.min(5, (bottom - top2) / 2);
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2, bottom);
        ctx.lineTo(cx - bw / 2, top2 + rad);
        ctx.arcTo(cx - bw / 2, top2, cx - bw / 2 + rad, top2, rad);
        ctx.lineTo(cx + bw / 2 - rad, top2);
        ctx.arcTo(cx + bw / 2, top2, cx + bw / 2, top2 + rad, rad);
        ctx.lineTo(cx + bw / 2, bottom);
        ctx.closePath();
        ctx.fillStyle = last ? C.violet400 : C.violet;
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink;
      ctx.font = font(800, 17);
      ctx.fillText(String(wk.days), cx, yv(wk.days) - 8);
      ctx.fillStyle = C.ink2;
      ctx.font = font(700, 14);
      ctx.fillText(last ? 'tuần này' : wk.label, cx, bottom + 24);
      ctx.textAlign = 'left';
    });
  }
  y += chartH + 16;

  // Bài đã thuộc (2 cột)
  {
    ctx.font = font(700, 18);
    const colW = (IW - 40 - 20) / 2;
    const rows = Math.ceil(r.songs.length / 2);
    const hasVn = r.songs.some((s) => s.vn);
    const boxH = 60 + Math.max(1, rows) * 34 + (hasVn ? 34 : 0) + 10;
    card(ctx, PAD, y, IW, boxH);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 22, true);
    ctx.fillText(`Bài đã thuộc (${r.songs.length})`, PAD + 20, y + 36);
    let sy = y + 72;
    if (!r.songs.length) {
      ctx.fillStyle = C.ink2;
      ctx.font = font(600, 18);
      ctx.fillText('Chưa có bài nào chơi trọn theo nhịp — sắp rồi!', PAD + 20, sy);
    }
    r.songs.forEach((s, i) => {
      const col = i < rows ? 0 : 1;
      const row = col ? i - rows : i;
      const x = PAD + 20 + col * (colW + 20);
      const yy = sy + row * 34;
      star(ctx, x + 10, yy - 7, 10, s.fresh ? P.sun : P.sunLight);
      ctx.fillStyle = s.fresh ? C.ink : C.ink2;
      ctx.font = font(700, 18);
      let title = s.title;
      const maxT = colW - 32 - (s.vn ? 40 : 0);
      while (ctx.measureText(title).width > maxT && title.length > 4) title = `${title.slice(0, -2)}…`;
      ctx.fillText(title, x + 28, yy);
      if (s.vn) vnTag(ctx, x + 28 + ctx.measureText(title).width + 10, yy);
    });
    if (hasVn) {
      const ly = y + boxH - 22;
      vnTag(ctx, PAD + 20, ly);
      ctx.fillStyle = C.ink2;
      ctx.font = font(600, 16);
      ctx.fillText('= bài Việt Nam', PAD + 58, ly);
    }
    y += boxH + 28;
  }

  // ---------- Kỹ năng ----------
  y = sectionTitle(ctx, 'Kỹ năng', y);
  {
    const kinds: SkillKind[] = ['reading', 'ear', 'rhythm'];
    ctx.font = font(600, 17);
    const texts = kinds.map((k) => {
      const s = skillSentence(k, r.skills[k]);
      return wrap(ctx, s.slice(s.indexOf(':') + 1).trim(), IW - 40);
    });
    const boxH = 20 + texts.reduce((s, t) => s + 44 + t.length * 24 + 12, 0);
    card(ctx, PAD, y, IW, boxH);
    let sy = y + 20;
    kinds.forEach((k, i) => {
      const a = r.skills[k];
      const pct = a.recent.total ? a.recent.pct : a.all.pct;
      ctx.fillStyle = C.ink;
      ctx.font = font(800, 22, true);
      ctx.fillText(SKILL_NAME[k], PAD + 20, sy + 28);
      const bx = PAD + 170;
      const bwid = IW - 170 - 100;
      rr(ctx, bx, sy + 12, bwid, 18, 9);
      ctx.fillStyle = C.violet100;
      ctx.fill();
      if (pct) {
        rr(ctx, bx, sy + 12, Math.max(18, (bwid * pct) / 100), 18, 9);
        ctx.fillStyle = C.violet;
        ctx.fill();
      }
      ctx.fillStyle = pct === null ? C.ink3 : C.ink;
      ctx.font = font(800, 22, true);
      ctx.textAlign = 'right';
      ctx.fillText(pct === null ? '—' : `${pct}%`, PAD + IW - 20, sy + 30);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.ink2;
      ctx.font = font(600, 17);
      let ly = sy + 44 + 18;
      for (const line of texts[i]) {
        ctx.fillText(line, PAD + 20, ly);
        ly += 24;
      }
      sy = ly - 18 + 12;
    });
    y += boxH + 16;
  }
  // Ô thông tin 2×2
  {
    const sk = r.skills;
    const dyn = [sk.dynamics.loudSoft ? 'To – nhỏ' : '', sk.dynamics.stacLeg ? 'Ngắt – liền' : ''].filter(Boolean);
    const facts: Array<[string, string, string]> = [
      ['Hai tay cùng lúc', sk.handsTogether.songs ? `${sk.handsTogether.songs} bài` : 'chưa', sk.handsTogether.available ? `đã mở ${sk.handsTogether.available} bài hai tay` : 'bắt đầu ở Cấp 2'],
      ['Tốc độ nhanh nhất', sk.maxBpm ? `${sk.maxBpm} nhịp/phút` : 'chưa', sk.maxBpm ? 'chơi trọn bài, đạt' : ''],
      ['To – nhỏ, ngắt – liền', dyn.length ? dyn.join(' · ') : 'chưa', `${sk.dynamics.rounds} lượt đúng`],
      ['Bài tự sáng tác', `${sk.compositions} bài`, ''],
    ];
    const fw = (IW - 14) / 2;
    facts.forEach(([l, v, s], i) => {
      const x = PAD + (i % 2) * (fw + 14);
      const yy = y + Math.floor(i / 2) * (96 + 14);
      card(ctx, x, yy, fw, 96, C.surface2);
      ctx.fillStyle = C.ink2;
      ctx.font = font(700, 16);
      ctx.fillText(l, x + 18, yy + 28);
      ctx.fillStyle = C.ink;
      fit(ctx, v, x + 18, yy + 60, fw - 36, 800, 26);
      if (s) {
        ctx.fillStyle = C.ink3;
        ctx.font = font(600, 15);
        ctx.fillText(s, x + 18, yy + 84);
      }
    });
    y += 2 * 96 + 14 + 28;
  }

  // ---------- Điểm mạnh & bước tiếp theo ----------
  y = sectionTitle(ctx, 'Điểm mạnh & bước tiếp theo', y);
  {
    ctx.font = font(700, 19);
    const items = [
      ...r.strengths.map((t) => ({ t, good: true })),
      ...r.nextSteps.map((t) => ({ t, good: false })),
    ].map((x) => ({ ...x, lines: wrap(ctx, x.t, IW - 40 - 52) }));
    for (const it of items) {
      const hgt = 28 + it.lines.length * 28;
      card(ctx, PAD, y, IW, hgt, it.good ? C.mint50 : C.sun50, null);
      // biểu tượng
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
      ctx.font = font(700, 19);
      para(ctx, it.lines.join(' '), PAD + 64, y + 39, IW - 40 - 52, 28);
      y += hgt + 12;
    }
  }

  // ---------- Chân trang ----------
  y += 14;
  ctx.fillStyle = C.ink3;
  ctx.font = font(600, 15);
  ctx.textAlign = 'center';
  ctx.fillText(`Lập ngày ${viDate(r.date)} · app Piano bé`, W / 2, y + 10);
  ctx.textAlign = 'left';
  y += 10 + PAD;

  const out = document.createElement('canvas');
  out.width = W * SCALE;
  out.height = Math.ceil(y * SCALE);
  out.getContext('2d')!.drawImage(big, 0, 0);
  big.width = big.height = 0; // giải phóng bộ nhớ (Safari giới hạn tổng canvas)
  return out;
}
