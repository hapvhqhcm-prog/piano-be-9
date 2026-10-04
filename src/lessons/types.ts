import type { Hand } from '../piano/fingering';
import type { Pitch } from '../piano/pitchTable';

/** Một "việc" ở chế độ Từng nốt: bé tìm & đánh trên đàn thật, bố/mẹ xác nhận. */
export interface Target {
  /** Mã ghi vào PARENT_ASSESSMENT.note */
  noteId: string;
  /** Dòng chữ to nhất trên màn (vd "Đô / C") */
  title: string;
  /** Dòng phụ ngắn (vd "Đô giữa") */
  subtitle?: string;
  /** Biểu tượng lớn thay cho số ngón (bước tư thế / đếm ngón) */
  emoji?: string;
  /** Phím cần đánh — sáng trên bàn phím ảo */
  keys: Pitch[];
  /** Phím gợi ý (sáng mờ) — vd nhóm 2 phím đen cạnh Đô */
  guides?: Pitch[];
  finger?: number;
  hand?: Hand;
  /** Âm mẫu; rỗng/không có = không có nút "Nghe lại" */
  sample?: Pitch[];
}

export interface Segment {
  id: string;
  /** Bước trong giáo trình, vd "B1" */
  step: string;
  title: string;
  intro: string;
  targets: Target[];
}

export interface Lesson {
  id: string;
  week: number;
  title: string;
  emoji: string;
  segments: Segment[];
  /** Bài kiểm tra tiêu chí qua tuần */
  isWeekTest?: boolean;
}

export type CriterionWho = 'PARENT' | 'SELF' | 'APP';

export interface WeekPlan {
  week: number;
  title: string;
  lessons: Lesson[];
  /** Nốt cho trò chơi tai nghe; rỗng = tuần này chưa có tai nghe */
  earPool: Pitch[];
  earRounds: number;
  criterion: { text: string; who: CriterionWho };
}
