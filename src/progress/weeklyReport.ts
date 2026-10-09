/**
 * (+ 2026-10-09, OWNER duyệt) "📊 BÁO CÁO TUẦN CHO BỐ MẸ" — HÀM THUẦN (test: tests/weeklyReport.test.ts).
 * Giao diện + ảnh chia sẻ: ui/screens/weeklyReport.ts, weeklyReportImage.ts (nạp muộn). Viên "đã sẵn sàng": weeklyReportDue.ts.
 *
 * Tuần lịch: thứ 2 → chủ nhật theo GIỜ MÁY (history.mondayKey / dayKey — không dùng UTC).
 *
 * GỘP LỊCH SỬ (compaction.ts, buổi > 56 ngày): báo cáo 8 tuần gần nhất có thể chạm phần đã gộp.
 * - Còn nguyên dù đã gộp: ngày tập / phút / sao (history.practiceDays), bài THUỘC lúc nào (songs.m), tuần giáo trình bắt đầu
 *   lúc nào (weekFirst), buổi diễn (concerts — không bị gộp), cúp thử thách đã lưu (progress.challenges).
 * - Mất khi đã gộp: số buổi, bài chơi trọn, tiến bộ, micro → `detail` = 'partial' / 'summary' và các trường đó = null
 *   (giao diện ghi "không còn chi tiết").
 */
import { CHALLENGE_INFO, completedChallengeWeeks, weeklyChallenge } from '../lessons/challenges';
import { AUDIENCE_CHIPS, concertLog } from '../lessons/concert';
import { MAX_WEEK, criterionProgress, songStats, weekComplete, weekPassed, weekPlan } from '../lessons/lessonEngine';
import { findTune } from '../music/exercises';
import { customTuneTitle } from '../practice/parentSongs';
import { topStruggles } from '../ui/screens/tonight';
import { sessionAnswers } from './answers';
import { dayKey, firstDateOfWeek, firstSessionDate, hist, mondayKey, weekdayIndex } from './history';
import type { AppData, Session, SongRun } from './schema';
import { addDays } from './weeklyReportDue';

/** Số tuần ĐÃ HẾT trong lịch sử báo cáo tuần. */
export const HISTORY_WEEKS = 8;
/** Mục tiêu chăm chỉ (cùng báo cáo tiến bộ): 4 ngày / tuần. */
export const WEEK_TARGET_DAYS = 4;
/** Tiến bộ một bài: % nốt đúng tăng ít nhất ngần này điểm. */
export const SONG_GAIN_MIN = 10;
/** Tiến bộ kỹ năng / hai tay: tăng ít nhất ngần này điểm %. */
export const SKILL_GAIN_MIN = 5;
/** Kỹ năng: cần ít nhất ngần này câu mỗi bên mới so. */
export const SKILL_MIN_ANSWERS = 5;
/** Micro "chưa chắc": bố mẹ sửa ≥ 20% số nốt micro chấm (khi có ≥ 5 nốt). */
export const MIC_OVERRIDE_RATIO = 0.2;
/** Hai tay "còn yếu": dưới ngần này % (bố mẹ giúp tập tách tay). */
export const HANDS_LOW_PCT = 70;

export type WeekDetail = 'full' | 'partial' | 'summary';

export interface WeekSong {
  id: string;
  title: string;
}

export interface Improvement {
  kind: 'song' | 'hands' | 'skill' | 'tempo';
  /** Chủ đề ngắn: tên bài / "Hai tay cùng lúc" / "Vỗ nhịp"… */
  label: string;
  from: number;
  to: number;
  /** Đơn vị: '%' hoặc ' nhịp/phút' */
  unit: '%' | ' nhịp/phút';
}

export interface MicNote {
  kind: 'off' | 'unreliable';
  text: string;
}

