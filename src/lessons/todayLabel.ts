/**
 * (+ 2026-10-17, OWNER duyệt "Màn chính: 1 nút to + bản đồ") TÊN CỦA NÚT ▶ TO trên màn chính — tên BÀI HÁT / hoạt động
 * hôm nay ("▶ 🎵 Ếch con nhảy"), không phải tên bài học kiểu giáo trình ("Mức 2: Mỗi phách một nốt").
 * Cũng dùng cho dòng "Ngày mai: 🎵 …" ở màn kết buổi. Hàm THUẦN (test: tests/kidHome-2026-10-17.test.ts).
 *
 * Quy tắc:
 *  1. Chỉ xét các hoạt động buổi tới SẼ chạy: bài chưa xong → bỏ các hoạt động đã đánh dấu "<bài>#<i>" (giống
 *     sessionPlan.buildSessionPlan "học tiếp phần còn dở"); bài đã xong (học lại) → cả bài.
 *  2. Hoạt động đầu tiên có BÀI HÁT thật (Thư viện; nhạc công nhỏ có bài) → "🎵 <tên bài>".
 *  3. Không có bài hát → tên thân thiện của hoạt động đầu tiên có tên (stepTitle nếu có, rồi title của hoạt động; bài
 *     TẬP như "Mỗi phách một nốt (8 ô nhịp)" → "Mỗi phách một nốt"), kèm emoji của bài học.
 *  4. Không có gì → tên bài học (bỏ tiền tố "Mức N:").
 */
import type { AppData } from '../progress/schema';
import type { Activity, Lesson } from './types';
import { activityDoneId } from './curriculum';
import { findTune } from '../music/exercises';
import { findSong } from '../music/tune';

export interface PlayLabel {
  /** Biểu tượng đứng trước tên (🎵 cho bài hát, emoji bài học cho hoạt động khác) */
  icon: string;
  /** Tên ngắn cho bé */
  text: string;
  /** Chỉ số hoạt động (trong lesson.activities) đặt tên cho nút; null = dùng tên bài học */
  index: number | null;
}

/** Độ dài tối đa của tên trên nút (vừa một dòng chữ to trên iPad mini) */
export const LABEL_MAX = 30;

/** Bỏ tiền tố giáo trình "Mức 2:" / "Bài 3 -" và cắt cho vừa một dòng. */
export function tidyLabel(t: string, max = LABEL_MAX): string {
  const s = t
    .replace(/^\s*(?:Mức|Bài|Cấp|Bước)\s*\d+\s*[:.\-–—]\s*/iu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : s;
}

/** Các hoạt động buổi tới sẽ chạy (chỉ số gốc giữ nguyên). */
export function upcomingActivities(lesson: Lesson, data: Readonly<AppData>): Array<{ activity: Activity; index: number }> {
  const all = lesson.activities.map((activity, index) => ({ activity, index }));
  const done = new Set(data.progress.lessonsCompleted);
  if (done.has(lesson.id)) return all;
  const rest = all.filter((x) => !done.has(activityDoneId(lesson.id, x.index)));
  return rest.length ? rest : all;
}

/** Mã bài hát của hoạt động (null = không có bài hát). */
export function activitySongId(a: Activity): string | null {
  if (a.kind === 'song') return a.songId;
  // Đàn theo tai: KHÔNG lộ tên bài (bé dò bằng tai)
  if (a.kind === 'musician' && a.task.type !== 'by-ear' && 'songId' in a.task) return a.task.songId;
  return null;
}

/** Tên thân thiện của một hoạt động không có bài hát (null = không đặt tên được). */
export function activityName(a: Activity, tuneTitle: (id: string) => string | null | undefined = defaultTuneTitle): string | null {
  const id = activitySongId(a);
  if (id) {
    const t = tuneTitle(id);
    // Bài tập: bỏ phần ghi chú trong ngoặc ("(8 ô nhịp)")
    return t ? t.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || null : null;
  }
  switch (a.kind) {
    case 'stage':
      return 'Lên sân khấu';
    case 'theory':
      return 'Biết thêm nhạc lý';
    case 'notes':
      return null;
    default:
      return 'title' in a && typeof a.title === 'string' && a.title.trim() ? a.title : null;
  }
}

export interface PlayLabelOpts {
  /** Tên bài hát theo mã (mặc định findTune → titleVi) */
  songTitle?: (songId: string) => string | null | undefined;
  /** Tên bước do giáo trình đặt (lessons stepTitle, nếu có) — ưu tiên trước activityName */
  stepTitle?: (a: Activity) => string | null | undefined;
}

const defaultSongTitle = (id: string): string | null => findSong(id)?.titleVi ?? null;
const defaultTuneTitle = (id: string): string | null => findTune(id)?.titleVi ?? null;

/** Tên nút ▶ cho bài học `lesson`. */
export function playLabel(lesson: Lesson, data: Readonly<AppData>, opts: PlayLabelOpts = {}): PlayLabel {
  const songTitle = opts.songTitle ?? defaultSongTitle;
  const todo = upcomingActivities(lesson, data);
  for (const x of todo) {
    const id = activitySongId(x.activity);
    let t = id ? songTitle(id) : null;
    // Bài tập (không có trong Thư viện) vẫn là BÀI để đàn: tên bước theo bài (stepTitle → "Ếch con nhảy")
    if (!t && id && opts.stepTitle) {
      try {
        t = opts.stepTitle(x.activity);
      } catch {
        t = null;
      }
    }
    if (t) return { icon: '🎵', text: tidyLabel(t), index: x.index };
  }
  for (const x of todo) {
    let t: string | null | undefined = null;
    try {
      t = opts.stepTitle?.(x.activity);
    } catch {
      t = null;
    }
    t = t || activityName(x.activity);
    if (t) return { icon: lesson.emoji, text: tidyLabel(t), index: x.index };
  }
  return { icon: lesson.emoji, text: tidyLabel(lesson.title), index: null };
}
