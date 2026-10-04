import type { Hand } from '../piano/fingering';
import type { Pitch } from '../piano/pitchTable';
import type { QuizSpec } from '../practice/quiz';

/** Một "việc" ở chế độ Từng nốt: bé tìm & đánh trên đàn thật, bố/mẹ (hoặc micro) xác nhận. */
export interface Target {
  /** Mã ghi vào PARENT_ASSESSMENT.note */
  noteId: string;
  /** Dòng chữ to nhất trên màn (vd "Đô / C") */
  title: string;
  /** Dòng phụ ngắn (vd "Đô giữa") */
  subtitle?: string;
  /** Biểu tượng lớn thay cho số ngón (bước tư thế) */
  emoji?: string;
  /** Phím cần đánh — sáng trên bàn phím ảo */
  keys: Pitch[];
  /** Phím gợi ý (sáng mờ) — vd nhóm 2 phím đen cạnh Đô */
  guides?: Pitch[];
  finger?: number;
  hand?: Hand;
  /** Âm mẫu; rỗng/không có = không có nút "Nghe lại" */
  sample?: Pitch[];
  /** Trò "Nhại lại": phải đàn các phím theo ĐÚNG THỨ TỰ */
  sequence?: boolean;
  /** Hiện nốt trên khuông nhạc (tuần 7) */
  staff?: boolean;
}

export interface Segment {
  id: string;
  /** Bước trong giáo trình, vd "B1" */
  step: string;
  title: string;
  intro: string;
  targets: Target[];
}

/** Nhịp tuần 4 mức 1: "Đi" (1 phách) · "Chạy-chạy" (2 nửa phách) · "Đi-i" (2 phách) · "Suỵt" (lặng). */
export type RhythmSymbol = 'walk' | 'run' | 'long' | 'rest';

export type Activity =
  | { kind: 'notes'; segment: Segment }
  | { kind: 'quiz'; title: string; intro: string; quiz: QuizSpec }
  | {
      kind: 'song';
      songId: string;
      mode: 'wait' | 'tempo';
      /** Theo nhịp: 2 = nốt đứng yên con trỏ nhảy, 3 = băng chuyền */
      level?: 2 | 3;
      hints: 'full' | 'names' | 'staff';
      intro?: string;
    }
  | { kind: 'rhythm'; title: string; intro: string; patterns: RhythmSymbol[][] }
  | { kind: 'stage' };

export interface Lesson {
  id: string;
  week: number;
  title: string;
  emoji: string;
  activities: Activity[];
  /** Bài kiểm tra tiêu chí qua tuần */
  isWeekTest?: boolean;
}

export type CriterionWho = 'PARENT' | 'SELF' | 'APP' | 'PARENT/MIC';

export interface WeekPlan {
  week: number;
  /** Tên hòn đảo trên bản đồ "Hành trình tới Lâu đài Âm nhạc" */
  island: string;
  islandEmoji: string;
  title: string;
  /** Một câu kể chuyện mở đầu tuần */
  story: string;
  lessons: Lesson[];
  /** Khởi động tai/đọc nốt 2' đầu buổi; null = không có */
  warmup: QuizSpec | null;
  /** "Con làm thầy" 1' cuối buổi */
  teach: { emoji: string; text: string };
  criterion: { text: string; who: CriterionWho };
  /** Tuần dùng tay trái */
  leftHand?: boolean;
}
