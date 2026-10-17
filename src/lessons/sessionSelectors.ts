/**
 * Chọn nội dung cho các bước PHỤ của buổi: khởi động bằng nhạc + nhắc tư thế, khởi động kỹ thuật, đọc nhạc 1 phút,
 * "Ôn bài cũ", tên / lời dẫn trò khởi động tai – đọc nốt. (Kế hoạch buổi: sessionPlan.ts.)
 */
import { findTune } from '../music/exercises';
import { SONGS, beatsPerMeasure, phraseRanges } from '../music/tune';
import type { QuizSpec, QuizVariant } from '../practice/quiz';
import { localDateStr, type AppData } from '../progress/schema';
import { completedDates, firstDateOfWeek, sessionCount } from '../progress/history';
import type { Activity, Lesson, TechniqueDrill } from './types';
import { POSITIONS, type Hand, type PositionId } from '../piano/fingering';
import { pitchToMidi, type Pitch } from '../piano/pitchTable';
import { DAY_MS, MAX_WEEK, findLesson, weekPlan } from './curriculum';
import { FAMILIAR_MIN_BPM, TEMPO_LADDER, lastWholePlay, songEverPlayed, songMastered, songStats } from './songStats';
import { SIGHT_DAILY_WEEK } from './sessionEstimate';
import { difficulty } from './adaptive';
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
  | { kind: 'song'; songId: string; phrase: [number, number]; bpm: number; hints: 'full' | 'names' }
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
 * v5.2 — Thẻ tư thế ĐẦY ĐỦ (các thẻ tư thế) chỉ khi: bài tuần 1 · buổi ĐẦU của tuần giáo trình (chưa có buổi nào của tuần đó)
 * · buổi ĐẦU của tuần lịch (chưa có buổi hoàn thành nào từ thứ 2) · bố mẹ bật "nhắc tư thế đầy đủ".
 * (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") TỐI ĐA MỘT LẦN mỗi tuần lịch và KHÔNG BAO GIỜ hai buổi liền
 * (settings.postureFullAt — sessionFlow ghi khi hiện thẻ): đã hiện từ thứ 2 tuần này, hoặc buổi gần nhất chính là buổi đã hiện
 * → không. (Bố mẹ bật "nhắc tư thế đầy đủ" → mọi buổi, như cũ.)
 * Các buổi khác: chỉ câu nhắc MỘT dòng (POSTURE_CUE) trên màn khởi động bằng nhạc / bài tập về nhà.
 */
export function postureFull(lesson: Lesson, data: Readonly<AppData> | undefined, now: number = Date.now()): boolean {
  if (!data) return true;
  if ((data.settings as AppData['settings'] & PostureSettings).postureFull) return true;
  const monday = mondayOf(new Date(now));
  const at = readPostureFullAt(data.settings);
  if (at !== null) {
    // đã hiện trong tuần lịch này → không (một lần mỗi tuần)
    if (localDateStr(new Date(at)) >= monday) return false;
    // buổi gần nhất (có nội dung) bắt đầu SAU lần hiện → buổi đó không hiện; ngược lại buổi đó chính là buổi đã hiện → không
    const last = lastStartedAt(data);
    if (last === null || last <= at) return false;
  }
  if (lesson.week === 1) return true;
  if (firstDateOfWeek(data, lesson.week) === null) return true;
  for (const d of completedDates(data)) if (d >= monday) return false;
  return true;
}

/** Đọc MỀM settings.postureFullAt (ms). */
export function readPostureFullAt(settings: Readonly<AppData['settings']> | undefined): number | null {
  const v = (settings as { postureFullAt?: unknown } | undefined)?.postureFullAt;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Lúc bắt đầu của buổi CÓ NỘI DUNG gần nhất còn giữ (buổi đã gộp vào lịch sử thì đã cũ hơn mọi mốc postureFullAt). */
function lastStartedAt(data: Readonly<AppData>): number | null {
  let m: number | null = null;
  for (const s of data.sessions) {
    const has = s.completed || s.songRuns.length > 0 || s.parentAssessments.length > 0 || s.appAssessments.length > 0 || s.micAssessments.length > 0;
    if (has && (m === null || s.startedAt > m)) m = s.startedAt;
  }
  return m;
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
    /** "Thuộc" = đã thuộc, hoặc 3 sao và đã từng chơi trọn đạt — khởi động phải là một lần THẮNG dễ */
    const isKnown = (id: string) => {
      const a = stats[id];
      return !!a && !id.startsWith('sight') && !skip.has(id) && (a.m !== undefined || ((a.s ?? 0) >= 3 && a.h === 1));
    };
    const known = SONGS.filter((t) => isKnown(t.id)).sort((x, y) => {
      const a = stats[x.id];
      const b = stats[y.id];
      return (
        (b.m !== undefined ? 1 : 0) - (a.m !== undefined ? 1 : 0) ||
        (b.m ?? 0) - (a.m ?? 0) ||
        (b.s ?? 0) - (a.s ?? 0) ||
        (b.r?.[0] ?? 0) - (a.r?.[0] ?? 0)
      );
    });
    // (+ 2026-10-15, sửa lỗi) bài "nên dùng" (bài Ôn bài cũ bị bỏ vì quá số màn) cũng phải qua bộ lọc "thuộc" — trước đây
    // bài CHƯA đạt được mời khởi động với lời dẫn "bài con đã thuộc" (khởi động thành thất bại đầu buổi)
    // (+ 2026-10-17, OWNER duyệt "bài vui hơn") KHÔNG lặp bài khởi động của buổi liền trước (settings.warmupSongs) khi còn bài khác
    const lastWarm = data ? readWarmupSongs(data.settings)[0] : undefined;
    const preferred = prefer && prefer !== lastWarm && isKnown(prefer) ? SONGS.find((t) => t.id === prefer) : undefined;
    if (preferred || known.length) {
      const top = known.slice(0, WARMUP_SONGS_ROTATION);
      const fresh = top.length > 1 ? top.filter((x) => x.id !== lastWarm) : top;
      const t = preferred ?? fresh[n % fresh.length];
      const mastered = stats[t.id].m !== undefined;
      const [a, b] = phraseRanges(t)[0];
      return {
        kind: 'song',
        songId: t.id,
        phrase: [a, Math.min(b, a + Math.max(1, Math.floor(WARMUP_BEATS / beatsPerMeasure(t))))],
        // (+ 2026-10-17) bài khởi động luôn là bài QUEN → không dưới FAMILIAR_MIN_BPM (trước: 50 khi chưa thuộc)
        bpm: t.bpm <= 40 ? 40 : mastered ? 60 : FAMILIAR_MIN_BPM,
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
 * Chọn bài cho bước "Ôn bài cũ": bài của tuần (lesson.week − 4 … lesson.week − 2) bé đã chơi — (+ 2026-10-17) và MỌI bài
 * bé đã ĐẠT của các tuần ≤ lesson.week − 2 (xoay vòng: bài đã đạt lâu chưa chơi nhất trước) — không có trong bài hôm nay.
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
  // (+ 2026-10-17, rà soát giáo viên "ôn ngắt quãng") XOAY VÒNG mọi bài bé ĐÃ ĐẠT (lượt cả bài đạt — songStats `h`) của các tuần
  // ≤ tuần − 2, không chỉ bài đã thuộc / 3 tuần gần nhất; bài đã chơi mà chưa đạt vẫn lấy trong cửa sổ tuần − 4 … tuần − 2 như cũ.
  const cands = SONGS.filter((t) => {
    const w = t.week ?? 1;
    if (w > lesson.week - 2 || inLesson.has(t.id) || t.id.startsWith('sight') || !played[t.id]?.r) return false;
    return w >= lesson.week - 4 || played[t.id]?.h === 1;
  });
  if (!cands.length) return null;
  const lastExtras = lastSessionExtraSongs(data);
  const scored = cands.map((t) => {
    const mastered = songMastered(data, t.id);
    const passed = mastered || played[t.id]?.h === 1;
    const last = lastWholePlay(data, t.id);
    // Lượt gần nhất (mọi kiểu) — từ tổng hợp (lịch sử đã gộp + buổi còn giữ)
    const lastRun = songStats(data)[t.id]?.r;
    const lastAny = lastRun?.[0] ?? 0;
    const days = lastAny ? Math.min(60, (now - lastAny) / DAY_MS) : 60;
    let score = days / 30; // 0…2: càng lâu chưa chơi càng cao
    // bài ĐÃ ĐẠT (thuộc hay chưa) không còn "tươi" → đến lượt ôn; trong nhóm này bài lâu chưa chơi nhất trước (xoay vòng)
    if (passed && last < now - freshDays(data) * DAY_MS) score += 3;
    if (lastRun && !lastRun[1]) score += 2;
    // (+ 2026-10-17, OWNER duyệt "bài vui hơn") bài vừa ôn ở buổi LIỀN trước → nhường bài khác (còn bài khác)
    if (cands.length > 1 && lastExtras.has(t.id)) score -= 10;
    return { t, mastered, passed, score: score + rng() * 0.01 };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const [a, b] = phraseRanges(best.t)[0];
  return {
    kind: 'review-song',
    songId: best.t.id,
    phrase: [a, b],
    // (+ 2026-10-17) bài đã đạt (quen) không dưới FAMILIAR_MIN_BPM; chưa đạt giữ 50
    bpm: best.t.bpm <= 40 ? 40 : best.mastered ? 60 : best.passed ? FAMILIAR_MIN_BPM : 50,
    level: 2,
    hints: lesson.week >= 8 ? 'names' : 'full',
    intro: '🔁 Ôn bài cũ: đàn lại câu đầu!',
  };
}

/**
 * (+ 2026-10-17) Các bài "ôn" của buổi GẦN NHẤT có lượt chơi: lượt MỘT CÂU theo nhịp của bài không thuộc hoạt động của bài học
 * buổi đó (bước "Ôn bài cũ", bài tập về nhà): reviewSongStep nhường các bài này để hai buổi liền nhau không ôn cùng một bài.
 */
export function lastSessionExtraSongs(data: Readonly<AppData>): Set<string> {
  let last: AppData['sessions'][number] | undefined;
  for (const s of data.sessions) if (s.songRuns.length && (!last || s.startedAt > last.startedAt)) last = s;
  if (!last) return new Set();
  const own = new Set((findLesson(last.lessonId)?.activities ?? []).flatMap((a) => (a.kind === 'song' ? [a.songId] : [])));
  return new Set(last.songRuns.filter((r) => r.mode === 'tempo' && !!r.phrase && !own.has(r.songId) && !r.songId.startsWith('sight')).map((r) => r.songId));
}

/** (+ 2026-10-17) Nhớ ngần này bài khởi động gần nhất (settings.warmupSongs, mới → cũ). */
export const WARMUP_SONGS_MAX = 3;
/** Đọc MỀM settings.warmupSongs (mục lạ bị bỏ). */
export function readWarmupSongs(settings: Readonly<AppData['settings']> | undefined): string[] {
  const v = (settings as { warmupSongs?: unknown } | undefined)?.warmupSongs;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, WARMUP_SONGS_MAX) : [];
}
/** Thêm bài khởi động vừa mở lên đầu danh sách (không trùng, ≤ WARMUP_SONGS_MAX). */
export function pushWarmupSong(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, WARMUP_SONGS_MAX);
}

/* ---------- (+ 2026-10-16, OWNER duyệt "Đổi món cho đỡ chán") XOAY VÒNG TRÒ KHỞI ĐỘNG ---------- */

/** Xét các trò khởi động của ngần này tuần gần nhất (tính cả tuần hiện tại) — trò bé ĐÃ được dạy, còn "nóng". */
export const WARMUP_ROTATION_WEEKS = 6;
/** Nhớ ngần này trò khởi động gần nhất (settings.warmupRecent, mới → cũ). */
export const WARMUP_RECENT_MAX = 6;

const QUIZ_VARIANTS: readonly QuizVariant[] = ['updown', 'stepskip', 'identify', 'read', 'majorminor', 'interval', 'landmark', 'theory'];

/** Đọc MỀM settings.warmupRecent (mục lạ bị bỏ). */
export function readWarmupRecent(settings: Readonly<AppData['settings']> | undefined): QuizVariant[] {
  const v = (settings as { warmupRecent?: unknown } | undefined)?.warmupRecent;
  return Array.isArray(v) ? v.filter((x): x is QuizVariant => QUIZ_VARIANTS.includes(x as QuizVariant)).slice(0, WARMUP_RECENT_MAX) : [];
}

/** Thêm trò vừa chơi lên đầu danh sách gần nhất (không trùng, ≤ WARMUP_RECENT_MAX). */
export function pushWarmupRecent(recent: readonly QuizVariant[], v: QuizVariant): QuizVariant[] {
  return [v, ...recent.filter((x) => x !== v)].slice(0, WARMUP_RECENT_MAX);
}

/**
 * Các trò khởi động CÙNG MỤC TIÊU (tai nghe / đọc nốt) bé đã học tới tuần `week`: trò của tuần (`base`) trước, rồi trò khởi
 * động của các tuần trước (mới → cũ, trong WARMUP_ROTATION_WEEKS tuần), mỗi KIỂU một lần (lấy nội dung của tuần gần nhất).
 * Số lượt = số lượt của `base` (buildSessionPlan vẫn cắt ≤ MAX_QUIZ_ROUNDS).
 */
export function warmupCandidates(week: number, base: QuizSpec): QuizSpec[] {
  const out: QuizSpec[] = [base];
  for (let w = Math.min(week, MAX_WEEK); w >= Math.max(1, week - WARMUP_ROTATION_WEEKS + 1); w--) {
    const q = weekPlan(w).warmup;
    if (q && !out.some((x) => x.variant === q.variant)) out.push({ ...q, rounds: base.rounds });
  }
  return out;
}

/**
 * Chọn trò khởi động hôm nay: KHÔNG lặp trò của buổi trước (recent[0]); ưu tiên trò chưa chơi gần đây, rồi trò chơi lâu
 * nhất; hòa → theo thứ tự `cands` (trò của tuần trước tiên). Chỉ một trò → giữ trò đó. Hàm thuần — không ngẫu nhiên.
 */
export function rotateWarmup(cands: readonly QuizSpec[], recent: readonly QuizVariant[]): QuizSpec | null {
  if (cands.length <= 1) return cands[0] ?? null;
  const pool = cands.filter((c) => c.variant !== recent[0]);
  if (!pool.length) return cands[0];
  const age = (c: QuizSpec) => {
    const i = recent.indexOf(c.variant);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return pool.reduce((best, c) => (age(c) > age(best) ? c : best), pool[0]);
}

/* ---------- (+ 2026-10-16, OWNER duyệt "Tự cân độ khó theo bé") THỬ THÁCH NHỎ khi bé làm rất tốt ---------- */

/** Bài Thư viện "cao hơn một bậc": bài của tuần sau tuần hiện tại, xa nhất ngần này tuần. */
export const STRETCH_LIBRARY_AHEAD = 2;

/**
 * Thử thách nhỏ TÙY CHỌN (nút ở màn kết buổi — bé bỏ qua được; không phải bước của buổi, không đổi tiến độ / tiêu chí):
 * - 'faster': "🐇 Thử nhanh hơn?" — bài theo nhịp của bài học hôm nay, tốc độ trên tốc độ đạt cao nhất một nấc (≤ 72);
 * - 'sight': một dòng đọc nhạc mới (từ tuần SIGHT_DAILY_WEEK);
 * - 'library': một bài Thư viện cao hơn một bậc (tuần sau, chưa chơi — từng nốt).
 * Chỉ khi chế độ độ khó là 'stretch' (lessons/adaptive.ts). null = không có.
 */
export type StretchOffer =
  | { kind: 'faster'; songId: string; bpm: number; label: string }
  | { kind: 'sight'; step: Extract<SessionStep, { kind: 'sight-daily' }>; label: string }
  | { kind: 'library'; songId: string; label: string };

export function stretchOffer(lesson: Lesson, data: Readonly<AppData>, now: number = Date.now()): StretchOffer | null {
  if (difficulty(data, now).mode !== 'stretch' || lesson.isWeekTest || lesson.activities.some((a) => a.kind === 'stage')) return null;
  const stats = songStats(data);
  for (const a of lesson.activities) {
    if (a.kind !== 'song' || a.mode !== 'tempo' || a.phrase || a.hand || a.songId.startsWith('sight')) continue;
    const t = findTune(a.songId);
    const best = stats[a.songId]?.b;
    if (!t || best === undefined) continue;
    const next = TEMPO_LADDER.find((x) => x > best);
    if (next !== undefined) return { kind: 'faster', songId: t.id, bpm: next, label: `Thử nhanh hơn? “${t.titleVi || t.title}” tốc độ ${next}` };
  }
  if (lesson.week >= SIGHT_DAILY_WEEK) return { kind: 'sight', step: { ...sightDailyStep(lesson, data), hints: 'names' }, label: 'Thử đọc một dòng nhạc mới?' };
  const week = data.progress.currentWeek;
  const up = SONGS.filter((t) => {
    const w = t.week ?? 1;
    return w > week && w <= week + STRETCH_LIBRARY_AHEAD && !t.id.startsWith('sight') && t.hand !== 'BOTH' && !songEverPlayed(data, t.id);
  }).sort((a, b) => (a.week ?? 1) - (b.week ?? 1))[0];
  return up ? { kind: 'library', songId: up.id, label: `Thử bài khó hơn một chút: “${up.titleVi || up.title}”` } : null;
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
    theory: 'Đố vui nhạc lý 📘',
  }[q.variant];
}

/** (+ 2026-10-17, OWNER duyệt "Buổi học ≥ 60% đàn thật") lời dẫn NGẮN (≤ 12 tiếng — giọng đọc đọc to). */
export function warmupIntro(q: QuizSpec): string {
  return {
    updown: 'Nốt sau cao hơn hay thấp hơn?',
    stepskip: 'Phím cạnh nhau là BƯỚC, cách một phím là NHẢY.',
    identify: 'Nghe Đô mốc, rồi chạm nốt bí ẩn!',
    read: 'Nhìn nốt trên khuông, chạm đúng phím.',
    majorminor: 'Hợp âm nghe VUI hay BUỒN?',
    interval: 'Nốt sau giống, bước hay nhảy?',
    landmark: 'Nốt mốc nào đây? Chọn tên hoặc chạm phím.',
    theory: 'Nhớ lại điều con đã biết nhé!',
  }[q.variant];
}
