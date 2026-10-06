/**
 * "📊 BÁO CÁO TIẾN BỘ" (màn Phụ huynh → chia sẻ cho ông bà / thầy cô) — gom số liệu, HÀM THUẦN, có test
 * (tests/report.test.ts). Giao diện + ảnh PNG: src/ui/screens/report.ts, reportImage.ts.
 *
 * Nguồn: sessions (buổi học: bố mẹ bấm / app chấm / micro / lượt chơi bài), progress (tuần, bài đã xong, ngày tập),
 * compositions, sticker (lessons/stickers.ts). Chỗ khó + gợi ý dùng LẠI logic "Việc cần làm tối nay" (tonight.ts).
 *
 * Phân loại câu trả lời trò chơi app chấm (APP_ASSESSMENT không ghi kiểu trò — chỉ có `expected`):
 * - 'up'/'down', 'step'/'skip', 'major'/'minor' → TAI NGHE (lên/xuống, bước/nhảy nghe, vui/buồn)
 * - mã quãng 'same' / 'step-up' / '4th-down'… → ĐỌC NỐT (quãng trên khuông)
 * - tên nốt ('C4'…) → "Nốt nào đây?" (tai) HOẶC "Đọc nốt"/"Nốt mốc" (đọc): đoán theo các trò CÓ THỂ có trong buổi đó
 *   (trò trong bài + khởi động của tuần / tuần trước; bài "Luyện tập mỗi ngày" có thể có "Nốt nào đây?").
 *   Buổi có cả hai loại → không xếp (không đoán bừa).
 */
import { LEVELS, MAX_WEEK, findLesson, levelOf, masteredSongs, songFresh, songStats, weekComplete, weekPlan } from '../lessons/lessonEngine';
import { firstSessionDate, hist } from './history';
import { allStickers, dynamicsDone } from '../lessons/stickers';
import type { LevelInfo } from '../lessons/types';
import type { QuizVariant } from '../practice/quiz';
import { findTune } from '../music/exercises';
import { SONGS } from '../music/tune';
import { actionFor, topStruggles, type Struggle } from '../ui/screens/tonight';
import { localDateStr, type AppData, type Session } from './schema';

const DAY = 86_400_000;
/** Cửa sổ "gần đây" cho độ chính xác (giống "Việc cần làm tối nay"). */
export const RECENT_DAYS = 14;
/** Số tuần lịch trên biểu đồ ngày tập. */
export const CHART_WEEKS = 8;
/** Mục tiêu chăm chỉ: 4–5 ngày/tuần (§1). */
export const TARGET_DAYS = 4;

export type SkillKind = 'reading' | 'ear' | 'rhythm';

export interface Accuracy {
  correct: number;
  total: number;
  /** % đúng (0–100), null = chưa có câu nào */
  pct: number | null;
}

export interface SkillAccuracy {
  /** RECENT_DAYS ngày gần nhất */
  recent: Accuracy;
  /** RECENT_DAYS ngày trước đó (để so xu hướng) */
  before: Accuracy;
  /** Từ đầu tới nay */
  all: Accuracy;
  /** Xu hướng so với 2 tuần trước (cần ≥ 5 câu mỗi bên); null = chưa đủ dữ liệu */
  trend: 'up' | 'down' | 'flat' | null;
}

export interface WeekBar {
  /** Thứ 2 đầu tuần (YYYY-MM-DD) */
  monday: string;
  /** Nhãn ngắn "dd/mm" */
  label: string;
  days: number;
  minutes: number;
}

export interface ReportSong {
  id: string;
  title: string;
  /** Bài Việt Nam (dân ca / lời Việt / nhạc sĩ VN) */
  /** Bài VIỆT NAM thật (dân ca / nhạc sĩ Việt) — không tính giai điệu nước ngoài quen hát lời Việt */
  vn: boolean;
  /** Còn "tươi" (chơi lại trong 3 tuần qua) */
  fresh: boolean;
}

