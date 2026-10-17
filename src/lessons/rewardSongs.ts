/**
 * (+ 2026-10-16, OWNER duyệt — rà soát của giáo viên có kinh nghiệm) "🎁 PHẦN THƯỞNG: BÀI CON THÍCH" ở màn kết buổi:
 * buổi suôn sẻ → nút (không phải màn mừng — celebrationQueue không đổi) "🎁 Chọn 1 bài con thích" → 3–6 bài trong Thư viện
 * bé chơi được (đã mở; ưu tiên bài con đã chơi và thích + MỘT bài "Mới"), chơi tự do (Từng nốt, hoặc theo nhịp ở tốc độ
 * thoải mái cho bài đã thuộc; gợi ý đầy đủ).
 * - Lượt chơi VẪN được lưu (như lượt ở Thư viện) trong buổi `reward-song-<bài>` — mã buổi KHÔNG bắt đầu bằng "w<tuần>-"
 *   → không vào tiêu chí tuần (sessionsOfWeek), không phải buổi bài học (isLessonSession); songStats bỏ qua lượt của buổi
 *   này khi tính "đã thuộc" (REWARD_LESSON_PREFIX) — sao và "lần chơi gần nhất" vẫn ghi.
 * Hàm thuần — test: tests/sessionHelpers-2026-10-16.test.ts.
 */
import { SONGS, type Tune } from '../music/tune';
import type { AppData, Session } from '../progress/schema';
import { isNewSong } from './discovery';
import { REWARD_LESSON_PREFIX, isRewardLessonId, songStats } from './songStats';
import { KIND_STOP_TRIES, hadKindStop } from './adaptive';

export { REWARD_LESSON_PREFIX };
/** Mã buổi của lượt chơi phần thưởng: `reward-song-<songId>`. */
export const rewardLessonId = (songId: string): string => `${REWARD_LESSON_PREFIX}${songId}`;
export const isRewardSession = (s: Pick<Session, 'lessonId'>): boolean => isRewardLessonId(s.lessonId);

/** Số lượt chơi đạt trong buổi để được thưởng (khi bài chưa học xong). */
export const REWARD_MIN_PASSED = 2;
/** (+ 2026-10-16) "Dừng nhẹ nhàng" (KIND_STOP_TRIES, hadKindStop) nay ở lessons/adaptive.ts — export lại giữ API cũ. */
export { KIND_STOP_TRIES, hadKindStop };
export const REWARD_MIN = 3;
export const REWARD_MAX = 6;
/** Tốc độ "thoải mái" khi chơi theo nhịp bài đã thuộc. */
export const REWARD_COMFY_BPM = 60;

/**
 * Buổi SUÔN SẺ → mời chọn bài thưởng. (+ 2026-10-17, rà soát kỹ sư trưởng) Cần CẢ HAI: KHÔNG có "dừng nhẹ nhàng" (hadKindStop —
 * cùng định nghĩa với chỉ số độ khó) VÀ có tiến bộ của BÀI HỌC: học xong bài, hoặc ≥ REWARD_MIN_PASSED lượt ĐẠT trong các
 * HOẠT ĐỘNG BÀI HỌC (`lessonPassed` — session.ts đếm; lượt bài tập về nhà / "Ôn bài cũ" không tính). Trước đây buổi có dừng
 * nhẹ nhàng vẫn được thưởng nếu có 2 lượt đạt ở đâu đó trong buổi.
 * Chơi lại bài vừa học → không mời lần nữa.
 */
export function rewardEligible(o: {
  session: (Pick<Session, 'songRuns'> & { kindStops?: readonly string[] }) | null | undefined;
  lessonFinished: boolean;
  /** Số lượt bài hát ĐẠT trong các hoạt động bài học của buổi */
  lessonPassed: number;
  replay?: boolean;
}): boolean {
  if (o.replay || !o.session) return false;
  if (hadKindStop(o.session)) return false;
  return o.lessonFinished || o.lessonPassed >= REWARD_MIN_PASSED;
}