export interface WeeklySummary {
  /** Thứ 2 / chủ nhật (YYYY-MM-DD) */
  monday: string;
  sunday: string;
  /** Tuần đang diễn ra (chưa hết) */
  inProgress: boolean;
  detail: WeekDetail;
  name: string;
  /** 7 ô thứ 2 → CN: có tập không */
  dayDots: boolean[];
  days: number;
  minutes: number;
  stars: number;
  /** Số buổi (null = tuần đã gộp, không còn số buổi) */
  sessions: number | null;
  /** Tuần giáo trình cuối tuần lịch (null = chưa học bài nào) */
  course: {
    week: number;
    title: string;
    island: string;
    islandEmoji: string;
    /** Tuần giáo trình bé BẮT ĐẦU trong tuần lịch này (lên đảo mới), trừ tuần 1 */
    reached: number[];
    /** Tiêu chí tuần (TÌNH TRẠNG HIỆN TẠI — chỉ có khi đây là tuần giáo trình bé đang học) */
    criterion: { text: string; days: number | null; need: number | null; passed: boolean; complete: boolean } | null;
    /** Đảo này bé đã đi qua (tới hôm nay) */
    passedNow: boolean;
  } | null;
  mastered: WeekSong[];
  /** Bài chơi trọn & đạt trong tuần (null = đã gộp) */
  wholeSongs: WeekSong[] | null;
  concerts: { count: number; audience: string[]; others: number };
  challenge: { icon: string; title: string; done: boolean; text: string } | null;
  improvements: Improvement[] | null;
  /** % nốt đúng hai tay cùng lúc (micro chấm 2 tay) trong tuần; null = không có */
  handsPct: number | null;
  /** Chỗ hay vấp nhất trong tuần (để gợi ý bố mẹ giúp) */
  struggle: string | null;
  /** Ghi chú micro (tắt / nghe chưa chắc) */
  mic: MicNote | null;
  praise: string[];
  help: string;
}

/* ---------------- Ngày ---------------- */

/** Thứ 2 của các tuần trong lịch sử: tuần này (chưa hết) + HISTORY_WEEKS tuần đã hết, MỚI → CŨ; bỏ tuần trước khi bé bắt đầu. */
export function historyMondays(d: Readonly<AppData>, now: Date, n = HISTORY_WEEKS): string[] {
  const thisMon = mondayKey(dayKey(now));
  const first = firstPracticeDate(d);
  const startMon = first ? mondayKey(first) : thisMon;
  const out: string[] = [];
  for (let k = 0; k <= n; k++) {
    const m = addDays(thisMon, -7 * k);
    if (m < startMon) break;
    out.push(m);
  }
  return out;
}

function firstPracticeDate(d: Readonly<AppData>): string | null {
  let m = firstSessionDate(d);
  for (const date of Object.keys(d.progress.practiceDays ?? {})) if (m === null || date < m) m = date;
  return m;
}

const inWeek = (date: string, monday: string, end: string) => date >= monday && date < end;

/* ---------------- Lượt chơi ---------------- */

const wholeRun = (r: SongRun) => !r.phrase && !r.hand && r.total > 0 && !r.songId.startsWith('sight');
const pctOf = (hits: number, total: number) => Math.round((hits / total) * 100);

function songTitle(id: string, d: Readonly<AppData>): string {
  return findTune(id)?.titleVi ?? customTuneTitle(id, d) ?? id;
}

/** Điểm % tốt nhất của mỗi bài (lượt chơi trọn, đủ tay). */
function bestBySong(sessions: readonly Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) for (const r of s.songRuns) if (wholeRun(r)) m.set(r.songId, Math.max(m.get(r.songId) ?? 0, pctOf(r.hits, r.total)));
  return m;
}

function handsPctOf(sessions: readonly Session[]): number | null {
  let hits = 0;
  let total = 0;
  for (const s of sessions)
    for (const r of s.songRuns) {
      if (!r.hands || r.phrase) continue;
      hits += r.hands.RH.hits + r.hands.LH.hits;
      total += r.hands.RH.total + r.hands.LH.total;
    }
  return total ? pctOf(hits, total) : null;
}

function maxTempo(sessions: readonly Session[]): number {
  let m = 0;
  for (const s of sessions) for (const r of s.songRuns) if (wholeRun(r) && r.passed && r.mode === 'tempo' && r.bpm > m) m = r.bpm;
  return m;
}

const SKILL_LABEL = { reading: 'Đọc nốt', ear: 'Tai nghe', rhythm: 'Vỗ nhịp' } as const;

