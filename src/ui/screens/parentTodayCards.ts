/**
 * Màn Phụ huynh — "👪 Bố mẹ 30 giây" cho buổi tới. (2026-10-17) Các thẻ hằng ngày cũ (📝 Việc cần làm tối nay, 🎤 Cài micro,
 * 🟢🟡🔴 Sẵn sàng sang tuần mới?, 📊 Báo cáo tuần) đã gộp vào "✅ Hôm nay bố mẹ cần" (parentToday.ts) và "🗓️ Tuần N"
 * (parentWeek.ts).
 */
import type { AppData } from '../../progress/schema';
import { nextLesson } from '../../lessons/nextLesson';
import { parentFocus, type ParentFocus } from '../../lessons/parentFocus';
import { handFocus, readHandLook } from '../../lessons/handTechnique';
import { octaveTrouble, readOctaveLog } from '../../lessons/middleC';

/** (+ 2026-10-16, OWNER duyệt) "👪 Bố mẹ 30 giây" cho buổi tới (bài "Học tiếp") — null nếu không tính được. */
export function todayFocus(d: Readonly<AppData>, now: Date): ParentFocus | null {
  try {
    const lesson = nextLesson(d, () => 0, now);
    const t = now.getTime();
    return parentFocus(lesson, {
      hand: handFocus(d, t, readHandLook()),
      octave: octaveTrouble(readOctaveLog(), t),
      lessonDone: d.progress.lessonsCompleted.includes(lesson.id),
    });
  } catch {
    return null;
  }
}