export interface RewardChoice {
  tune: Tune;
  /** Bài con chưa chơi lần nào ("Mới") */
  fresh: boolean;
  /** Bài con đã thuộc → mở theo nhịp ở tốc độ thoải mái; còn lại Từng nốt */
  mastered: boolean;
}

/**
 * 3–6 bài cho bé chọn: bài con đã chơi và thích (đã thuộc → nhiều sao → mới chơi gần đây; tối đa 5) + MỘT bài "Mới"
 * (bài vừa thêm vào Thư viện chưa chơi → bài chưa chơi của các tuần đã học, tuần gần nhất trước). Chưa đủ 3 → thêm bài
 * chưa chơi của các tuần đã học. Chỉ bài ĐÃ MỞ (tuần ≤ tuần hiện tại), không bài đọc nhạc ngẫu nhiên. Không đủ 3 → [].
 * `exclude`: bài vừa học trong buổi (con vừa chơi rồi) — vẫn dùng nếu thiếu bài.
 */
export function rewardChoices(data: Readonly<AppData>, exclude: readonly string[] = []): RewardChoice[] {
  const week = data.progress.currentWeek;
  const stats = songStats(data);
  const skip = new Set(exclude);
  const open = SONGS.filter((t) => (t.week ?? 1) <= week && !t.id.startsWith('sight'));
  const played = open.filter((t) => !!stats[t.id]?.r);
  const liked = played
    .filter((t) => (stats[t.id]?.s ?? 0) >= 1 || stats[t.id]?.h === 1 || stats[t.id]?.m !== undefined)
    .sort((x, y) => {
      const a = stats[x.id];
      const b = stats[y.id];
      return (
        (b.m !== undefined ? 1 : 0) - (a.m !== undefined ? 1 : 0) ||
        (b.s ?? 0) - (a.s ?? 0) ||
        (b.r?.[0] ?? 0) - (a.r?.[0] ?? 0) ||
        x.id.localeCompare(y.id)
      );
    });
  const fav = [...liked.filter((t) => !skip.has(t.id)), ...liked.filter((t) => skip.has(t.id))].slice(0, REWARD_MAX - 1);
  const unplayed = open.filter((t) => !stats[t.id]?.r);
  // Bài "Mới": bài vừa thêm vào Thư viện → bài của tuần TRƯỚC đã học (đúng tầm) → bài tuần này
  const byWeek = (a: Tune, b: Tune) => (b.week ?? 1) - (a.week ?? 1) || a.id.localeCompare(b.id);
  const freshPool = [
    ...unplayed.filter((t) => isNewSong(data, t)).sort(byWeek),
    ...unplayed.filter((t) => !isNewSong(data, t) && (t.week ?? 1) < week).sort(byWeek),
    ...unplayed.filter((t) => !isNewSong(data, t) && (t.week ?? 1) >= week).sort(byWeek),
  ];
  const out: RewardChoice[] = fav.map((t) => ({ tune: t, fresh: false, mastered: stats[t.id]?.m !== undefined }));
  for (const t of freshPool) {
    if (out.length >= REWARD_MAX) break;
    const fresh = out.filter((c) => c.fresh).length;
    // MỘT bài "Mới" — thêm bài mới khác chỉ khi chưa đủ REWARD_MIN
    if (fresh >= 1 && out.length >= REWARD_MIN) break;
    out.push({ tune: t, fresh: true, mastered: false });
  }
  return out.length >= REWARD_MIN ? out : [];
}

/** Cách mở bài thưởng: đã thuộc → theo nhịp (Mức 2) ở tốc độ thoải mái; còn lại → Từng nốt. Luôn gợi ý đầy đủ. */
export function rewardPlayOptions(c: RewardChoice): { mode: 'wait' | 'tempo'; level?: 2; bpm?: number; hints: 'full' } {
  return c.mastered
    ? { mode: 'tempo', level: 2, bpm: Math.min(c.tune.bpm, REWARD_COMFY_BPM), hints: 'full' }
    : { mode: 'wait', hints: 'full' };
}