function skillPct(sessions: readonly Session[]): Record<keyof typeof SKILL_LABEL, { ok: number; all: number }> {
  const out = { reading: { ok: 0, all: 0 }, ear: { ok: 0, all: 0 }, rhythm: { ok: 0, all: 0 } };
  for (const s of sessions)
    for (const a of sessionAnswers(s)) {
      out[a.skill].all++;
      if (a.ok) out[a.skill].ok++;
    }
  return out;
}

/**
 * Tiến bộ trong tuần so với trước đó (chỉ từ các buổi CÒN GIỮ):
 * - bài: % nốt đúng tốt nhất trong tuần ≥ tốt nhất trước tuần + SONG_GAIN_MIN (và ≥ 60%);
 * - hai tay cùng lúc: % tuần này ≥ tuần trước + SKILL_GAIN_MIN;
 * - đọc nốt / tai nghe / vỗ nhịp: % đúng tuần này ≥ tuần trước + SKILL_GAIN_MIN (≥ SKILL_MIN_ANSWERS câu mỗi bên);
 * - tốc độ: lượt theo nhịp đạt nhanh nhất vượt kỷ lục cũ (kể cả phần đã gộp).
 * Xếp theo mức tăng, tối đa 3.
 */
export function improvementsOf(d: Readonly<AppData>, monday: string): Improvement[] {
  const end = addDays(monday, 7);
  const prevMon = addDays(monday, -7);
  const week = d.sessions.filter((s) => inWeek(s.date, monday, end));
  const before = d.sessions.filter((s) => s.date < monday);
  const prevWeek = before.filter((s) => s.date >= prevMon);
  const out: Array<Improvement & { gain: number }> = [];

  const now = bestBySong(week);
  const old = bestBySong(before);
  for (const [id, to] of now) {
    const from = old.get(id);
    if (from === undefined || to < 60 || to - from < SONG_GAIN_MIN) continue;
    out.push({ kind: 'song', label: songTitle(id, d), from, to, unit: '%', gain: to - from });
  }

  const hNow = handsPctOf(week);
  const hPrev = handsPctOf(prevWeek);
  if (hNow !== null && hPrev !== null && hNow - hPrev >= SKILL_GAIN_MIN) {
    out.push({ kind: 'hands', label: 'Hai tay cùng lúc', from: hPrev, to: hNow, unit: '%', gain: hNow - hPrev });
  }

  const sNow = skillPct(week);
  const sPrev = skillPct(prevWeek);
  for (const k of ['rhythm', 'reading', 'ear'] as const) {
    const a = sNow[k];
    const b = sPrev[k];
    if (a.all < SKILL_MIN_ANSWERS || b.all < SKILL_MIN_ANSWERS) continue;
    const to = pctOf(a.ok, a.all);
    const from = pctOf(b.ok, b.all);
    if (to - from >= SKILL_GAIN_MIN) out.push({ kind: 'skill', label: SKILL_LABEL[k], from, to, unit: '%', gain: to - from });
  }

  const tNow = maxTempo(week);
  let tOld = maxTempo(before);
  for (const a of Object.values(hist(d).songs)) if ((a.b ?? 0) > tOld) tOld = a.b ?? 0;
  if (tOld > 0 && tNow > tOld) out.push({ kind: 'tempo', label: 'Tốc độ nhanh nhất', from: tOld, to: tNow, unit: ' nhịp/phút', gain: tNow - tOld });

  return out
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3)
    .map(({ gain: _g, ...x }) => x);
}

/** Câu một dòng cho một tiến bộ. */
export function improvementText(i: Improvement): string {
  if (i.kind === 'song') return `Bài “${i.label}”: ${i.from}% → ${i.to}% nốt đúng`;
  if (i.kind === 'tempo') return `${i.label}: ${i.from} → ${i.to} nhịp/phút`;
  if (i.kind === 'skill' && i.label === 'Vỗ nhịp') return `Nhịp đều hơn (vỗ nhịp): ${i.from}% → ${i.to}% đúng`;
  return `${i.label}: ${i.from}% → ${i.to}% đúng`;
}

/* ---------------- Micro ---------------- */