export interface ProgressReport {
  name: string;
  /** Ngày lập báo cáo (YYYY-MM-DD) */
  date: string;
  /** Khoảng thời gian: buổi đầu tiên (hoặc ngày tạo hồ sơ) → hôm nay */
  from: string;
  to: string;
  week: number;
  weekTitle: string;
  island: string;
  islandEmoji: string;
  level: LevelInfo;
  levelCount: number;
  maxWeek: number;
  /** Số đảo (tuần) đã qua — cùng quy tắc bản đồ: mọi tuần < tuần hiện tại + tuần hiện tại nếu đã xong */
  weeksPassed: number;
  currentDone: boolean;
  daysPractised: number;
  totalMinutes: number;
  sessions: number;
  /** CHART_WEEKS tuần lịch gần nhất, cũ → mới (tuần cuối = tuần này) */
  weekly: WeekBar[];
  /** Trung bình ngày tập / tuần trong 4 tuần gần nhất (không tính tuần đang dở nếu chưa hết) */
  avgDays4: number;
  songs: ReportSong[];
  stickers: { earned: number; total: number };
  skills: {
    reading: SkillAccuracy;
    ear: SkillAccuracy;
    rhythm: SkillAccuracy;
    /** Bài HAI TAY chơi trọn cả hai tay và đạt; available = số bài hai tay đã mở */
    handsTogether: { songs: number; available: number };
    /** Tốc độ nhanh nhất chơi trọn bài theo nhịp và đạt (nốt đen/phút); 0 = chưa có */
    maxBpm: number;
    dynamics: { loudSoft: boolean; stacLeg: boolean; rounds: number };
    compositions: number;
  };
  struggles: Struggle[];
  /** 1–2 câu điểm mạnh (luôn có ít nhất một câu tích cực) */
  strengths: string[];
  /** 1 câu bước tiếp theo */
  nextSteps: string[];
}

