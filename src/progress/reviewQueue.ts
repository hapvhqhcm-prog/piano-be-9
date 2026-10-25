/**
 * (2026-10-25, OWNER: "tôi hầu như không có thời gian vào app, hãy bỏ phần phụ huynh ra") — DỌN HÀNG CHỜ CŨ.
 *
 * Trước đây (2026-10-12 → 2026-10-25) khi bé "tự học", việc cần bố mẹ được hoãn vào hàng "🕑 Chờ bố mẹ xem"
 * (AppData.reviews). App giờ LUÔN là bé tự học: micro chấm khi nghe được, còn lại bé TỰ KIỂM TRA ("👍 Rồi / 🔁 Làm lại")
 * — KHÔNG tạo mục chờ mới nữa. Dữ liệu cũ còn mục chờ được giải quyết MỘT lần (khi mở app / nhập bản sao lưu), không
 * đổi phiên bản dữ liệu (schema vẫn đọc được trường `reviews` của bản sao lưu cũ):
 * - Lượt CẢ BÀI mà micro đã nghe được ≥ PASS (80%) số nốt ("micro nghe chưa rõ (nghe được X/Y nốt)") → ghi như micro chấm
 *   (source 'mic', ĐẠT) vào ĐÚNG buổi / ngày bé đàn (tính cho quy tắc "2 ngày khác nhau" như lúc đó).
 * - Mọi mục khác (thẻ / nốt cần người lớn xác nhận, lời nhắc xem tay, huy chương, thử thách) → BỎ, không ghi gì (như lượt
 *   đó chưa từng được chấm). Bé không mất gì đã có: kết quả micro chấm được đã được ghi NGAY từ lúc đó.
 * Hàm thuần — có test (tests/reviewQueue.test.ts).
 */
import { bumpDataRev } from './history';
import type { AppData, ReviewItem, Session, SongRun } from './schema';

/** Tỉ lệ nốt micro nghe được để một lượt cũ trong hàng chờ được tính như micro chấm ĐẠT (= PASS_SCORE của music/timing). */
export const SETTLE_PASS = 0.8;

/** "micro nghe chưa rõ (nghe được 7/10 nốt)" → { hits: 7, total: 10 }; không có số → null. */
export function micHeard(mic: string | undefined): { hits: number; total: number } | null {
  const m = /nghe được\s+(\d+)\s*\/\s*(\d+)/u.exec(mic ?? '');
  if (!m) return null;
  const hits = Number(m[1]);
  const total = Number(m[2]);
  return total > 0 && hits >= 0 && hits <= total ? { hits, total } : null;
}

/** Chèn theo thứ tự thời gian (các hàm "lượt gần nhất" đọc phần tử cuối). */
function insertByTs<T extends { ts: number }>(arr: T[], x: T): void {
  let i = arr.length;
  while (i > 0 && arr[i - 1].ts > x.ts) i--;
  arr.splice(i, 0, x);
}

/** Buổi của mục (hoặc buổi tối thiểu cùng ngày & cùng mã bài nếu buổi đã bị xoá). */
function sessionFor(data: AppData, item: ReviewItem): Session {
  const s = item.sessionId ? data.sessions.find((x) => x.id === item.sessionId) : undefined;
  if (s) return s;
  const id = `rv-${item.id}`;
  const made = data.sessions.find((x) => x.id === id);
  if (made) return made;
  const stub: Session = {
    id,
    date: item.date,
    lessonId: item.lessonId ?? 'review',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: item.ts,
    endedAt: item.ts,
    minutes: 0,
    completed: false,
    checklist: {},
  };
  let i = data.sessions.length;
  while (i > 0 && data.sessions[i - 1].startedAt > stub.startedAt) i--;
  data.sessions.splice(i, 0, stub);
  return stub;
}

/** Kết quả dọn hàng chờ cũ: mã các mục đã xử lý (để xoá bản ghi âm) + số lượt được tính như micro chấm. */
export interface SettleResult {
  dropped: string[];
  counted: number;
}

/**
 * Giải quyết MỘT lần mọi mục còn trong hàng chờ cũ (xem đầu file) rồi xoá trường `reviews`. SỬA TẠI CHỖ `data`.
 * Không có mục nào → không đổi gì ({ dropped: [], counted: 0 }). Gọi lại nhiều lần vẫn an toàn.
 */
export function settleLegacyReviews(data: AppData): SettleResult {
  const list = data.reviews;
  if (!list) return { dropped: [], counted: 0 };
  let counted = 0;
  for (const item of [...list].sort((a, b) => a.ts - b.ts)) {
    if (item.kind !== 'song' || !item.run || item.visual) continue;
    const heard = micHeard(item.mic);
    if (!heard || heard.hits / heard.total < SETTLE_PASS) continue;
    const run: SongRun = { ...item.run, total: heard.total, hits: heard.hits, source: 'mic', passed: true, ts: item.ts };
    insertByTs(sessionFor(data, item).songRuns, run);
    counted++;
  }
  const dropped = list.map((r) => r.id);
  delete data.reviews;
  bumpDataRev(data);
  return { dropped, counted };
}

/** Buổi còn mục chờ — gộp lịch sử không gộp các buổi này (sau khi dọn: luôn rỗng; giữ cho dữ liệu chưa dọn). */
export function pinnedSessionIds(data: Readonly<AppData>): Set<string> {
  return new Set((data.reviews ?? []).flatMap((r) => (r.sessionId ? [r.sessionId] : [])));
}