/**
 * Ghi chú micro của tuần (chỉ khi còn đủ buổi):
 * - tuần có chơi bài / tập nốt mà micro KHÔNG chấm lần nào → 'off' (kết quả do bố mẹ chấm);
 * - micro chấm ≥ 5 nốt mà bố mẹ phải sửa ≥ 20% → 'unreliable'.
 */
export function micNoteOf(week: readonly Session[]): MicNote | null {
  let activity = 0;
  let mic = 0;
  let micNotes = 0;
  let overrides = 0;
  for (const s of week) {
    activity += s.songRuns.length + s.parentAssessments.length + s.micAssessments.length;
    micNotes += s.micAssessments.length;
    mic += s.micAssessments.length + s.songRuns.filter((r) => r.source === 'mic').length;
    overrides += s.micAssessments.filter((a) => a.parentOverride).length;
  }
  if (!activity) return null;
  if (!mic) return { kind: 'off', text: 'Tuần này micro không chấm lần nào — kết quả là do bố mẹ đánh giá.' };
  if (micNotes >= 5 && overrides / micNotes >= MIC_OVERRIDE_RATIO) {
    return { kind: 'unreliable', text: `Micro nghe chưa chắc (bố mẹ sửa ${overrides}/${micNotes} nốt) — số liệu micro chỉ để tham khảo.` };
  }
  return null;
}

/* ---------------- Lời khen & bố mẹ giúp ---------------- */

export type AdviceInput = Pick<
  WeeklySummary,
  'name' | 'days' | 'mastered' | 'improvements' | 'concerts' | 'challenge' | 'course' | 'handsPct' | 'struggle' | 'mic' | 'inProgress'
>;

const audienceCount = (c: WeeklySummary['concerts']) => c.audience.length + c.others;

/**
 * 1–2 câu "NÊN KHEN" — khen CỐ GẮNG cụ thể (không khen chung chung), theo thứ tự ưu tiên:
 * bài mới thuộc → tiến bộ rõ → đủ ngày tập → biểu diễn → thử thách → lên đảo mới → đã ngồi vào đàn.
 * Tuần không tập ngày nào → không có câu khen (bố mẹ giúp bắt đầu lại).
 */
export function praiseFor(s: AdviceInput): string[] {
  if (!s.days) return [];
  const out: string[] = [];
  if (s.mastered.length) {
    const t = s.mastered[0].title;
    out.push(
      s.mastered.length > 1
        ? `Con vừa thuộc ${s.mastered.length} bài mới (có “${t}”) — khen con đã kiên trì tập tới khi chơi trọn bài.`
        : `Con vừa thuộc bài “${t}” — khen con đã kiên trì, rồi nhờ con đàn lại cho cả nhà nghe.`,
    );
  }
  const imp = s.improvements?.[0];
  if (imp) out.push(`Tiến bộ rõ: ${improvementText(imp)} — khen con vì đã chịu khó tập lại chỗ khó.`);
  if (s.days >= WEEK_TARGET_DAYS) out.push(`Con tập ${s.days} ngày trong tuần — khen sự đều đặn, đó là bí quyết học đàn.`);
  if (s.concerts.count) {
    const n = audienceCount(s.concerts);
    out.push(`Con đã biểu diễn${n ? ` cho ${n} người nghe` : ' cho cả nhà'} — khen con dũng cảm đàn trước mọi người.`);
  }
  if (s.challenge?.done) out.push(`Con hoàn thành thử thách tuần “${s.challenge.title}” — khen con đã giữ lời hứa với chính mình.`);
  const reached = s.course?.reached ?? [];
  if (reached.length) out.push(`Con đã sang đảo mới (tuần ${reached[reached.length - 1]}) — khen con đã vượt qua bài kiểm tra tuần.`);
  if (!out.length) out.push(`Con đã ngồi vào đàn ${s.days} ngày — khen con vì đã tự giác bắt đầu, dù buổi ngắn.`);
  return out.slice(0, 2);
}

/**
 * MỘT gợi ý "BỐ MẸ GIÚP" — việc cụ thể, theo thứ tự ưu tiên:
 * chưa tập ngày nào → micro nghe nhầm → hai tay còn yếu → tiêu chí tuần chưa đạt → ít ngày tập → chỗ hay vấp → mặc định.
 */