/* ---------------- Ngày / tuần ---------------- */

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** "2026-10-06" → "06/10/2026" */
export function viDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** 437 → "7 giờ 17 phút"; 45 → "45 phút" */
export function minutesText(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} phút`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** Ngày có học: suy ra từ progress.practiceDays (ProgressStore.recomputePracticeDays — buổi có phút / có tự chấm). */
function practiceDays(d: Readonly<AppData>): Record<string, { minutes: number }> {
  const pd = d.progress.practiceDays ?? {};
  const hpd = hist(d).practiceDays;
  if (Object.keys(pd).length || (!d.sessions.length && !Object.keys(hpd).length)) return pd;
  // Dữ liệu chưa tính practiceDays → tính từ sessions (+ phần đã gộp)
  const out: Record<string, { minutes: number }> = {};
  for (const [date, [minutes]] of Object.entries(hpd)) out[date] = { minutes };
  for (const s of d.sessions) {
    if (s.minutes === 0 && !s.selfRating) continue;
    (out[s.date] ??= { minutes: 0 }).minutes += s.minutes;
  }
  return out;
}

export function weeklyBars(d: Readonly<AppData>, now: Date, weeks = CHART_WEEKS): WeekBar[] {
  const pd = practiceDays(d);
  const thisMonday = mondayOf(now);
  const bars: WeekBar[] = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const mon = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * k);
    const end = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
    const a = localDateStr(mon);
    const b = localDateStr(end);
    let days = 0;
    let minutes = 0;
    for (const [date, v] of Object.entries(pd)) {
      if (date >= a && date < b) {
        days++;
        minutes += v.minutes;
      }
    }
    bars.push({ monday: a, label: `${a.slice(8, 10)}/${a.slice(5, 7)}`, days, minutes });
  }
  return bars;
}

/* ---------------- Trò chơi app chấm: xếp loại kỹ năng ---------------- */

const isPitch = (s: string) => /^[A-G](#|b)?-?\d$/.test(s);
const EAR_CODES = new Set(['up', 'down', 'step', 'skip', 'major', 'minor']);
const INTERVAL_RE = /^(same|(step|skip|4th|5th)-(up|down))$/;
const EAR_PITCH: ReadonlySet<QuizVariant> = new Set(['identify']);
const READ_PITCH: ReadonlySet<QuizVariant> = new Set(['read', 'landmark']);

/** Các kiểu trò có thể xuất hiện trong buổi `s` (trò trong bài + khởi động tuần này / tuần trước). */
export function sessionQuizVariants(s: Pick<Session, 'lessonId'>): Set<QuizVariant> {
  const out = new Set<QuizVariant>();
  const m = /^w(\d+)-/.exec(s.lessonId);
  const week = m ? Number(m[1]) : 0;
  const lesson = findLesson(s.lessonId);
  for (const a of lesson?.activities ?? []) if (a.kind === 'quiz') out.add(a.quiz.variant);
  if (/^w\d+-daily$/.test(s.lessonId)) {
    out.add('identify');
    out.add('majorminor');
  }
  if (week >= 1 && week <= MAX_WEEK) {
    const w = weekPlan(week).warmup;
    if (w) out.add(w.variant);
    if (week > 1) {
      const p = weekPlan(week - 1).warmup;
      if (p) out.add(p.variant);
    }
  }
  return out;
}

/** Kỹ năng của một câu trả lời app chấm (null = không xếp được). */
export function classifyAppAssessment(expected: string, variants: ReadonlySet<QuizVariant>): 'reading' | 'ear' | null {
  if (EAR_CODES.has(expected)) return 'ear';
  if (INTERVAL_RE.test(expected)) return 'reading';
  if (!isPitch(expected)) return null;
  const ear = [...variants].some((v) => EAR_PITCH.has(v));
  const read = [...variants].some((v) => READ_PITCH.has(v));
  if (ear && !read) return 'ear';
  if (read && !ear) return 'reading';
  return null;
}

const acc = (correct: number, total: number): Accuracy => ({
  correct,
  total,
  pct: total ? Math.round((correct / total) * 100) : null,
});

/** Các câu trả lời (theo kỹ năng) của MỘT buổi — dùng chung cho báo cáo và gộp lịch sử (compaction.ts). */
export function sessionAnswers(s: Session): Array<{ skill: SkillKind; ok: boolean }> {
  const out: Array<{ skill: SkillKind; ok: boolean }> = [];
  if (s.appAssessments.length) {
    const v = sessionQuizVariants(s);
    for (const a of s.appAssessments) {
      const k = classifyAppAssessment(a.expected, v);
      if (k) out.push({ skill: k, ok: a.correct });
    }
  }
  for (const a of s.parentAssessments) {
    if (a.note.startsWith('rhythm:')) out.push({ skill: 'rhythm', ok: a.result === 'correct' });
  }
  return out;
}

/** Mỗi câu trả lời (theo kỹ năng) kèm ngày buổi học — các buổi còn giữ. */
function answers(d: Readonly<AppData>): Array<{ skill: SkillKind; ok: boolean; date: string }> {
  const out: Array<{ skill: SkillKind; ok: boolean; date: string }> = [];
  for (const s of d.sessions) for (const a of sessionAnswers(s)) out.push({ ...a, date: s.date });
  return out;
}

/**
 * Độ chính xác theo kỹ năng. `recent` / `before` (2 × RECENT_DAYS ngày) đọc từ buổi còn giữ (luôn giữ ≥ 8 tuần gần nhất);
 * `all` = tổng hợp đã gộp (history.skills) + buổi còn giữ.
 */
export function skillAccuracy(d: Readonly<AppData>, skill: SkillKind, now: Date, days = RECENT_DAYS): SkillAccuracy {
  const since = localDateStr(new Date(now.getTime() - days * DAY));
  const since2 = localDateStr(new Date(now.getTime() - 2 * days * DAY));
  const list = answers(d).filter((x) => x.skill === skill);
  const count = (xs: typeof list) => acc(xs.filter((x) => x.ok).length, xs.length);
  const recent = count(list.filter((x) => x.date >= since));
  const before = count(list.filter((x) => x.date >= since2 && x.date < since));
  let trend: SkillAccuracy['trend'] = null;
  if (recent.total >= 5 && before.total >= 5) {
    const diff = (recent.pct ?? 0) - (before.pct ?? 0);
    trend = diff >= 5 ? 'up' : diff <= -5 ? 'down' : 'flat';
  }
  const [hc, ht] = hist(d).skills[skill];
  return { recent, before, all: acc(hc + list.filter((x) => x.ok).length, ht + list.length), trend };
}

/* ---------------- Bài hát ---------------- */

function songsReport(d: Readonly<AppData>, now: Date): ReportSong[] {
  return masteredSongs(d).map((id) => {
    const t = findTune(id);
    return { id, title: t?.titleVi ?? id, vn: t?.vn === 'folk' || t?.vn === 'composed', fresh: songFresh(id, d, now) };
  });
}

function handsTogether(d: Readonly<AppData>): { songs: number; available: number } {
  const twoHand = SONGS.filter((t) => t.hand === 'BOTH' || !!t.lh);
  const ids = new Set(twoHand.map((t) => t.id));
  // songStats: h = từng chơi trọn, đủ tay, đạt (tổng hợp đã gộp + buổi còn giữ)
  const stats = songStats(d);
  const played = [...ids].filter((id) => stats[id]?.h).length;
  const week = d.progress.currentWeek;
  return { songs: played, available: twoHand.filter((t) => (t.week ?? 1) <= week).length };
}

function maxBpm(d: Readonly<AppData>): number {
  // b = tốc độ nhanh nhất chơi trọn theo nhịp, đủ tay, đạt (không tính đọc nhạc ngẫu nhiên)
  let m = 0;
  for (const a of Object.values(songStats(d))) if ((a.b ?? 0) > m) m = a.b ?? 0;
  return m;
}

function dynamicsRounds(d: Readonly<AppData>): number {
  let n = hist(d).dynamicsRounds;
  for (const s of d.sessions) for (const a of s.parentAssessments) if (a.note.startsWith('dyn:') && a.result === 'correct') n++;
  return n;
}

/* ---------------- Câu nhận xét ---------------- */

const SKILL_NAME: Record<SkillKind, string> = { reading: 'Đọc nốt', ear: 'Tai nghe', rhythm: 'Vỗ nhịp' };

/** Câu nhận xét một dòng kỹ năng, lời thường: "Đọc nốt: 86% đúng trong 2 tuần gần đây". */
export function skillSentence(skill: SkillKind, a: SkillAccuracy): string {
  const name = SKILL_NAME[skill];
  const trend = a.trend === 'up' ? ' — tiến bộ so với 2 tuần trước' : a.trend === 'down' ? ' — hơi giảm so với 2 tuần trước' : '';
  if (a.recent.total) return `${name}: ${a.recent.pct}% đúng trong 2 tuần gần đây (${a.recent.correct}/${a.recent.total} câu)${trend}`;
  if (a.all.total) return `${name}: ${a.all.pct}% đúng từ đầu tới nay (${a.all.correct}/${a.all.total} câu) — 2 tuần nay chưa chơi`;
  return `${name}: chưa có dữ liệu`;
}

/** Bỏ "Tối nay…:" của gợi ý tối nay → câu gợi ý chung cho báo cáo. */
function generalAction(text: string): string {
  return text.replace(/^Tối nay(?: \d+ phút)?:\s*/, '').replace(/^Tối nay /, '');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Điểm mạnh (TÍCH CỰC TRƯỚC) + bước tiếp theo — chỗ khó lấy từ topStruggles (cùng logic "Việc cần làm tối nay"),
 * gợi ý từ actionFor.
 */
export function narrative(
  r: Omit<ProgressReport, 'strengths' | 'nextSteps'>,
  daysThisWeekCount: number,
): { strengths: string[]; nextSteps: string[] } {
  const strengths: string[] = [];
  const name = r.name || 'Bé';
  // 1) Chăm chỉ
  if (r.avgDays4 >= TARGET_DAYS) strengths.push(`${name} luyện đàn rất đều — trung bình ${fmt1(r.avgDays4)} ngày mỗi tuần trong 4 tuần qua.`);
  // 2) Kỹ năng tốt nhất (≥ 80% với ≥ 8 câu gần đây)
  const best = (['reading', 'ear', 'rhythm'] as const)
    .map((k) => ({ k, a: r.skills[k].recent }))
    .filter((x) => x.a.total >= 8 && (x.a.pct ?? 0) >= 80)
    .sort((a, b) => (b.a.pct ?? 0) - (a.a.pct ?? 0))[0];
  if (best) {
    const what = { reading: 'đọc nốt', ear: 'nghe nhạc', rhythm: 'giữ nhịp' }[best.k];
    strengths.push(`${cap(what)} rất chắc: ${best.a.pct}% đúng trong 2 tuần gần đây.`);
  }
  // 3) Bài đã thuộc
  if (strengths.length < 2 && r.songs.length) {
    const vn = r.songs.filter((s) => s.vn).length;
    strengths.push(`Đã thuộc ${r.songs.length} bài${vn ? `, trong đó có ${vn} bài Việt Nam` : ''}.`);
  }
  if (strengths.length < 2 && r.skills.maxBpm >= 60) strengths.push(`Đã chơi trọn bài theo nhịp ở tốc độ ${r.skills.maxBpm}.`);
  if (strengths.length < 2 && r.weeksPassed > 0) strengths.push(`Đã đi qua ${r.weeksPassed} hòn đảo trên hành trình âm nhạc.`);
  if (!strengths.length) strengths.push(`${name} đã bắt đầu hành trình học đàn — mỗi buổi ngắn đều là một bước tiến.`);

  const top = r.struggles[0];
  const nextSteps: string[] = [];
  const act = cap(generalAction(actionFor(top, daysThisWeekCount)));
  if (top) nextSteps.push(`Cần tập thêm: ${top.label} (vấp ${top.misses} lần trong 2 tuần). Gợi ý: ${act}`);
  else if (r.avgDays4 < TARGET_DAYS && r.sessions > 0) nextSteps.push(`Bước tiếp theo: tập đều hơn — mục tiêu ${TARGET_DAYS}–5 ngày mỗi tuần, mỗi buổi 10–15 phút.`);
  else nextSteps.push(`Bước tiếp theo: ${act}`);
  return { strengths: strengths.slice(0, 2), nextSteps };
}

const fmt1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');

/* ---------------- Gom báo cáo ---------------- */

export function buildReport(d: Readonly<AppData>, now: Date): ProgressReport {
  const week = d.progress.currentWeek;
  const plan = weekPlan(week);
  const pd = practiceDays(d);
  const dates = Object.keys(pd).sort();
  const firstSession = firstSessionDate(d); // gồm cả buổi đã gộp
  const to = localDateStr(now);
  const from = firstSession ?? dates[0] ?? d.learner.createdAt ?? to;
  const currentDone = weekComplete(week, d);
  const weekly = weeklyBars(d, now);
  // 4 tuần gần nhất ĐÃ HẾT (bỏ tuần này đang dở)
  const last4 = weekly.slice(-5, -1);
  const avgDays4 = last4.length ? last4.reduce((s, w) => s + w.days, 0) / last4.length : 0;
  const stickers = allStickers(d);
  const thisMonday = localDateStr(mondayOf(now));
  const daysThisWeekCount = new Set(d.sessions.filter((s) => s.completed && s.date >= thisMonday).map((s) => s.date)).size;

  const base: Omit<ProgressReport, 'strengths' | 'nextSteps'> = {
    name: d.learner.name.trim(),
    date: to,
    from: from > to ? to : from,
    to,
    week,
    weekTitle: plan.title,
    island: plan.island,
    islandEmoji: plan.islandEmoji,
    level: levelOf(week),
    levelCount: LEVELS.length,
    maxWeek: MAX_WEEK,
    weeksPassed: Math.min(MAX_WEEK, week - 1 + (currentDone ? 1 : 0)),
    currentDone,
    daysPractised: dates.length,
    totalMinutes: Object.values(pd).reduce((s, v) => s + v.minutes, 0),
    sessions: hist(d).counted + d.sessions.filter((s) => s.minutes > 0 || s.completed).length,
    weekly,
    avgDays4,
    songs: songsReport(d, now),
    stickers: { earned: stickers.filter((s) => s.earned).length, total: stickers.length },
    skills: {
      reading: skillAccuracy(d, 'reading', now),
      ear: skillAccuracy(d, 'ear', now),
      rhythm: skillAccuracy(d, 'rhythm', now),
      handsTogether: handsTogether(d),
      maxBpm: maxBpm(d),
      dynamics: { loudSoft: dynamicsDone(d, 'loud-soft'), stacLeg: dynamicsDone(d, 'stac-leg'), rounds: dynamicsRounds(d) },
      compositions: d.compositions?.length ?? 0,
    },
    struggles: topStruggles(d, now),
  };
  return { ...base, ...narrative(base, daysThisWeekCount) };
}
