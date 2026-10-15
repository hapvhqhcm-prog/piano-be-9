/**
 * (+ 2026-10-15, OWNER duyệt "Nhân vật & bản đồ sinh động hơn") Bản đồ đảo sinh động — phần dùng chung cho màn chính
 * (home.ts islandMap) và cảnh cập bến (arrival.ts):
 *  - lớp "parallax nhẹ": mây trôi chậm + hai lớp sóng ngược chiều (mỗi lớp MỘT thẻ div trượt bằng transform → GPU ghép lớp,
 *    không vẽ lại; không rAF);
 *  - chấm đường đi "chạy" từ đảo cũ tới đảo mới khi tiến độ đổi (toán thuần, test: tests/mapMotion.test.ts);
 *  - thẻ nhỏ khi chạm một đảo (tên + con học gì) — không chuyển màn.
 * "Giảm chuyển động" → CSS tắt hết (styles/mapMotion.css), chấm đường đi hiện sẵn.
 */
import { h } from './dom';
import '../../styles/mapMotion.css';

/** Toạ độ trên bản đồ: x trong hệ 0–1000 (viewBox), y theo % chiều cao bản đồ. */
export interface MapPt {
  x: number;
  y: number;
}

/**
 * Điểm trên đoạn đường cong giữa đảo i-1 và đảo i, tham số t ∈ [0, 1] — CÙNG đường cong Bézier home.ts vẽ
 * (điểm điều khiển (mx, y[i-1]) và (mx, y[i]), mx = trung điểm x).
 */
export function segPoint(xs: readonly number[], ys: readonly number[], i: number, t: number): MapPt {
  const x0 = xs[i - 1];
  const y0 = ys[i - 1];
  const x1 = xs[i];
  const y1 = ys[i];
  const mx = (x0 + x1) / 2;
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return { x: b0 * x0 + b1 * mx + b2 * mx + b3 * x1, y: b0 * y0 + b1 * y0 + b2 * y1 + b3 * y1 };
}

export interface TrailDot extends MapPt {
  /** Tiến độ dọc đường (0 = đảo cũ, 1 = đảo mới) — dùng làm độ trễ hiện chấm */
  at: number;
}

/**
 * Các chấm dọc đường từ đảo `from` tới đảo `to` (chỉ số trong danh sách đảo của bản đồ), cách nhau ~`spacing` px
 * khi bản đồ rộng `pxW` × cao `pxH` (khớp nhịp chấm của đường vẽ sẵn: stroke-dasharray 0.1 16).
 * from ≥ to hoặc chỉ số sai → [].
 */
export function trailDots(
  xs: readonly number[],
  ys: readonly number[],
  from: number,
  to: number,
  o: { pxW: number; pxH: number; spacing?: number; steps?: number } = { pxW: 1000, pxH: 172 },
): TrailDot[] {
  const n = Math.min(xs.length, ys.length);
  if (!(from >= 0 && to > from && to < n) || !(o.pxW > 0) || !(o.pxH > 0)) return [];
  const spacing = Math.max(4, o.spacing ?? 16);
  const steps = Math.max(8, o.steps ?? 48);
  const sx = o.pxW / 1000;
  const sy = o.pxH / 100;
  // Lấy mẫu dày → độ dài cộng dồn (px) → đặt chấm đều theo độ dài
  const pts: Array<MapPt & { len: number }> = [];
  let len = 0;
  let prev = { x: xs[from], y: ys[from] };
  pts.push({ ...prev, len: 0 });
  for (let i = from + 1; i <= to; i++) {
    for (let k = 1; k <= steps; k++) {
      const p = segPoint(xs, ys, i, k / steps);
      len += Math.hypot((p.x - prev.x) * sx, (p.y - prev.y) * sy);
      pts.push({ ...p, len });
      prev = p;
    }
  }
  if (!(len > 0)) return [];
  const count = Math.max(1, Math.floor(len / spacing));
  const out: TrailDot[] = [];
  let j = 1;
  for (let c = 1; c <= count; c++) {
    const want = (c * len) / count;
    while (j < pts.length - 1 && pts[j].len < want) j++;
    const a = pts[j - 1];
    const b = pts[j];
    const f = b.len > a.len ? (want - a.len) / (b.len - a.len) : 1;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, at: want / len });
  }
  return out;
}

/** Thời gian chấm chạy hết đường (ms) và độ trễ trước khi bắt đầu. */
export const TRAIL_MS = 1400;
export const TRAIL_DELAY_MS = 350;
/** Độ trễ hiện chấm ở tiến độ `at` (ms). */
export const trailDelay = (at: number): number => Math.round(TRAIL_DELAY_MS + Math.min(1, Math.max(0, at)) * TRAIL_MS);

/**
 * Đảo bắt đầu chạy chấm: bé đã thấy bản đồ ở tuần `seen`, nay ở tuần `cur`; `weeks` = các tuần trên bản đồ (cấp hiện tại).
 * Trả về chỉ số đảo cũ (< chỉ số đảo hiện tại) hoặc null (lần đầu / lùi tuần / khác cấp / không đổi).
 */
export function trailStart(seen: number | null, cur: number, weeks: readonly number[]): number | null {
  if (seen === null || !Number.isFinite(seen) || seen >= cur) return null;
  const to = weeks.indexOf(cur);
  if (to <= 0) return null;
  const from = weeks.indexOf(seen);
  if (from >= 0) return from < to ? from : null;
  // Bỏ qua nhiều tuần / tuần cũ thuộc cấp trước nhưng vẫn trong bản đồ này → chạy từ đảo đầu tiên của bản đồ
  return seen < weeks[0] ? null : 0;
}

const SEEN_KEY = 'piano-be-9:map-seen';
/** Tuần lần trước bé thấy trên bản đồ (lưu trong máy — tiện ích, mất không sao). */
export function readSeenWeek(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
export function writeSeenWeek(week: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(week));
  } catch {
    /* bỏ qua */
  }
}

/** Lớp mây + sóng (đặt dưới các đảo). */
export function seaLayers(): HTMLElement[] {
  return [
    h('div', { class: 'sea-layer sea-clouds', 'aria-hidden': 'true' }),
    h('div', { class: 'sea-layer sea-waves back', 'aria-hidden': 'true' }),
    h('div', { class: 'sea-layer sea-waves front', 'aria-hidden': 'true' }),
  ];
}

/** Các chấm đường đi (HTML, tròn thật dù bản đồ co giãn) — mỗi chấm "bật" lên theo tiến độ. */
export function trailLayer(dots: readonly TrailDot[]): HTMLElement {
  return h(
    'div',
    { class: 'map-trail', 'aria-hidden': 'true' },
    ...dots.map((d) =>
      h('i', { style: { left: `${(d.x / 10).toFixed(2)}%`, top: `${d.y.toFixed(2)}%`, animationDelay: `${trailDelay(d.at)}ms` } }),
    ),
  );
}

/** Nội dung thẻ đảo (thuần — test được). */
export function islandCardText(o: {
  week: number;
  island: string;
  emoji: string;
  title: string;
  state: 'done' | 'current' | 'locked';
  teaser: string;
}): { head: string; name: string; body: string; tag: string } {
  if (o.state === 'locked') return { head: `Tuần ${o.week}`, name: o.teaser, body: 'Đảo bí mật — đi tiếp để khám phá nhé!', tag: '🔒' };
  return {
    head: `Tuần ${o.week}`,
    name: `${o.emoji} ${o.island}`,
    body: `Con học: ${o.title}`,
    tag: o.state === 'current' ? '📍 Con đang ở đây' : '⭐ Đã qua',
  };
}
