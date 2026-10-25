/**
 * (+ 2026-10-25, OWNER duyệt — bé: "Dạy piano quá dễ") ⚡ THI VƯỢT TUẦN: bé tự bấm (màn chính → 📋 Xem các bài), KHÔNG cần bố mẹ
 * (OWNER 2026-10-25: "bỏ phần phụ huynh ra"). MỘT buổi thi tập trung = nội dung TIÊU CHÍ của tuần hiện tại (bài + theo nhịp +
 * tốc độ tối thiểu; trò tai nghe / đọc nốt ≥ 5/6; đọc nhạc; thẻ xem tay Cấp 4…) + một câu đố ngắn về điều MỚI của tuần.
 * BỎ luật "2 ngày khác nhau" và "học hết bài". Tuần biểu diễn (huy chương) / tuần ôn: thi = biểu diễn các bài.
 * - Micro chấm khi bật; chỗ micro không chấm được (micro tắt, thẻ xem tay, sân khấu) → bé TỰ XÁC NHẬN thật thà một câu.
 *   Tự xác nhận chỉ dùng để CHẤM buổi thi (không ghi thành lượt chơi giả vào dữ liệu — trừ huy chương sân khấu thật).
 * - ĐẠT → progress.skips[tuần] = 'testedOut' (weekPassed / weekComplete / criterionProgress coi là đã qua; gộp lịch sử giữ),
 *   sang tuần sau + mừng cập bến. Đảo / sticker như thường; huy chương cấp cần sân khấu thật (stickers.medalEarned).
 * - CHƯA ĐẠT → lời nhắn nhẹ nhàng + những gì cần tập; chờ 1 ngày mới thi lại tuần đó (progress.skipTries).
 * Module THUẦN (có test: tests/testOut-2026-10-25.test.ts). Màn: ui/screens/testOut.ts (nạp trễ).
 */
import type { QuizSpec } from '../practice/quiz';
import { findTune } from '../music/exercises';
import { SONGS, beatsPerMeasure, measureCount } from '../music/tune';
import type { AppData, ParentAssessment, Session, SongRun } from '../progress/schema';
import type { Hand, PositionId } from '../piano/fingering';
import type { Activity, Lesson, Segment } from './types';
import { LEVELS, MAX_QUIZ_ROUNDS, MAX_WEEK, levelOf, weekPlan } from './curriculum';
import { W8_SONG, criterionMetIn, weekComplete } from './weekCriteria';
import { passedWhole, type Run } from './songStats';
import { addSkips } from './weekSkips';
import { warmupIntro, warmupTitle } from './sessionSelectors';

/* ---------- Bước của buổi thi ---------- */

interface StepBase {
  /** Mã bước (duy nhất trong buổi thi) */
  key: string;
  /** Tên ngắn cho bé ("Bánh nóng theo nhịp ♩60") */
  label: string;
}
export type TestStep =
  | (StepBase & {
      kind: 'song';
      songId: string;
      mode: 'wait' | 'tempo';
      hints: 'full' | 'names' | 'staff';
      /** Tốc độ mở sẵn (tiêu chí có tốc độ tối thiểu) */
      bpm?: number;
      /** Yêu cầu của tiêu chí cho lượt này */
      need: { tempo: boolean; minBpm: number; staff: boolean; level2: boolean };
    })
  | (StepBase & { kind: 'quiz'; title: string; intro: string; quiz: QuizSpec; /** câu đố "điều mới của tuần" (không phải tiêu chí) */ concept: boolean })
  | (StepBase & {
      kind: 'sight';
      position: Exclude<PositionId, 'free'>;
      hand: Hand;
      count: number;
      hints: 'names' | 'staff';
      rhythm?: 1 | 2;
      timeSignature?: '4/4' | '3/4' | '2/4';
    })
  | (StepBase & { kind: 'notes'; segment: Segment })
  | (StepBase & { kind: 'stage'; level: 1 | 2 | 3 | 4 });

