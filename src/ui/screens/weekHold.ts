/**
 * "Ở lại tuần này thêm" (màn Phụ huynh) — tách khỏi tonight.ts để buổi học (session.ts) không phải nạp cả
 * tonight + parentSongs + solfege chỉ vì một phép so sánh (code-splitting, src/ui/lazy.ts).
 */
import type { Settings } from '../../progress/schema';

/** Settings thêm (cộng dồn, không cần migration): bố mẹ GIỮ bé ở lại một tuần. */
export interface HoldSettings {
  /** Số tuần đang giữ (app không tự sang tuần mới khi currentWeek === holdWeek); null/không có = không giữ */
  holdWeek?: number | null;
}

/** Bố mẹ đang giữ bé ở lại tuần `week`? (session.ts kiểm tra trước khi tự sang tuần mới) */
export function weekHeld(settings: Readonly<Settings>, week: number): boolean {
  return (settings as Settings & HoldSettings).holdWeek === week;
}
