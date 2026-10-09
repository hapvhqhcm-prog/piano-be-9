/**
 * Chọn nội dung cho các bước PHỤ của buổi: khởi động bằng nhạc + nhắc tư thế, khởi động kỹ thuật, đọc nhạc 1 phút,
 * "Ôn bài cũ", tên / lời dẫn trò khởi động tai – đọc nốt. (Kế hoạch buổi: sessionPlan.ts.)
 */
import { findTune } from '../music/exercises';
import { SONGS, beatsPerMeasure, phraseRanges } from '../music/tune';
import type { QuizSpec } from '../practice/quiz';
import type { AppData } from '../progress/schema';
import { completedDates, firstDateOfWeek, sessionCount } from '../progress/history';
import type { Activity, Lesson, TechniqueDrill } from './types';
import { POSITIONS, type Hand, type PositionId } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';
import { DAY_MS, MAX_WEEK, weekPlan } from './curriculum';
import { lastWholePlay, songMastered, songStats } from './songStats';
import { freshDays } from './freshness';
import { mondayOf } from './calendar';
import type { SessionStep } from './sessionPlan';

/**
 * v5.2 (OWNER duyệt 2026-10-08) — KHỞI ĐỘNG BẰNG NHẠC 20–30 giây mở đầu MỌI buổi (bước 'posture'):
 * - 'song': câu đầu (≤ ~16 phách) của một bài bé ĐÃ THUỘC / nhiều sao (songStats), theo nhịp Mức 2 (nhạc đệm nếu bố mẹ bật);
 * - 'riff': chưa có bài nào thuộc → "thầy đàn — con đàn lại" 2 câu ngắn trong thế tay hiện tại.
 * KHÔNG ghi gì vào buổi (không lượt chơi, không PARENT/MIC_ASSESSMENT) → không ảnh hưởng tiến độ, tiêu chí, "đã thuộc".
 */
export type WarmupMusic =
  | { kind: 'song'; songId: string; phrase: [number, number]; bpm: 40 | 50 | 60; hints: 'full' | 'names' }
  | { kind: 'riff'; position: Exclude<PositionId, 'free'>; hand: Hand; riffs: Pitch[][] };

/** v5.2 — Câu nhắc tư thế MỘT dòng (đọc to + hiện chữ) trên màn khởi động bằng nhạc. */
export const POSTURE_CUE = 'Lưng thẳng · cổ tay ngang · ngón cong';

/** Xoay vòng mặc định cho tuần không ghi `drills` — tuần ≤ 3 chỉ bài thả lỏng/dáng tay; luồn ngón cái từ tuần 16. */
const DEFAULT_DRILLS = (week: number): TechniqueDrill[] =>
  week <= 3
    ? ['hand-shape', 'arm-drop', 'wrist-circle']
    : week < 16
      ? ['hand-shape', 'finger-tap', 'wrist-circle', 'five-finger', 'arm-drop']
      : ['hand-shape', 'finger-tap', 'thumb-under', 'wrist-circle', 'five-finger'];

/** v5.1 — Bài khởi động ~30 giây của buổi thứ `n` (đếm mọi buổi đã có): xoay vòng trong WeekPlan.drills (hoặc mặc định). */
export function sessionDrill(week: number, n: number): TechniqueDrill {
  const plan = weekPlan(week);
  const list = plan.drills?.length ? plan.drills : DEFAULT_DRILLS(plan.week);
  return list[((n % list.length) + list.length) % list.length];
}

/* ---------- v5.2 (OWNER duyệt 2026-10-08, sau rà soát chuyên gia): khởi động bằng nhạc · đọc nhạc 1 phút mỗi ngày ---------- */

/** Settings thêm (cộng dồn, không cần migration): 👪 bố mẹ bật "nhắc tư thế đầy đủ" mọi buổi. */
export interface PostureSettings {
  postureFull?: boolean;
}

