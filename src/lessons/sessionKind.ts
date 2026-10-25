/**
 * (+ 2026-10-17, rà soát kỹ sư trưởng) MỘT CHỖ DUY NHẤT phân loại buổi theo mã bài (`Session.lessonId`). Trước đây mỗi nơi
 * tự đoán bằng tiền tố / regex riêng (isLessonSession, isRewardLessonId, optionalSession trong adaptive, weekOfLessonId…)
 * → buổi "⭐ Thử thách nhỏ" (`stretch-song-…`) bị tính vào "đã thuộc" (songStats / compaction chỉ bỏ `reward-song-`).
 *
 * Mã bài:
 * - 'lesson'  `w<tuần>-l<n>` / `w<tuần>-test` / mọi mã `w<tuần>-…` khác không thuộc các loại dưới — buổi bài học.
 * - 'daily'   `w<tuần>-daily` — luyện tập mỗi ngày (vẫn là buổi bài học).
 * - 'library' `w<tuần>-song-<bài>` — Thư viện / buổi ngắn / bố mẹ mở một bài (giữ NGỮ NGHĨA CŨ: vào tiêu chí tuần, vào
 *             "đã thuộc", vào chỉ số độ khó; không phải buổi bài học cho sticker bất ngờ).
 * - 'parent'  `w<tuần>-parent-…` — "▶ Làm ngay" của bố mẹ.
 * - 'reward'  `reward-song-<bài>` — 🎁 bài thưởng ở màn kết.
 * - 'stretch' `stretch-song-<bài>` — ⭐ thử thách nhỏ ở màn kết.
 * - 'check'   `placement-<ngày>` — (+ 2026-10-25) 🧭 kiểm tra xếp lớp (lessons/placement.ts): buổi tùy chọn, không theo tuần.
 * - 'other'   mã lạ (dữ liệu cũ / test) — đối xử như buổi bài học (như regex cũ của isLessonSession).
 *
 * Buổi TÙY CHỌN ('reward' | 'stretch'): không vào tiêu chí tuần (không có tuần), không vào "đã thuộc", không vào chỉ số độ
 * khó (adaptive). Module THUẦN, không import gì (mọi module đều nhập được, không vòng import).
 */
export type SessionKind = 'lesson' | 'daily' | 'library' | 'parent' | 'reward' | 'stretch' | 'check' | 'other';

export const REWARD_LESSON_PREFIX = 'reward-song-';
export const STRETCH_LESSON_PREFIX = 'stretch-song-';
export const PLACEMENT_LESSON_PREFIX = 'placement-';

const WEEK_RE = /^w(\d+)-/;

export function sessionKind(lessonId: string): SessionKind {
  if (lessonId.startsWith(REWARD_LESSON_PREFIX)) return 'reward';
  if (lessonId.startsWith(STRETCH_LESSON_PREFIX)) return 'stretch';
  if (lessonId.startsWith(PLACEMENT_LESSON_PREFIX)) return 'check';
  if (/-parent-/.test(lessonId)) return 'parent';
  if (/-song-/.test(lessonId)) return 'library';
  if (/^w\d+-daily$/.test(lessonId)) return 'daily';
  if (WEEK_RE.test(lessonId)) return 'lesson';
  return 'other';
}

/** Tuần giáo trình của mã bài ("w12-l3" → 12); null = không theo tuần (bài thưởng, thử thách nhỏ, mã lạ). */
export function lessonWeek(lessonId: string): number | null {
  const m = WEEK_RE.exec(lessonId);
  return m ? Number(m[1]) : null;
}

/** Buổi TÙY CHỌN (🎁 bài thưởng, ⭐ thử thách nhỏ ở màn kết; 🧭 kiểm tra xếp lớp). */
export const isOptionalKind = (k: SessionKind): boolean => k === 'reward' || k === 'stretch' || k === 'check';
export const isOptionalLessonId = (lessonId: string): boolean => isOptionalKind(sessionKind(lessonId));

/** Lượt trong buổi này được tính "đã thuộc" (songStats / compaction) — mọi buổi trừ buổi tùy chọn. */
export const countsForMastery = (lessonId: string): boolean => !isOptionalLessonId(lessonId);

/** Buổi vào chỉ số độ khó (adaptive) — mọi buổi trừ buổi tùy chọn. */
export const countsForDifficulty = (lessonId: string): boolean => !isOptionalLessonId(lessonId);

/** Buổi BÀI HỌC (sticker bất ngờ, gộp lịch sử): không Thư viện / bố mẹ / bài thưởng / thử thách. Mã lạ = bài học (như cũ). */
export const isLessonKind = (k: SessionKind): boolean => k === 'lesson' || k === 'daily' || k === 'other';