export interface TestOutPlan {
  week: number;
  steps: TestStep[];
  /** Tuần biểu diễn (huy chương) / tuần ôn: thi = biểu diễn các bài */
  perform: boolean;
}

/** Mã buổi thi vượt tuần (buổi bài học của tuần — lượt chơi thật vẫn là bằng chứng của tuần). */
export const testOutLessonId = (week: number): string => `w${week}-testout`;

/** Tuần biểu diễn cuối mỗi cấp (huy chương). */
const MEDAL_WEEKS = new Set(LEVELS.map((l) => l.weeks[1]));

type Item =
  | { song: string; tempo?: boolean; minBpm?: number; staff?: boolean }
  | { ear: true }
  | { sight: Exclude<PositionId, 'free'>; count?: number }
  | { keep8: true };

/**
 * Nội dung tiêu chí theo tuần — KHỚP weekCriteria.criterionDays (tests kiểm: buổi thi "làm đúng hết" đạt criterionMetIn, buổi
 * rỗng không đạt — cho MỌI tuần). Tuần Cấp 4 / tuần ôn đọc WeekPlan.criterionSpec.
 */
const CRIT: Record<number, Item[]> = {
  2: [{ song: 'hot_cross_buns' }],
  3: [{ ear: true }],
  4: [{ keep8: true }],
  5: [{ song: 'frog_hop', tempo: true }],
  6: [{ song: 'ode_to_joy_easy', tempo: true, minBpm: 60 }],
  7: [{ ear: true }],
  8: [{ song: W8_SONG, tempo: true, staff: true }],
  9: [{ song: 'inh_la_oi', tempo: true }],
  11: [{ song: 'question_answer' }],
  12: [{ song: 'hot_cross_buns_both', tempo: true }],
  13: [{ song: 'bell_tower', tempo: true }],
  14: [{ song: 'ode_to_joy_g', tempo: true, minBpm: 60 }],
  15: [{ song: 'waltz_cat', tempo: true }],
  16: [{ song: 'ode_to_joy_d', tempo: true, minBpm: 60 }],
  17: [{ song: 'camel_walk', tempo: true, minBpm: 60 }],
  18: [{ song: 'ly_cay_da', tempo: true }],
  19: [{ song: 'bac_kim_thang', tempo: true }],
  20: [
    { song: 'scale_c_rh', tempo: true },
    { song: 'scale_c_lh', tempo: true },
  ],
  22: [{ song: 'twinkle_both', tempo: true }],
  23: [{ ear: true }, { sight: 'Am' }],
  24: [{ song: 'silent_night', tempo: true, minBpm: 50 }],
  25: [{ ear: true }],
  26: [{ ear: true }, { sight: 'C5' }],
  28: [{ sight: 'C', count: 5 }],
  29: [{ song: 'saints_both', tempo: true }],
  30: [{ song: 'minuet_g', tempo: true, minBpm: 50 }],
  31: [{ song: 'fur_elise', tempo: true, minBpm: 50 }],
};

const tuneName = (id: string): string => {
  const t = findTune(id);
  return t ? t.titleVi || t.title : id;
};

/** Gợi ý hiển thị của bài `songId` trong các bài của tuần (ưu tiên lượt theo nhịp); không có → 'names'. */
function lessonHints(week: number, songId: string): 'full' | 'names' | 'staff' {
  const acts = weekPlan(week).lessons.flatMap((l) => l.activities);
  const songs = acts.filter((a): a is Extract<Activity, { kind: 'song' }> => a.kind === 'song' && a.songId === songId && !a.hand && !a.phrase);
  return (songs.find((a) => a.mode === 'tempo') ?? songs[0])?.hints ?? 'names';
}