/**
 * v5.2 — Thẻ tư thế ĐẦY ĐỦ (3 thẻ) chỉ khi: bài tuần 1 · buổi ĐẦU của tuần giáo trình (chưa có buổi nào của tuần đó)
 * · buổi ĐẦU của tuần lịch (chưa có buổi hoàn thành nào từ thứ 2) · bố mẹ bật "nhắc tư thế đầy đủ".
 * Các buổi khác: chỉ câu nhắc MỘT dòng (POSTURE_CUE) trên màn khởi động bằng nhạc.
 */
export function postureFull(lesson: Lesson, data: Readonly<AppData> | undefined, now: number = Date.now()): boolean {
  if (lesson.week === 1 || !data) return true;
  if ((data.settings as AppData['settings'] & PostureSettings).postureFull) return true;
  if (firstDateOfWeek(data, lesson.week) === null) return true;
  const monday = mondayOf(new Date(now));
  for (const d of completedDates(data)) if (d >= monday) return false;
  return true;
}

/** Xoay vòng khởi động trong ngần này bài bé thuộc nhất. */
const WARMUP_SONGS_ROTATION = 4;
/** Câu khởi động ≤ ngần này phách (~16 giây ở tốc độ 60, + đếm vào ≈ 20–25 giây). */
export const WARMUP_BEATS = 16;
/** Cặp "thầy đàn — con đàn lại" (vị trí trong thế tay, thấp → cao); xoay vòng theo buổi. Tuần ≤ 3: chỉ bậc liền. */
const RIFFS: ReadonlyArray<ReadonlyArray<readonly number[]>> = [
  [[0, 1, 2], [2, 1, 0]],
  [[0, 2, 4], [4, 2, 0]],
  [[2, 3, 4], [4, 3, 2, 1, 0]],
  [[0, 1, 2, 3, 4], [4, 2, 0]],
];

/**
 * v5.2 — Thế tay hiện tại của bài: bài hát đầu tiên (trong bài, rồi lùi dần các tuần trước) có thế tay cố định.
 * Không tìm thấy → thế Đô tay phải.
 */
export function lessonHandPosition(lesson: Lesson): { position: Exclude<PositionId, 'free'>; hand: Hand; timeSignature: string } {
  const from = (acts: readonly Activity[]) => {
    for (const a of acts) {
      if (a.kind !== 'song') continue;
      const t = findTune(a.songId);
      if (!t || t.id.startsWith('sight')) continue;
      const hand: Hand = a.hand ?? (t.hand === 'LH' ? 'LH' : 'RH');
      const pos = (hand === 'LH' && t.hand === 'BOTH' ? t.lhPosition : t.position) ?? 'C';
      if (pos === 'free' || !POSITIONS[pos]?.[hand]) continue;
      return { position: pos, hand, timeSignature: t.timeSignature };
    }
    return null;
  };
  const own = from(lesson.activities);
  if (own) return own;
  for (let w = Math.min(lesson.week, MAX_WEEK); w >= 1; w--) {
    for (const l of [...weekPlan(w).lessons].reverse()) {
      const r = from(l.activities);
      if (r) return r;
    }
  }
  return { position: 'C', hand: 'RH', timeSignature: '4/4' };
}

/**
 * v5.2 — Khởi động bằng nhạc của buổi: bài bé thuộc nhất (đã thuộc gần đây → nhiều sao → mới chơi), không trùng bài
 * hôm nay / bài "Ôn bài cũ" (`exclude`); xoay vòng trong 4 bài đầu theo số buổi. Chưa có bài nào → "thầy đàn — con đàn lại".
 * "Thuộc" = đã thuộc (theo nhịp ≥ 60), hoặc 3 sao và đã từng chơi trọn đạt.
 */