export function helpFor(s: AdviceInput): string {
  if (!s.days) {
    return s.inProgress
      ? 'Tuần này con chưa tập — chọn cùng con một giờ cố định (vd sau bữa tối), chỉ 10 phút, và đặt ⏰ nhắc giờ ở màn Phụ huynh.'
      : 'Tuần qua con chưa tập — chọn cùng con một giờ cố định (vd sau bữa tối), chỉ 10 phút, và đặt ⏰ nhắc giờ ở màn Phụ huynh.';
  }
  if (s.mic?.kind === 'unreliable') return 'Micro hay nghe nhầm — vào “Cài micro” chạy lại bước kiểm tra 5 nốt, hoặc bố mẹ ngồi cạnh và chấm bằng tay.';
  if (s.handsPct !== null && s.handsPct < HANDS_LOW_PCT) {
    return `Hai tay cùng lúc mới đúng ${s.handsPct}% — giúp con tập tách từng tay một câu, rồi ghép hai tay thật chậm (tốc độ 40–50).`;
  }
  const c = s.course?.criterion;
  if (c && !c.passed && c.need !== null && c.days !== null && c.days < c.need) {
    const left = c.need - c.days;
    return `Bài kiểm tra tuần ${s.course!.week}: còn ${left} ngày đạt nữa — ngồi cạnh con khi con chơi “${c.text}” và khen từng lần con chơi trọn.`;
  }
  if (s.days < WEEK_TARGET_DAYS) {
    return `Con tập ${s.days} ngày — thêm 1–2 buổi ngắn 5–10 phút để đủ ${WEEK_TARGET_DAYS} ngày/tuần (đều quan trọng hơn lâu).`;
  }
  if (s.struggle) return `Chỗ con hay vấp: ${s.struggle} — tập riêng chỗ đó thật chậm 5 phút (nút “Làm ngay” ở màn Phụ huynh).`;
  return 'Nhờ con đàn bài con thích nhất cho cả nhà nghe — được lắng nghe là động lực lớn nhất của con.';
}

/* ---------------- Gom báo cáo một tuần ---------------- */

function detailOf(d: Readonly<AppData>, monday: string, end: string): WeekDetail {
  const through = hist(d).compactedThrough;
  if (through <= monday) return 'full';
  if (through >= end) return 'summary';
  return 'partial';
}

/**
 * Báo cáo của tuần lịch bắt đầu `monday` (YYYY-MM-DD, thứ 2). `now` quyết định tuần đang diễn ra và chỗ hay vấp.
 */
