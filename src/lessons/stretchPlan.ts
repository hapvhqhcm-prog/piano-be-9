/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") BÀI KHÓ HƠN CHO BÉ GIỎI — thử thách NẰM TRONG BUỔI khi chế độ độ khó là
 * 'stretch' (lessons/adaptive.ts — nay bật sau 2 buổi rất tốt):
 * - bỏ bước THỪA với thứ bé đã vững: lượt tách tay / một câu / từng nốt của bài đã đạt trọn bài theo nhịp (stretchTrim),
 *   "Ôn nhanh" và "Ôn bài cũ" của bài đã thuộc (sessionPlan);
 * - bài quen mở đúng TỐC ĐỘ CỦA BÀI (adaptive.stretchFamiliarBpm), nút "🐇 Nhanh hơn" hiện sớm hơn (songResult);
 * - thêm tối đa HAI bước "⭐" sau bài: 👀 xem trước bài của tuần sau (hai tay cùng lúc nếu có) + 🚀 một bài Thư viện cao hơn
 *   một bậc (stretchExtras). Bước ⭐ không phải hoạt động của bài (không đánh dấu xong bài), chỉ ghi lượt ĐẠT (session.ts) —
 *   thử chưa được không làm buổi sau "nhẹ tay".
 * AN TOÀN TIẾN ĐỘ: tiêu chí tuần đọc lượt TRỌN BÀI (không tách tay / một câu) — các bước bị bỏ không phải bằng chứng tiêu chí;
 * mã bài / chỉ số hoạt động không đổi; buổi bài kiểm tra / sân khấu / luyện tập mỗi ngày / chơi lại không đổi.
 * Module THUẦN.
 */
import { SONGS, type Tune } from '../music/tune';
import type { AppData } from '../progress/schema';
import type { Activity } from './types';
import type { SessionStep } from './sessionPlan';
import { songEverPlayed, songMastered, songStats } from './songStats';

export type StretchStep = Extract<SessionStep, { kind: 'stretch-song' }>;

/** Bài Thư viện "cao hơn một bậc": bài của tuần sau tuần đang học, xa nhất ngần này tuần. */
export const STRETCH_AHEAD = 2;

/** Bài đã đạt TRỌN BÀI THEO NHỊP (songStats `b`) — đã vững, không cần các bước tập chậm / tách tay. */
const solidSong = (data: Readonly<AppData>, songId: string): boolean => songStats(data)[songId]?.b !== undefined;

/**
 * Bỏ các hoạt động bài hát THỪA cho bé đang làm rất tốt: lượt tách tay (`hand`), một câu (`phrase`), hoặc từng nốt (`wait`)
 * của bài đã đạt trọn bài theo nhịp. Luôn giữ ít nhất một hoạt động; không đổi `index`.
 */
export function stretchTrim<T extends { activity: Activity; index: number }>(todo: readonly T[], data: Readonly<AppData>): T[] {
  const keep = todo.filter((x) => {
    const a = x.activity;
    if (a.kind !== 'song' || a.songId.startsWith('sight')) return true;
    const drill = !!a.hand || !!a.phrase || a.mode === 'wait';
    return !(drill && solidSong(data, a.songId));
  });
  return keep.length ? keep : [...todo];
}

const playable = (t: Tune) => !t.id.startsWith('sight') && t.notes.length > 0;
const name = (t: Tune) => t.titleVi || t.title;

/**
 * Hai bước ⭐ thêm vào cuối buổi (trước màn kết) cho tuần `week`:
 * 1. 👀 Xem trước: bài của tuần SAU (ưu tiên bài hai tay cùng lúc — có bè `lh`), chưa thuộc, từng nốt.
 * 2. 🚀 Bài khó hơn: một bài trong STRETCH_AHEAD tuần tới, chưa chơi lần nào, khác bài xem trước (bài xa hơn trước).
 */
export function stretchExtras(week: number, data: Readonly<AppData>, exclude: readonly string[] = []): StretchStep[] {
  const out: StretchStep[] = [];
  const skip = new Set(exclude);
  const next = SONGS.filter((t) => (t.week ?? 1) === week + 1 && playable(t) && !skip.has(t.id) && !songMastered(data, t.id));
  const preview = next.find((t) => t.lh?.some((n) => !n.rest)) ?? next[0];
  if (preview) {
    skip.add(preview.id);
    const both = !!preview.lh?.some((n) => !n.rest);
    out.push({
      kind: 'stretch-song',
      what: 'preview',
      songId: preview.id,
      mode: 'wait',
      hints: 'full',
      intro: both ? `👀 Xem trước bài tuần sau — “${name(preview)}” hai tay cùng lúc! Từng nốt nhé.` : `👀 Xem trước bài tuần sau — “${name(preview)}”. Từng nốt nhé.`,
    });
  }
  const up = SONGS.filter((t) => {
    const w = t.week ?? 1;
    return w > week && w <= week + STRETCH_AHEAD && playable(t) && !skip.has(t.id) && !songEverPlayed(data, t.id);
  }).sort((a, b) => (b.week ?? 1) - (a.week ?? 1))[0];
  if (up) {
    out.push({ kind: 'stretch-song', what: 'library', songId: up.id, mode: 'wait', hints: 'names', intro: `🚀 Bài khó hơn một chút — “${name(up)}”. Chưa được cũng không sao!` });
  }
  return out;
}