export function warmupMusic(
  lesson: Lesson,
  data: Readonly<AppData> | undefined,
  exclude: readonly string[] = [],
  /** Bài nên dùng (vd bài "Ôn bài cũ" bị bỏ vì quá số màn → ôn ngắt quãng vẫn diễn ra ở phần khởi động) */
  prefer?: string | null,
): WarmupMusic {
  const n = data ? sessionCount(data) : 0;
  if (data) {
    const stats = songStats(data);
    const skip = new Set([...exclude, ...lesson.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : []))]);
    const known = SONGS.filter((t) => {
      const a = stats[t.id];
      return !!a && !t.id.startsWith('sight') && !skip.has(t.id) && (a.m !== undefined || ((a.s ?? 0) >= 3 && a.h === 1));
    }).sort((x, y) => {
      const a = stats[x.id];
      const b = stats[y.id];
      return (
        (b.m !== undefined ? 1 : 0) - (a.m !== undefined ? 1 : 0) ||
        (b.m ?? 0) - (a.m ?? 0) ||
        (b.s ?? 0) - (a.s ?? 0) ||
        (b.r?.[0] ?? 0) - (a.r?.[0] ?? 0)
      );
    });
    const preferred = prefer && !skip.has(prefer) && stats[prefer] ? SONGS.find((t) => t.id === prefer) : undefined;
    if (preferred || known.length) {
      const top = known.slice(0, WARMUP_SONGS_ROTATION);
      const t = preferred ?? top[n % top.length];
      const mastered = stats[t.id].m !== undefined;
      const [a, b] = phraseRanges(t)[0];
      return {
        kind: 'song',
        songId: t.id,
        phrase: [a, Math.min(b, a + Math.max(1, Math.floor(WARMUP_BEATS / beatsPerMeasure(t))))],
        bpm: t.bpm <= 40 ? 40 : mastered ? 60 : 50,
        hints: lesson.week >= 8 ? 'names' : 'full',
      };
    }
  }
  const lp = lessonHandPosition(lesson);
  // Khởi động cho vui: ưu tiên tay phải nếu thế tay có tay phải
  const hand: Hand = POSITIONS[lp.position].RH ? 'RH' : 'LH';
  const keys = (Object.keys(POSITIONS[lp.position][hand]!) as Pitch[]).sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
  const set = lesson.week <= 3 ? RIFFS[0] : RIFFS[n % RIFFS.length];
  return { kind: 'riff', position: lp.position, hand, riffs: set.map((r) => r.map((i) => keys[Math.min(i, keys.length - 1)])) };
}

/** Gợi ý khi đọc nhạc mỗi ngày — RÚT DẦN: tuần 8–11 có tên nốt · 12–21 xen kẽ tên nốt / chỉ khuông · từ 22 chỉ khuông. */
export function sightDailyHints(week: number, n: number): 'names' | 'staff' {
  if (week < 12) return 'names';
  if (week >= 22) return 'staff';
  return n % 2 ? 'staff' : 'names';
}

/** v5.2 — Bước "Đọc nhạc 1 phút" (đoạn MỚI trong thế tay hiện tại; session.ts sinh nốt bằng makeSightTune). */
export function sightDailyStep(lesson: Lesson, data?: Readonly<AppData>): Extract<SessionStep, { kind: 'sight-daily' }> {
  const lp = lessonHandPosition(lesson);
  const ts = lp.timeSignature === '3/4' || lp.timeSignature === '2/4' ? lp.timeSignature : '4/4';
  const per = Number(ts[0]);
  return {
    kind: 'sight-daily',
    position: lp.position,
    hand: lp.hand,
    measures: per === 2 ? 4 : per === 3 ? 3 : 2,
    timeSignature: ts,
    rhythm: lesson.week >= 17 ? 2 : 1,
    hints: sightDailyHints(lesson.week, data ? sessionCount(data) : 0),
    // Cấp 1 (tuần 8–10): bắt đầu ở nốt chủ cho dễ; từ Cấp 2 bắt đầu ở nốt bất kỳ (đọc QUÃNG)
    startAnywhere: lesson.week >= 11,
  };
}