export function buildWeeklySummary(d: Readonly<AppData>, monday: string, now: Date): WeeklySummary {
  const mon = mondayKey(monday);
  const end = addDays(mon, 7);
  const sunday = addDays(mon, 6);
  const today = dayKey(now);
  const inProgress = today < end;
  const detail = detailOf(d, mon, end);
  const week = d.sessions.filter((s) => inWeek(s.date, mon, end));

  // Ngày tập / phút / sao (progress.practiceDays gồm cả phần đã gộp)
  const dayDots = Array<boolean>(7).fill(false);
  let minutes = 0;
  let stars = 0;
  const pd = d.progress.practiceDays ?? {};
  const pdDates = Object.keys(pd).length ? pd : fallbackDays(d);
  for (const [date, v] of Object.entries(pdDates)) {
    if (!inWeek(date, mon, end)) continue;
    dayDots[weekdayIndex(date)] = true;
    minutes += v.minutes;
    stars += v.stars;
  }
  const days = dayDots.filter(Boolean).length;

  // Tuần giáo trình
  let course: WeeklySummary['course'] = null;
  {
    let cw = 0;
    const reached: number[] = [];
    for (let w = 1; w <= MAX_WEEK; w++) {
      const f = firstDateOfWeek(d, w);
      if (!f || f > sunday) continue;
      if (w > cw) cw = w;
      if (f >= mon && w > 1) reached.push(w);
    }
    const cur = d.progress.currentWeek;
    if (inProgress && cur > cw) cw = cur;
    if (cw) {
      const plan = weekPlan(cw);
      const isCurrent = cw === cur;
      let criterion: NonNullable<WeeklySummary['course']>['criterion'] = null;
      if (isCurrent) {
        const p = criterionProgress(cw, d);
        criterion = { text: plan.criterion.text, days: p?.days ?? null, need: p?.needDays ?? null, passed: weekPassed(cw, d), complete: weekComplete(cw, d) };
      }
      course = { week: cw, title: plan.title, island: plan.island, islandEmoji: plan.islandEmoji, reached, criterion, passedNow: cw < cur || (isCurrent && weekComplete(cw, d)) };
    }
  }

  // Bài mới thuộc (songs.m còn sau khi gộp)
  const startMs = msOf(mon);
  const endMs = msOf(end);
  const mastered: WeekSong[] = Object.entries(songStats(d))
    .filter(([id, a]) => a.m !== undefined && a.m >= startMs && a.m < endMs && !id.startsWith('sight'))
    .sort(([, a], [, b]) => (a.m ?? 0) - (b.m ?? 0))
    .map(([id]) => ({ id, title: songTitle(id, d) }));

  const full = detail === 'full';
  let wholeSongs: WeekSong[] | null = null;
  if (full) {
    const seen = new Set<string>();
    wholeSongs = [];
    for (const s of week)
      for (const r of s.songRuns)
        if (wholeRun(r) && r.passed && !seen.has(r.songId)) {
          seen.add(r.songId);
          wholeSongs.push({ id: r.songId, title: songTitle(r.songId, d) });
        }
  }

  // Buổi diễn (không bị gộp)
  const chips = new Set<string>(AUDIENCE_CHIPS);
  const aud = new Set<string>();
  let others = 0;
  let count = 0;
  for (const c of concertLog(d)) {
    if (!inWeek(c.date, mon, end)) continue;
    count++;
    for (const a of c.audience) {
      if (chips.has(a)) aud.add(a);
      else others++;
    }
  }
  const concerts = { count, audience: AUDIENCE_CHIPS.filter((a) => aud.has(a)), others };

  // Thử thách tuần
  let challenge: WeeklySummary['challenge'] = null;
  if (mon >= hist(d).compactedThrough) {
    const c = weeklyChallenge(d, mon);
    if (days || c.done) challenge = { icon: c.icon, title: c.title, done: c.done, text: c.text };
  } else {
    const rec = completedChallengeWeeks(d).get(mon);
    const info = rec ? CHALLENGE_INFO[rec.id as keyof typeof CHALLENGE_INFO] : undefined;
    if (info) challenge = { icon: info.icon, title: info.title, done: true, text: 'Xong!' };
  }

  const improvements = full ? improvementsOf(d, mon) : null;
  const handsPct = full ? handsPctOf(week) : null;
  const mic = full ? micNoteOf(week) : null;
  const struggleAt = inProgress ? now : new Date(msOf(end) - 1);
  const top = full ? topStruggles({ ...d, sessions: week } as AppData, struggleAt, 8, 1)[0] : undefined;

  const base: AdviceInput = {
    name: d.learner.name.trim(),
    days,
    mastered,
    improvements,
    concerts,
    challenge,
    course,
    handsPct,
    struggle: top ? top.label : null,
    mic,
    inProgress,
  };
  return {
    ...base,
    monday: mon,
    sunday,
    detail,
    dayDots,
    minutes,
    stars,
    sessions: full ? week.filter((s) => s.minutes > 0 || s.completed).length : null,
    wholeSongs,
    praise: praiseFor(base),
    help: helpFor(base),
  };
}

function msOf(date: string): number {
  const [y, m, dd] = date.split('-').map(Number);
  return new Date(y, m - 1, dd).getTime();
}

/** Dữ liệu chưa tính progress.practiceDays (test, dữ liệu dựng tay) → tính từ phần đã gộp + buổi. */
function fallbackDays(d: Readonly<AppData>): Record<string, { minutes: number; stars: number }> {
  const out: Record<string, { minutes: number; stars: number }> = {};
  for (const [date, [minutes, stars]] of Object.entries(hist(d).practiceDays)) out[date] = { minutes, stars };
  for (const s of d.sessions) {
    if (s.minutes === 0 && !s.selfRating) continue;
    const e = (out[s.date] ??= { minutes: 0, stars: 0 });
    e.minutes += s.minutes;
    if (s.selfRating) e.stars += 3;
  }
  return out;
}