/** Tuần 4: một bài THEO NHỊP (Mức 2) đủ dài (≥ 8 ô; ô 2/4 → 16) trong các bài của tuần. */
function keepBeatSong(week: number): string | null {
  const long = (id: string) => {
    const t = findTune(id);
    return !!t && measureCount(t) >= (beatsPerMeasure(t) < 3 ? 16 : 8);
  };
  const acts = weekPlan(week).lessons.flatMap((l) => l.activities);
  const a = acts.find((x) => x.kind === 'song' && x.mode === 'tempo' && !x.hand && !x.phrase && !x.songId.startsWith('sight') && long(x.songId));
  if (a && a.kind === 'song') return a.songId;
  return SONGS.find((t) => (t.week ?? 1) <= week && t.hand === 'RH' && long(t.id))?.id ?? null;
}

function songStep(week: number, k: number, songId: string, tempo: boolean, minBpm = 0, staff = false, level2 = false): TestStep {
  const hints = staff ? 'staff' : lessonHints(week, songId);
  const name = tuneName(songId);
  return {
    kind: 'song',
    key: `song${k}:${songId}`,
    label: tempo ? `${name} — theo nhịp${minBpm ? ` ♩${minBpm}` : ''}` : name,
    songId,
    mode: tempo ? 'tempo' : 'wait',
    hints,
    ...(minBpm ? { bpm: minBpm } : {}),
    need: { tempo, minBpm, staff, level2 },
  };
}

/** Trò tai nghe / đọc nốt chấm tiêu chí của tuần (WeekPlan.warmup) — đủ MAX_QUIZ_ROUNDS lượt. */
function earStep(week: number): TestStep | null {
  const q = weekPlan(week).warmup;
  if (!q) return null;
  const quiz = { ...q, rounds: Math.max(MAX_QUIZ_ROUNDS, q.rounds) };
  return { kind: 'quiz', key: 'ear', label: 'Trò nghe / đọc nốt (đúng 5/6)', title: 'Thi: đúng 5 trên 6 câu nhé!', intro: 'Bình tĩnh nghe / nhìn rồi chọn.', quiz, concept: false };
}

/** Câu đố ngắn về điều MỚI của tuần: trò đố đầu tiên trong các bài của tuần, không có thì trò khởi động của tuần (3 câu). */
function conceptStep(week: number): TestStep | null {
  const plan = weekPlan(week);
  const acts = plan.lessons.flatMap((l) => l.activities);
  const q = acts.find((a): a is Extract<Activity, { kind: 'quiz' }> => a.kind === 'quiz');
  const spec = q?.quiz ?? plan.warmup;
  if (!spec) return null;
  const title = q?.title ?? warmupTitle(spec);
  const intro = q?.intro ?? warmupIntro(spec);
  return { kind: 'quiz', key: 'concept', label: `Câu đố: ${title}`, title, intro, quiz: { ...spec, rounds: Math.min(3, spec.rounds) }, concept: true };
}

/** Thẻ xem tay / xác nhận (Cấp 4 parentChecks): hoạt động "notes" của tuần có các thẻ đó. */
function checksStep(week: number, notes: readonly string[]): TestStep | null {
  if (!notes.length) return null;
  const segs = weekPlan(week).lessons.flatMap((l) => l.activities).flatMap((a) => (a.kind === 'notes' ? [a.segment] : []));
  const want = new Set(notes);
  const hits = segs.flatMap((s) => s.targets.filter((t) => want.has(t.noteId)));
  const uniq = [...new Map(hits.map((t) => [t.noteId, t])).values()];
  if (!uniq.length) return null;
  return {
    kind: 'notes',
    key: 'checks',
    label: 'Tay mềm, đúng dáng',
    segment: { id: `w${week}-testout-checks`, step: 'Thi vượt tuần', title: 'Kiểm tra dáng tay', intro: 'Con đàn và tự xem tay mình nhé.', targets: uniq },
  };
}

