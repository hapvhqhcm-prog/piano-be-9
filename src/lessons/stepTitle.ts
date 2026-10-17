/**
 * (+ 2026-10-17, OWNER duyệt "Nhạc đệm + bài vui hơn") TÊN BƯỚC THEO BÀI HÁT: nút / nhãn của một hoạt động gọi bằng TÊN
 * BÀI (vd "Ếch con nhảy"), không bằng tên cấp độ của bài học ("Mức 2: Mỗi phách một nốt"). Dùng cho đầu màn bài hát, nhãn
 * bước trong buổi, nút ▶ ở màn chính (lessons/todayLabel.ts PlayLabelOpts.stepTitle).
 */
import { findTune } from '../music/exercises';
import { THEORY } from './theory';
import type { Activity, Lesson } from './types';

/** Bỏ ghi chú trong ngoặc ("(8 ô nhịp)") và tiền tố cấp độ ("Mức 2:") của một tên. */
export function tidyStepName(s: string): string {
  return s
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^\s*Mức\s*\d+\s*[:·–-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tên bài (titleVi) của bài hát / bài tập theo mã; null nếu không có. */
function tuneName(id: string): string | null {
  const t = findTune(id);
  const name = t ? tidyStepName(t.titleVi || t.title) : '';
  return name || null;
}

/**
 * Tên một bước (hoạt động của bài học) để hiện cho bé: bài hát → tên bài hát (tay tập riêng: "· tay phải/trái");
 * hoạt động khác → tên do giáo trình đặt (bỏ "Mức N:"). Không bao giờ rỗng.
 */
export function stepTitle(a: Activity): string {
  switch (a.kind) {
    case 'song': {
      const name = tuneName(a.songId) ?? 'Bài hát';
      return a.hand ? `${name} · ${a.hand === 'RH' ? 'tay phải' : 'tay trái'}` : name;
    }
    case 'notes':
      return tidyStepName(a.segment.title) || 'Học nốt';
    case 'stage':
      return 'Lên sân khấu';
    case 'theory': {
      const first = THEORY.find((c) => c.id === a.ids[0]);
      return first ? tidyStepName(first.title) : 'Biết thêm nhạc lý';
    }
    case 'musician':
      return musicianSong(a) ?? (tidyStepName(a.title) || 'Nhạc công nhỏ');
    default:
      return tidyStepName(a.title) || 'Bài học';
  }
}

/** Nhạc công nhỏ (đánh bóng / dịch giọng / đệm hợp âm… trên một bài): tên bài đó nếu có. */
function musicianSong(a: Extract<Activity, { kind: 'musician' }>): string | null {
  // Đàn theo tai: KHÔNG lộ tên bài (bé dò bằng tai)
  if (a.task.type === 'by-ear') return null;
  const id = (a.task as { songId?: unknown }).songId;
  return typeof id === 'string' ? tuneName(id) : null;
}

/**
 * Tên của một BÀI HỌC theo bài hát: bài hát đầu tiên từ hoạt động `from` (học tiếp phần còn dở), không có thì bài hát bất kỳ
 * của bài, không có bài hát → tên bài học bỏ "Mức N:".
 */
export function lessonStepTitle(lesson: Pick<Lesson, 'title' | 'activities'>, from = 0): string {
  const songs = lesson.activities.map((a, i) => ({ a, i })).filter((x) => x.a.kind === 'song');
  const pick = songs.find((x) => x.i >= from) ?? songs[0];
  if (pick) return stepTitle(pick.a);
  return tidyStepName(lesson.title) || lesson.title;
}