/**
 * Chọn bài cho bước "Ôn bài cũ": bài của tuần (lesson.week − 4 … lesson.week − 2), không có trong bài hôm nay.
 * Ưu tiên: đã thuộc nhưng không còn "tươi" (> FRESH_DAYS ngày) → lượt cả bài gần nhất KHÔNG đạt → lâu chưa chơi nhất.
 * Hoà điểm → rng. Tốc độ: 60 nếu bài đã thuộc, còn lại 50; v5.1: bài có móc kép (tốc độ mặc định 40) → 40.
 */
export function reviewSongStep(
  lesson: Lesson,
  data: Readonly<AppData>,
  now: number = Date.now(),
  rng: () => number = Math.random,
): Extract<SessionStep, { kind: 'review-song' }> | null {
  const inLesson = new Set(lesson.activities.flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
  // (rà soát 2026-10-09) CHỈ bài bé ĐÃ chơi — trước đây bài Thư viện chưa từng chơi được điểm "lâu chưa chơi" cao nhất
  // → bước "Ôn bài cũ" hay thành bài MỚI tinh
  const played = songStats(data);
  const cands = SONGS.filter((t) => {
    const w = t.week ?? 1;
    return w >= lesson.week - 4 && w <= lesson.week - 2 && !inLesson.has(t.id) && !t.id.startsWith('sight') && !!played[t.id]?.r;
  });
  if (!cands.length) return null;
  const scored = cands.map((t) => {
    const mastered = songMastered(data, t.id);
    const last = lastWholePlay(data, t.id);
    // Lượt gần nhất (mọi kiểu) — từ tổng hợp (lịch sử đã gộp + buổi còn giữ)
    const lastRun = songStats(data)[t.id]?.r;
    const lastAny = lastRun?.[0] ?? 0;
    const days = lastAny ? Math.min(60, (now - lastAny) / DAY_MS) : 60;
    let score = days / 30; // 0…2: càng lâu chưa chơi càng cao
    if (mastered && last < now - freshDays(data) * DAY_MS) score += 3;
    if (lastRun && !lastRun[1]) score += 2;
    return { t, mastered, score: score + rng() * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const [a, b] = phraseRanges(best.t)[0];
  return {
    kind: 'review-song',
    songId: best.t.id,
    phrase: [a, b],
    bpm: best.t.bpm <= 40 ? 40 : best.mastered ? 60 : 50,
    level: 2,
    hints: lesson.week >= 8 ? 'names' : 'full',
    intro: '🔁 Ôn bài cũ — đàn lại câu đầu cho nhớ lâu nhé!',
  };
}

export function warmupTitle(q: QuizSpec): string {
  return {
    updown: 'Lên hay xuống? ⬆️⬇️',
    stepskip: 'Bước hay nhảy? 🐸',
    identify: 'Nốt nào đây? 👂',
    read: q.clef === 'bass' ? 'Đọc nốt khóa Fa 📖' : 'Đọc nốt 📖',
    majorminor: 'Vui hay buồn? 😊😢',
    interval: 'Bước hay nhảy trên khuông? 👣🐸',
    landmark: 'Nốt mốc 🏠',
  }[q.variant];
}

export function warmupIntro(q: QuizSpec): string {
  return {
    updown: 'App đàn 2 nốt. Nốt sau CAO hơn (lên) hay THẤP hơn (xuống)?',
    stepskip: 'Hai nốt cạnh nhau là BƯỚC. Cách một phím là NHẢY.',
    identify: 'Đầu tiên app đàn nốt Đô làm mốc, rồi đàn một nốt bí ẩn. Con chạm đúng phím nhé!',
    read: 'Nốt hiện trên khuông — con chạm đúng phím trên iPad.',
    majorminor: 'App rải một hợp âm. Nghe VUI (trưởng) hay BUỒN (thứ)?',
    interval: 'Khuông hiện 2 nốt. Nốt sau GIỐNG, BƯỚC hay NHẢY so với nốt trước — đi lên hay đi xuống?',
    landmark: 'Nhìn nốt trên khuông — đó là nốt mốc nào? Chọn tên hoặc chạm phím.',
  }[q.variant];
}