/** Kế hoạch buổi thi vượt tuần `week`. */
export function testOutPlan(week: number): TestOutPlan {
  const plan = weekPlan(week);
  const steps: TestStep[] = [];
  if (MEDAL_WEEKS.has(week)) {
    steps.push({ kind: 'stage', key: 'stage', label: 'Biểu diễn 2–3 bài trên sân khấu', level: levelOf(week).level });
    return { week, steps, perform: true };
  }
  if (week === 1) {
    const test = plan.lessons.find((l) => l.isWeekTest);
    const seg = test?.activities.find((a): a is Extract<Activity, { kind: 'notes' }> => a.kind === 'notes')?.segment;
    if (seg) steps.push({ kind: 'notes', key: 'c4', label: 'Tìm Đô giữa 10 lần', segment: seg });
    return { week, steps, perform: false };
  }
  let ear = false;
  const items = CRIT[week];
  if (items) {
    items.forEach((it, k) => {
      if ('song' in it) steps.push(songStep(week, k, it.song, !!it.tempo, it.minBpm ?? 0, !!it.staff));
      else if ('keep8' in it) {
        const id = keepBeatSong(week);
        if (id) steps.push(songStep(week, k, id, true, 0, false, true));
      } else if ('ear' in it) {
        const s = earStep(week);
        if (s) (steps.push(s), (ear = true));
      } else {
        const n = it.count ?? 1;
        steps.push({
          kind: 'sight',
          key: `sight${k}`,
          label: n > 1 ? `Đọc nhạc ${n} đoạn mới` : 'Đọc nhạc một đoạn mới',
          position: it.sight,
          hand: 'RH',
          count: n,
          hints: week >= 24 ? 'staff' : 'names',
          ...(week >= 17 ? { rhythm: 2 as const } : {}),
        });
      }
    });
  } else if (plan.criterionSpec) {
    const spec = plan.criterionSpec;
    spec.songs.forEach((x, k) => steps.push(songStep(week, k, x.songId, !!x.tempo, x.minBpm ?? 0)));
    const chk = checksStep(week, spec.parentChecks ?? []);
    if (chk) steps.push(chk);
  }
  if (!ear) {
    const c = conceptStep(week);
    if (c) steps.push(c);
  }
  return { week, steps, perform: !!plan.criterionSpec?.spread };
}

/* ---------- Chấm buổi thi ---------- */

/**
 * Lượt là bằng chứng của BUỔI THI: lượt ĐẠT do micro chấm, hoặc lượt đạt có người xác nhận (phiếu 3 ý nếu có). Không phân biệt
 * ngày phát hành như runIsEvidence (buổi thi luôn mới).
 */
export function testOutEvidence(r: Run): boolean {
  if (!r.passed) return false;
  if (r.source === 'mic') return true;
  return !r.checklist || (r.checklist.notes && r.checklist.beat && r.checklist.fingers);
}

const songRunOk = (s: Extract<TestStep, { kind: 'song' }>, r: Run): boolean =>
  passedWhole(r, s.songId, s.need.tempo, s.need.minBpm) && (!s.need.staff || r.hints === 'staff') && (!s.need.level2 || r.level === 2) && testOutEvidence(r);

const sightRuns = (s: Extract<TestStep, { kind: 'sight' }>, runs: readonly Run[]) => runs.filter((r) => r.songId.startsWith(`sight:${s.position}:`));

/**
 * Kết quả MỘT bước trong buổi `session`: 'pass' (đã đạt), 'fail' (micro đã chấm mà chưa đạt, hoặc bài chưa đàn lượt nào),
 * 'unjudged' (micro không chấm được — đàn khi micro tắt / thẻ xem tay / sân khấu chưa có huy chương → mời bé tự xác nhận). Trò đố: app tự chấm → 'pass' (tiêu chí chung
 * quyết định ở gradeTestOut).
 */
