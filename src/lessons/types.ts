import type { Hand, PositionId } from '../piano/fingering';
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
  /** Số ngón cho TỪNG phím (nhại lại / hợp âm ở thế khác thế Đô) */
  fingers?: number[];
  /** Khóa hiện trên khuông (mặc định theo tay) */
  clef?: 'treble' | 'bass';
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
/**
 * walk = nốt đen "Đi" (1 phách) · run = hai móc đơn "Chạy-chạy" · long = nốt trắng "Đi-i" (2 phách)
 * long3 = nốt trắng chấm "Đi-i-i" (3 phách) · dotted = đen chấm + móc đơn "Đi-chấm chạy" (2 phách: vỗ ở 0 và 1,5)
 * rest = lặng đen "Suỵt".
 */
export type TechniqueDrill = 'arm-drop' | 'wrist-circle' | 'finger-tap' | 'five-finger' | 'thumb-under' | 'hand-shape';

/**
 * v5 (OWNER duyệt 2026-10-05 — dạy nhịp TRƯỚC bài dùng nhịp đó; tuần 18 "Suối Móc Kép"):
 * run4 = bốn móc kép "Chạy-chạy-chạy-chạy" (1 phách) · run3 = móc đơn + 2 móc kép "Chạy chạy-chạy" (1 phách)
 * dotted8 = móc đơn chấm + móc kép "Tập-tễnh" (1 phách: vỗ ở 0 và 0,75)
 * tie = hai nốt đen nối bằng DÂY NỐI "Đi‿đi" (2 phách, vỗ MỘT lần) · sync = nghịch phách "Chạy-Đi-chạy" (2 phách: vỗ 0, 0,5, 1,5).
 * Nhịp 2/4 (tuần 9): mẫu dài 2 phách dùng các ký hiệu sẵn có.
 */
export type RhythmSymbol = 'walk' | 'run' | 'long' | 'long3' | 'dotted' | 'rest' | 'run4' | 'run3' | 'dotted8' | 'tie' | 'sync';

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
      /** v5.1 — Tập TÁCH TAY có sẵn trong bài (bài hai tay): chỉ tay này; không có = hai tay */
      hand?: 'RH' | 'LH';
    }
  | { kind: 'rhythm'; title: string; intro: string; patterns: RhythmSymbol[][] }
  /** Đọc nhạc ngẫu nhiên: sinh `count` đoạn nhạc mới trong một thế tay */
  | {
      kind: 'sight';
      title: string;
      position: Exclude<PositionId, 'free'>;
      hand: Hand;
      count: number;
      measures?: number;
      rhythm?: 1 | 2;
      timeSignature?: '4/4' | '3/4' | '2/4';
      /** names = có tên nốt (Cấp 2), staff = chỉ khuông (Cấp 3) */
      hints: 'names' | 'staff';
    }
  | { kind: 'stage'; level?: 1 | 2 | 3 }
  /**
   * v5 — KHỞI ĐỘNG KỸ THUẬT (~1 phút, OWNER duyệt 2026-10-05): thầy làm mẫu (hình/hoạt hình), bé làm theo, bố mẹ xác nhận.
   * arm-drop = thả rơi cánh tay "cầu vồng"; wrist-circle = xoay cổ tay; finger-tap = gõ ngón trên nắp đàn;
   * five-finger = 5 ngón lên-xuống (p rồi f); thumb-under = chuẩn bị luồn ngón cái; hand-shape = tay tròn "ôm bóng".
   */
  | { kind: 'technique'; title: string; drills: TechniqueDrill[] }
  /**
   * v5 — SÁNG TẠO: black-keys = ứng tấu tự do trên phím đen theo nền ngũ cung app đàn;
   * question-answer = app đàn "câu hỏi" 2 ô, bé đàn "câu trả lời" (kết về Đô) trong thế tay;
   * compose = bé sáng tác `bars` ô nhịp trong thế tay, app ghi lại thành bài trong Thư viện.
   */
  | {
      kind: 'improv';
      title: string;
      intro: string;
      mode: 'black-keys' | 'question-answer' | 'compose';
      position?: Exclude<PositionId, 'free'>;
      bars?: number;
    }
  /**
   * v4 — Trò chơi SẮC THÁI / KIỂU ĐÀN (OWNER duyệt 2026-10-05): thầy đàn mẫu, bé đàn lại.
   * loud-soft: mỗi lượt là một nốt/nhóm nốt cần đàn TO (f) hoặc NHỎ (p) — micro so với tiếng "vừa" của chính bé.
   * stac-leg: mỗi lượt đàn các nốt NGẮT (stac) hoặc LIỀN (leg) — micro đo tiếng tắt nhanh hay ngân liền.
   * Không có micro → bố mẹ xác nhận.
   */
  | {
      kind: 'dynamics';
      title: string;
      intro: string;
      mode: 'loud-soft' | 'stac-leg';
      rounds: Array<{ pitches: Pitch[]; want: 'p' | 'f' | 'stac' | 'leg'; fingers?: number[]; hand?: Hand }>;
    };

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
  /** v5.1 — Mục tiêu tuần bằng lời CHO BÉ (ngắn, vui) hiện ở màn chính; `criterion.text` (lời người lớn) cho bố mẹ */
  kidGoal?: string;
  /** Tuần dùng tay trái */
  leftHand?: boolean;
}

/** Cấp độ: 8 tuần mỗi cấp. */
export interface LevelInfo {
  level: 1 | 2 | 3;
  name: string;
  goal: string;
  weeks: [number, number];
}