/* ---------------- Bản chữ (sao chép / gửi Zalo) ---------------- */

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** "2026-10-05" → "05/10" */
export function shortDate(s: string): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** "05/10 – 11/10/2026" */
export function weekRange(s: Pick<WeeklySummary, 'monday' | 'sunday'>): string {
  return `${shortDate(s.monday)} – ${shortDate(s.sunday)}/${s.sunday.slice(0, 4)}`;
}

export function minutesShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} phút`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

export function songList(list: readonly WeekSong[], max = 3): string {
  const names = list.slice(0, max).map((s) => `“${s.title}”`);
  return list.length > max ? `${names.join(', ')} và ${list.length - max} bài khác` : names.join(', ');
}

/** Bài chơi trọn & đạt trong tuần mà KHÔNG phải bài mới thuộc (tránh kể hai lần). */
export function extraWholeSongs(s: Pick<WeeklySummary, 'mastered' | 'wholeSongs'>): WeekSong[] {
  const m = new Set(s.mastered.map((x) => x.id));
  return (s.wholeSongs ?? []).filter((x) => !m.has(x.id));
}

/** Bản chữ của báo cáo tuần (không có dữ liệu nhạy cảm: chỉ tên bé nếu bố mẹ đã đặt, khán giả là "Ông/Bà…" + số người). */
export function weeklyText(s: WeeklySummary): string {
  const L: string[] = [];
  L.push(`🎹 Báo cáo tuần học đàn ${weekRange(s)}${s.name ? ` — bé ${s.name}` : ''}${s.inProgress ? ' (tuần đang diễn ra)' : ''}`);
  L.push(`📅 Ngày tập: ${s.days}/7 (${DOW.map((x, i) => `${x}${s.dayDots[i] ? '✓' : '·'}`).join(' ')})`);
  const bits = [`⏱️ ${minutesShort(s.minutes)}`];
  if (s.sessions !== null) bits.push(`${s.sessions} buổi`);
  if (s.stars) bits.push(`⭐ ${s.stars} sao`);
  L.push(bits.join(' · '));
  if (s.course) {
    const c = s.course;
    let line = `🏝️ Tuần ${c.week}: ${c.title} (${c.island})`;
    if (c.reached.length) line += ` — mới lên đảo này!`;
    if (c.criterion) {
      if (c.criterion.passed) line += ' — đã đạt bài kiểm tra tuần';
      else if (c.criterion.need !== null) line += ` — bài kiểm tra tuần: ${c.criterion.days}/${c.criterion.need} ngày đạt`;
    } else if (c.passedNow) line += ' — đã qua';
    L.push(line);
  }
  if (s.mastered.length) L.push(`🌟 Bài mới thuộc: ${songList(s.mastered, 4)}`);
  const more = extraWholeSongs(s);
  if (more.length) L.push(`🎵 Chơi trọn & đạt${s.mastered.length ? ' thêm' : ''}: ${more.length} bài (${songList(more)})`);
  if (s.concerts.count) {
    const who = [...s.concerts.audience, ...(s.concerts.others ? [`${s.concerts.others} người nữa`] : [])].join(', ');
    L.push(`🎤 Biểu diễn: ${s.concerts.count} lần${who ? ` (nghe: ${who})` : ''}`);
  }
  if (s.challenge) L.push(`🏆 Thử thách “${s.challenge.title}”: ${s.challenge.done ? 'hoàn thành!' : s.challenge.text}`);
  if (s.improvements?.length) L.push(`📈 Tiến bộ: ${s.improvements.map(improvementText).join('; ')}`);
  if (s.handsPct !== null) L.push(`🙌 Hai tay cùng lúc: ${s.handsPct}% nốt đúng`);
  for (const p of s.praise) L.push(`👏 Nên khen: ${p}`);
  L.push(`🤝 Bố mẹ giúp: ${s.help}`);
  if (s.mic) L.push(`🎙️ ${s.mic.text}`);
  if (s.detail !== 'full') L.push('(Tuần cũ: app đã gộp bớt chi tiết để tiết kiệm bộ nhớ — chỉ còn ngày tập, bài thuộc, biểu diễn, thử thách.)');
  return L.join('\n');
}