export function stepVerdict(step: TestStep, session: Pick<Session, 'songRuns' | 'parentAssessments' | 'micAssessments'>): 'pass' | 'fail' | 'unjudged' {
  switch (step.kind) {
    case 'song': {
      const runs = session.songRuns.filter((r) => r.songId === step.songId && !r.hand && !r.phrase);
      if (runs.some((r) => songRunOk(step, r))) return 'pass';
      // chưa đàn lượt nào (bấm "Tiếp" bỏ qua) → chưa đạt; micro đã chấm → chưa đạt; chỉ lượt không micro → bé tự xác nhận
      return !runs.length || runs.some((r) => r.source === 'mic') ? 'fail' : 'unjudged';
    }
    case 'sight': {
      const runs = sightRuns(step, session.songRuns);
      if (runs.filter(testOutEvidence).length >= step.count) return 'pass';
      return !runs.length || runs.some((r) => r.source === 'mic') ? 'fail' : 'unjudged';
    }
    case 'notes': {
      const ok = (id: string) =>
        session.parentAssessments.some((a) => a.note === id && a.result === 'correct') ||
        session.micAssessments.some((a) => a.expected === id && (a.parentOverride ? a.parentOverride === 'correct' : a.firstTry));
      const ids = step.segment.targets.map((t) => t.noteId);
      if (step.key === 'c4') return session.parentAssessments.filter((a) => a.note === 'C4' && a.result === 'correct').length + session.micAssessments.filter((a) => a.expected === 'C4' && a.firstTry).length >= 10 ? 'pass' : 'unjudged';
      return ids.every(ok) ? 'pass' : 'unjudged';
    }
    case 'stage':
      return session.parentAssessments.some((a) => a.note === 'medal' && a.result === 'correct') ? 'pass' : 'unjudged';
    case 'quiz':
      return 'pass';
  }
}

/** Bằng chứng TẠM (chỉ để chấm — không ghi vào dữ liệu) cho một bước bé tự xác nhận "Con làm được rồi". */
export function selfConfirmEvidence(step: TestStep, ts: number): { runs: SongRun[]; parent: ParentAssessment[] } {
  switch (step.kind) {
    case 'song': {
      const bpm = Math.max(step.bpm ?? 0, step.need.minBpm, findTune(step.songId)?.bpm ?? 60);
      return {
        runs: [
          {
            songId: step.songId,
            mode: step.need.tempo ? 'tempo' : step.mode,
            ...(step.need.tempo ? { level: 2 as const } : {}),
            bpm,
            hints: step.need.staff ? 'staff' : step.hints,
            phrase: null,
            total: 10,
            hits: 10,
            source: 'parent',
            passed: true,
            checklist: { notes: true, beat: true, fingers: true },
            ts,
          },
        ],
        parent: [],
      };
    }
    case 'sight':
      return {
        runs: Array.from({ length: step.count }, () => ({
          songId: `sight:${step.position}:${step.hand}`,
          mode: 'wait' as const,
          bpm: 60,
          hints: step.hints,
          phrase: null,
          total: 10,
          hits: 10,
          source: 'parent' as const,
          passed: true,
          checklist: { notes: true, beat: true, fingers: true },
          ts,
        })),
        parent: [],
      };
    case 'notes':
      return { runs: [], parent: step.segment.targets.map((t) => ({ note: t.noteId, result: 'correct' as const, ts })) };
    case 'stage':
      return { runs: [], parent: [{ note: 'medal', result: 'correct', ts }] };
    case 'quiz':
      return { runs: [], parent: [] };
  }
}

/** Câu đố "điều mới của tuần" đạt khi đúng ≥ 60% (2/3). Không trả lời câu nào (bỏ qua / lỗi màn) → không xét. */
export const CONCEPT_PASS = 0.6;

export interface TestOutGrade {
  passed: boolean;
  /** Tên các bước cần tập thêm (lời cho bé) */
  missing: string[];
}

/**
 * Chấm buổi thi: tiêu chí tuần (weekCriteria.criterionMetIn — MỘT buổi, bằng chứng testOutEvidence) trên buổi thi + bằng chứng
 * tạm của các bước bé tự xác nhận (`selfOk` = mã bước) VÀ câu đố điều mới (`concept` = [đúng, tổng]).
 */
export function gradeTestOut(plan: TestOutPlan, session: Session, selfOk: readonly string[], concept: readonly [number, number] | null): TestOutGrade {
  const extraRuns: SongRun[] = [];
  const extraParent: ParentAssessment[] = [];
  const ts = session.startedAt + 1;
  for (const st of plan.steps) {
    // chỉ bước micro KHÔNG chấm được (micro đã chấm chưa đạt thì tự xác nhận không thay được)
    if (!selfOk.includes(st.key) || stepVerdict(st, session) !== 'unjudged') continue;
    const ev = selfConfirmEvidence(st, ts);
    extraRuns.push(...ev.runs);
    extraParent.push(...ev.parent);
  }
  const graded: Session = { ...session, songRuns: [...session.songRuns, ...extraRuns], parentAssessments: [...session.parentAssessments, ...extraParent] };
  const critOk = plan.steps.length > 0 && criterionMetIn(plan.week, [graded], testOutEvidence);
  const conceptOk = !concept || concept[1] === 0 || concept[0] / concept[1] >= CONCEPT_PASS;
  const missing: string[] = [];
  for (const st of plan.steps) {
    if (st.kind === 'quiz') {
      if (st.concept ? !conceptOk : !critOk) missing.push(st.label);
    } else if (stepVerdict(st, graded) !== 'pass') missing.push(st.label);
  }
  if (!critOk && !missing.length) missing.push(weekPlan(plan.week).kidGoal ?? weekPlan(plan.week).criterion.text);
  return { passed: critOk && conceptOk, missing };
}

/* ---------- Được thi không? Ghi kết quả ---------- */

export type TestOutWhy = 'ok' | 'cooldown' | 'done' | 'last';

/**
 * ⚡ Thi vượt tuần có mở cho tuần hiện tại không: 'last' = tuần cuối giáo trình; 'done' = tuần đã xong (sắp sang tuần mới);
 * 'cooldown' = hôm nay đã thi tuần này chưa đạt (mai thi lại).
 */
export function testOutStatus(data: Readonly<AppData>, today: string): { week: number; why: TestOutWhy } {
  const week = data.progress.currentWeek;
  if (week >= MAX_WEEK) return { week, why: 'last' };
  if (weekComplete(week, data)) return { week, why: 'done' };
  const tried = data.progress.skipTries?.[String(week)];
  if (typeof tried === 'string' && tried >= today) return { week, why: 'cooldown' };
  return { week, why: 'ok' };
}

/** Thi ĐẠT (SỬA TẠI CHỖ): ghi 'testedOut' cho `week` và sang tuần sau nếu bé đang ở đúng tuần đó. Trả về tuần mới. */
export function applyTestOutPass(data: AppData, week: number, at: number, date: string): number {
  addSkips(data, [week], 'testedOut', at, date);
  if (data.progress.currentWeek === week && week < MAX_WEEK) data.progress.currentWeek = week + 1;
  return data.progress.currentWeek;
}

/** Thi CHƯA đạt (SỬA TẠI CHỖ): ghi ngày để chờ 1 ngày mới thi lại tuần đó. */
export function noteTestOutFail(data: AppData, week: number, date: string): void {
  (data.progress.skipTries ??= {})[String(week)] = date;
}

/** Bài học (giả) của buổi thi — chỉ để có mã / tuần / tên (màn thi không chạy kế hoạch buổi thường). */
export function testOutLesson(week: number): Lesson {
  return { id: testOutLessonId(week), week, title: `Thi vượt tuần ${week}`, emoji: '⚡', activities: [] };
}
