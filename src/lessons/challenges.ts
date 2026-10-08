import { SONGS, findSong } from '../music/tune';
import type { AppData, ChallengeRecord, GameBase, Session, SongRun } from '../progress/schema';
import { bumpDataRev, hist, memo, mondayKey, weekOfLessonId } from '../progress/history';
import { EAR_NEED, EAR_WINDOW, masteredSongs, runIsEvidence, weekPlan } from './lessonEngine';
import { hashStr } from './bonusStickers';

/**
 * 🏆 THỬ THÁCH TUẦN (OWNER duyệt 2026-10-07) — hàm THUẦN (test: tests/challenges.test.ts).
 *
 * - Mỗi TUẦN LỊCH (thứ 2 → chủ nhật, mondayKey) bé có MỘT thử thách, chọn CỐ ĐỊNH từ (ngày thứ 2 + tuần giáo trình)
 *   trong các thử thách hợp với tuần giáo trình. "Hợp" được xét trên dữ liệu TRƯỚC thứ 2 (bài đã thuộc…) → không đổi
 *   giữa tuần khi bé thuộc thêm bài. Tuần giáo trình của một tuần lịch = tuần nhỏ nhất trong các buổi của tuần lịch đó
 *   (chưa có buổi nào → tuần hiện tại) → bé qua đảo giữa tuần thì thử thách vẫn giữ nguyên.
 * - Hoàn thành được suy ra từ các buổi CỦA TUẦN LỊCH ĐÓ (luôn còn nguyên: gộp lịch sử chỉ đụng buổi > 56 ngày).
 *   Tuần đã xong được LƯU (progress.challenges — chỉ thêm, không bao giờ xóa) ở cuối buổi và trước khi gộp lịch sử
 *   → cúp không bao giờ mất.
 * - Thưởng: mỗi tuần xong = một sticker "Cúp tuần" (stickers.ts, kind 'challenge').
 */

export type ChallengeId =
  | 'faster'
  | 'perfect'
  | 'days4'
  | 'review3'
  | 'vn'
  | 'ear'
  | 'record'
  // (+ 2026-10-08) 6 thử thách "ngoài đời" — bố mẹ xác nhận (xem SELF_CHALLENGES)
  | 'audience'
  | 'compose'
  | 'findC'
  | 'softSong'
  | 'singPlay'
  | 'teach';

/** Việc nút "Làm ngay" mở ra. */
export type ChallengeAction =
  | { kind: 'song'; songId: string; bpm: number }
  | { kind: 'library'; filter?: 'vn' }
  | { kind: 'lesson' }
  /** 🎮 Trò chơi (không có màn trò chơi → Học tiếp) */
  | { kind: 'games' }
  /** (+ 2026-10-08) 🎹 Đàn tự do */
  | { kind: 'freeplay' }
  /** (+ 2026-10-08) Làm trên đàn thật, không cần mở màn nào — chỉ có nút bố mẹ xác nhận */
  | { kind: 'none' };

export interface WeeklyChallenge {
  id: ChallengeId;
  icon: string;
  /** Tên ngắn cho bé */
  title: string;
  /** Một dòng mô tả */
  desc: string;
  /** Cách làm (màn chi tiết) */
  howTo: string;
  /** Thứ 2 của tuần lịch */
  monday: string;
  /** Tuần giáo trình dùng để chọn */
  curWeek: number;
  /** Số bước cần (chấm ●○) */
  need: number;
  /** Số bước đã làm (≤ need) */
  have: number;
  /** 0..1 */
  progress: number;
  /** Chữ tiến độ, vd "2/4 ngày" */
  text: string;
  done: boolean;
  action: ChallengeAction;
  /** (+ 2026-10-08) Thử thách "ngoài đời": hoàn thành khi bố mẹ bấm xác nhận (ProgressStore.confirmChallenge) */
  selfReport: boolean;
}

/** Thứ tự CỐ ĐỊNH của kho thử thách (chỉ thêm vào cuối — thứ tự quyết định thử thách của từng tuần). */
export const CHALLENGE_ORDER: readonly ChallengeId[] = [
  'days4',
  'faster',
  'perfect',
  'review3',
  'vn',
  'ear',
  'record',
  // (+ 2026-10-08) chỉ vào kho từ tuần lịch NEW_CHALLENGES_FROM — tuần cũ giữ nguyên thử thách
  'audience',
  'compose',
  'findC',
  'softSong',
  'singPlay',
  'teach',
];

/**
 * (+ 2026-10-08) Thứ 2 đầu tiên có 6 thử thách mới trong kho. Tuần lịch TRƯỚC ngày này (kể cả tuần đang học khi phát hành)
 * chọn từ đúng kho cũ → thử thách của mọi tuần đã qua không đổi (test: tests/longTermUnlocks.test.ts).
 */
export const NEW_CHALLENGES_FROM = '2026-10-12';

/** (+ 2026-10-08) Thử thách bé làm trên đàn thật / với gia đình — app không tự chấm được, bố mẹ bấm xác nhận. */
export const SELF_CHALLENGES: ReadonlySet<ChallengeId> = new Set(['audience', 'compose', 'findC', 'softSong', 'singPlay', 'teach']);

export const CHALLENGE_INFO: Readonly<Record<ChallengeId, { icon: string; title: string }>> = {
  faster: { icon: '🐇', title: 'Nhanh hơn' },
  perfect: { icon: '🎯', title: 'Không sai nốt' },
  days4: { icon: '📅', title: 'Bốn ngày chăm' },
  review3: { icon: '🔁', title: 'Ôn 3 bài cũ' },
  vn: { icon: '🇻🇳', title: 'Bài quê hương' },
  ear: { icon: '👂', title: 'Tai thính' },
  record: { icon: '🎮', title: 'Phá kỷ lục' },
  audience: { icon: '👨‍👩‍👦', title: 'Đàn cho 2 người nghe' },
  compose: { icon: '✍️', title: 'Sáng tác 1 câu' },
  findC: { icon: '🙈', title: 'Nhắm mắt tìm Đô' },
  softSong: { icon: '🤫', title: 'Đàn thật nhỏ cả bài' },
  singPlay: { icon: '🎤', title: 'Hát rồi đàn' },
  teach: { icon: '🧑‍🏫', title: 'Dạy bố mẹ 1 bài' },
};

/** Thang tốc độ của màn bài hát (songShared.TEMPOS) — chép lại để module thuần không phụ thuộc UI. */
const TEMPO_STEPS = [40, 50, 60, 72];
/** "Nhanh hơn": tối thiểu ngần này nhịp/phút trên tốc độ tiêu chí. */
export const FASTER_MIN_STEP = 10;
export const DAYS_NEED = 4;
export const REVIEW_NEED = 3;
export const EAR_TIMES_NEED = 2;

/**
 * Bài CHÍNH theo nhịp của tuần giáo trình (cùng bài với tiêu chí tuần — lessonEngine.criterionDays) và tốc độ tối thiểu
 * của tiêu chí (0 = không đòi tốc độ). Tuần không có bài chính theo nhịp → "Nhanh hơn" dùng bài đã thuộc mới nhất.
 */
export const MAIN_TEMPO_SONG: Readonly<Record<number, { songId: string; minBpm: number }>> = {
  5: { songId: 'frog_hop', minBpm: 0 },
  6: { songId: 'ode_to_joy_easy', minBpm: 60 },
  8: { songId: 'ode_to_joy_easy', minBpm: 0 },
  9: { songId: 'inh_la_oi', minBpm: 0 },
  12: { songId: 'ode_to_joy_both', minBpm: 0 },
  13: { songId: 'bell_tower', minBpm: 0 },
  14: { songId: 'ode_to_joy_g', minBpm: 60 },
  15: { songId: 'waltz_cat', minBpm: 0 },
  16: { songId: 'ode_to_joy_d', minBpm: 60 },
  17: { songId: 'ode_to_joy_original', minBpm: 60 },
  18: { songId: 'ly_cay_da', minBpm: 0 },
  19: { songId: 'bac_kim_thang', minBpm: 0 },
  22: { songId: 'ode_to_joy_chords', minBpm: 0 },
  24: { songId: 'silent_night', minBpm: 50 },
  28: { songId: 'saints_both', minBpm: 0 },
  29: { songId: 'minuet_g', minBpm: 50 },
  30: { songId: 'fur_elise', minBpm: 50 },
};

/** Tốc độ thử thách: nấc tốc độ đầu tiên ≥ (tốc độ tiêu chí + 10). Không đòi tốc độ → lấy tốc độ bài (tối đa 60). */
export function fasterTarget(songId: string, minBpm: number): number {
  const base = minBpm > 0 ? minBpm : Math.min(findSong(songId)?.bpm ?? 60, 60);
  return TEMPO_STEPS.find((t) => t >= base + FASTER_MIN_STEP) ?? base + FASTER_MIN_STEP;
}

/* ---------------- Ngày ---------------- */

const parse = (d: string) => d.split('-').map(Number) as [number, number, number];
/** Ngày cuối (chủ nhật) của tuần bắt đầu `monday`. */
export function sundayOf(monday: string): string {
  const [y, m, d] = parse(monday);
  const x = new Date(y, m - 1, d + 6);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
/** Thứ 2 của tuần trước. */
export function prevMonday(monday: string): string {
  const [y, m, d] = parse(monday);
  const x = new Date(y, m - 1, d - 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
/** Số thứ tự tuần (UTC, không lệch giờ mùa hè) — để xoay vòng kho thử thách. */
const weekIndex = (monday: string) => {
  const [y, m, d] = parse(monday);
  return Math.round(Date.UTC(y, m - 1, d) / (7 * 86_400_000));
};

const inWeek = (s: Session, monday: string, sunday: string) => s.date >= monday && s.date <= sunday;

/* ---------------- Trò chơi (🎮 Trò chơi — data.games: kỷ lục từng trò) ---------------- */

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

const dayStartMs = (date: string) => {
  const [y, m, d] = parse(date);
  return new Date(y, m - 1, d).getTime();
};

/** Kỷ lục hiện tại từng trò (đọc MỀM data.games — không có / hỏng → rỗng): mã trò → [kỷ lục, lần chơi gần nhất ms]. */
export function gameBests(data: Readonly<AppData>): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const g = (data as { games?: unknown }).games;
  if (!isObj(g)) return out;
  for (const [k, v] of Object.entries(g)) {
    if (!isObj(v)) continue;
    const best = num(v.best);
    if (best !== null) out.set(k, [best, num(v.lastAt) ?? 0]);
  }
  return out;
}

/**
 * Mốc kỷ lục ĐẦU TUẦN để biết bé "phá kỷ lục" (data.games chỉ giữ kỷ lục, không giữ từng lượt): progress.gameBase
 * được chụp MỘT lần mỗi tuần (recordChallenges — lần đầu về màn chính / xong buổi trong tuần). Chưa chụp (vd dữ liệu
 * dựng tay) → ước bằng các trò chưa chơi lại từ thứ 2 (lastAt < thứ 2) — cùng tập với lúc chụp.
 */
function gameBaseOf(data: Readonly<AppData>, monday: string): Map<string, number> {
  const snap = storedGameBase(data);
  if (snap && snap.monday === monday) return new Map(Object.entries(snap.bests));
  const t0 = dayStartMs(monday);
  const out = new Map<string, number>();
  for (const [k, [best, at]] of gameBests(data)) if (at < t0) out.set(k, best);
  return out;
}

/** Đọc mềm progress.gameBase. */
export function storedGameBase(data: Readonly<AppData>): GameBase | null {
  const b = (data.progress as { gameBase?: unknown }).gameBase;
  if (!isObj(b) || typeof b.monday !== 'string' || !isObj(b.bests)) return null;
  const bests: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.bests)) if (num(v) !== null) bests[k] = v as number;
  return { monday: b.monday, bests };
}

/* ---------------- Chọn thử thách ---------------- */

/** Tuần giáo trình của tuần lịch `monday`: tuần nhỏ nhất trong các buổi của tuần đó; chưa có buổi → tuần hiện tại. */
export function curriculumWeekOf(data: Readonly<AppData>, monday: string): number {
  const sunday = sundayOf(monday);
  let w = Infinity;
  for (const s of data.sessions) {
    if (!inWeek(s, monday, sunday)) continue;
    const k = weekOfLessonId(s.lessonId);
    if (k !== null && k < w) w = k;
  }
  return Number.isFinite(w) ? w : data.progress.currentWeek;
}

/** Dữ liệu "trước thứ 2": tổng hợp đã gộp (luôn cũ hơn) + các buổi trước `monday`. */
function before(data: Readonly<AppData>, monday: string): AppData {
  return { ...data, sessions: data.sessions.filter((s) => s.date < monday) } as AppData;
}

interface Pick {
  id: ChallengeId;
  /** faster: bài + tốc độ */
  songId?: string;
  bpm?: number;
  /** Bài đã thuộc trước tuần (perfect / review3) */
  mastered?: readonly string[];
}

/** Bài "Nhanh hơn" cho tuần giáo trình `week`: bài chính theo nhịp; không có → bài đã thuộc của tuần gần nhất. */
function fasterSong(week: number, mastered: readonly string[]): { songId: string; bpm: number } | null {
  const main = MAIN_TEMPO_SONG[week];
  if (main && findSong(main.songId)) return { songId: main.songId, bpm: fasterTarget(main.songId, main.minBpm) };
  const cands = SONGS.filter((t) => mastered.includes(t.id) && (t.week ?? 1) <= week && !t.id.startsWith('scale'));
  const t = cands[cands.length - 1]; // SONGS xếp theo tuần → bài mới nhất
  if (!t) return null;
  const m = Object.values(MAIN_TEMPO_SONG).find((x) => x.songId === t.id);
  return { songId: t.id, bpm: fasterTarget(t.id, m?.minBpm ?? 0) };
}

/** Các thử thách hợp với tuần lịch `monday` (theo thứ tự CHALLENGE_ORDER). */
export function eligibleChallenges(data: Readonly<AppData>, monday: string, curWeek = curriculumWeekOf(data, monday)): Pick[] {
  const base = before(data, monday);
  const mastered = masteredSongs(base);
  const out: Pick[] = [];
  for (const id of CHALLENGE_ORDER) {
    switch (id) {
      case 'days4':
        out.push({ id });
        break;
      case 'faster': {
        if (curWeek < 5) break;
        const f = fasterSong(curWeek, mastered);
        if (f) out.push({ id, ...f });
        break;
      }
      case 'perfect':
        if (mastered.length >= 1) out.push({ id, mastered });
        break;
      case 'review3':
        if (mastered.length >= REVIEW_NEED) out.push({ id, mastered });
        break;
      case 'vn':
        if (SONGS.some((t) => homeland(t.id) && (t.week ?? 1) <= curWeek)) out.push({ id });
        break;
      case 'ear':
        if (curWeek >= 3 && weekPlan(curWeek).warmup) out.push({ id });
        break;
      case 'record':
        if (gameBaseOf(data, monday).size > 0) out.push({ id });
        break;
      default: {
        // (+ 2026-10-08) thử thách mới: chỉ từ tuần lịch NEW_CHALLENGES_FROM (tuần cũ giữ đúng kho cũ)
        if (monday < NEW_CHALLENGES_FROM) break;
        if (id === 'findC' || id === 'compose') {
          if (curWeek >= (id === 'compose' ? 3 : 2)) out.push({ id });
        } else if (id === 'softSong') {
          if (curWeek >= 6 && mastered.length >= 1) out.push({ id });
        } else if (mastered.length >= 1) out.push({ id }); // audience / singPlay / teach: cần một bài đã thuộc
        break;
      }
    }
  }
  return out;
}

/**
 * Thử thách của tuần lịch `monday` — CỐ ĐỊNH theo (thứ 2 + tuần giáo trình): xoay vòng kho hợp lệ theo số thứ tự tuần
 * (hai tuần liền nhau với cùng kho luôn khác nhau), lệch thêm theo tuần giáo trình.
 */
function pickFor(data: Readonly<AppData>, monday: string): { pick: Pick; curWeek: number } {
  const curWeek = curriculumWeekOf(data, monday);
  const pool = eligibleChallenges(data, monday, curWeek);
  const i = (weekIndex(monday) + (hashStr(`w${curWeek}`) % 7)) % pool.length;
  return { pick: pool[i], curWeek };
}

/* ---------------- Tiến độ ---------------- */

/** "Bài quê hương": dân ca Việt Nam hoặc ca khúc nhạc sĩ Việt Nam (không tính giai điệu nước ngoài có lời Việt). */
const homeland = (songId: string) => {
  const v = findSong(songId)?.vn;
  return v === 'folk' || v === 'composed';
};

type Run = SongRun;
const wholeTogether = (r: Run) => !r.phrase && !r.hand && r.passed;
/** Lượt trọn bài không sai nốt: micro đúng hết mọi nốt, hoặc phiếu 3 ý của bố mẹ đều ✓. */
export const perfectRun = (r: Run): boolean =>
  wholeTogether(r) &&
  (r.source === 'mic' ? r.total > 0 && r.hits >= r.total : !!r.checklist && r.checklist.notes && r.checklist.beat && r.checklist.fingers);

/** Buổi có EAR_WINDOW (6) câu liên tiếp (đoán / đọc) đúng ≥ EAR_NEED (5) — như tiêu chí APP. */
function earPass(s: Session): boolean {
  const a = s.appAssessments;
  for (let i = 0; i + EAR_WINDOW <= a.length; i++) if (a.slice(i, i + EAR_WINDOW).filter((x) => x.correct).length >= EAR_NEED) return true;
  return false;
}

function measure(data: Readonly<AppData>, monday: string, pick: Pick): { have: number; need: number } {
  const sunday = sundayOf(monday);
  const week = data.sessions.filter((s) => inWeek(s, monday, sunday));
  const runs = week.flatMap((s) => s.songRuns);
  switch (pick.id) {
    case 'days4':
      return { have: new Set(week.filter((s) => s.completed).map((s) => s.date)).size, need: DAYS_NEED };
    case 'faster':
      return {
        have: runs.some((r) => r.songId === pick.songId && r.mode === 'tempo' && wholeTogether(r) && r.bpm >= (pick.bpm ?? 0) && runIsEvidence(r)) ? 1 : 0,
        need: 1,
      };
    case 'perfect':
      return { have: runs.some((r) => pick.mastered!.includes(r.songId) && perfectRun(r)) ? 1 : 0, need: 1 };
    case 'review3':
      return { have: new Set(runs.filter((r) => pick.mastered!.includes(r.songId) && wholeTogether(r)).map((r) => r.songId)).size, need: REVIEW_NEED };
    case 'vn':
      return { have: runs.some((r) => wholeTogether(r) && homeland(r.songId)) ? 1 : 0, need: 1 };
    case 'ear':
      return { have: week.filter(earPass).length, need: EAR_TIMES_NEED };
    case 'record': {
      const base = gameBaseOf(data, monday);
      const t0 = dayStartMs(monday);
      const t1 = dayStartMs(sundayOf(monday)) + 86_400_000;
      let beat = false;
      for (const [k, [best, at]] of gameBests(data)) {
        const b = base.get(k);
        if (b !== undefined && best > b && at >= t0 && at < t1) beat = true;
      }
      return { have: beat ? 1 : 0, need: 1 };
    }
    case 'compose': {
      // Bé lưu một bài sáng tác trong tuần (trò Sáng tác) → tự xong; không thì bố mẹ xác nhận
      const t0 = dayStartMs(monday);
      const t1 = dayStartMs(sunday) + 86_400_000;
      const made = (data.compositions ?? []).some((c) => c.createdAt >= t0 && c.createdAt < t1);
      return { have: made ? 1 : 0, need: 1 };
    }
    default:
      // Thử thách "ngoài đời": chỉ xong khi bố mẹ xác nhận (progress.challenges — challengeOfWeek đọc bản đã lưu)
      return { have: 0, need: 1 };
  }
}

/** Lời cho 6 thử thách "ngoài đời" (+ 2026-10-08). */
const SELF_TEXT: Record<'audience' | 'compose' | 'findC' | 'softSong' | 'singPlay' | 'teach', { desc: string; howTo: string; action: ChallengeAction }> = {
  audience: {
    desc: 'Đàn một bài con thích cho 2 người nghe',
    howTo: 'Mời 2 người (bố, mẹ, ông bà, anh chị…) ngồi nghe. Con giới thiệu tên bài, cúi chào, đàn trọn bài rồi cúi chào lần nữa nhé!',
    action: { kind: 'library' },
  },
  compose: {
    desc: 'Tự nghĩ một câu nhạc ngắn và đàn cho bố mẹ nghe',
    howTo: 'Dùng 5 nốt Đô Rê Mi Fa Sol, nghĩ một câu nhạc 4 ô nhịp (kết thúc ở nốt Đô nghe sẽ "xong"). Đặt tên cho câu nhạc rồi đàn cho bố mẹ nghe.',
    action: { kind: 'freeplay' },
  },
  findC: {
    desc: 'Nhắm mắt, dùng tay tìm nốt Đô trên đàn thật',
    howTo: 'Nhắm mắt, sờ nhóm 2 phím đen — phím trắng ngay bên trái nhóm đó là Đô! Bố mẹ đố con tìm Đô 3 lần ở 3 chỗ khác nhau.',
    action: { kind: 'none' },
  },
  softSong: {
    desc: 'Đàn trọn một bài thật nhỏ (p) mà vẫn đều',
    howTo: 'Chọn một bài con đã thuộc. Đàn thật nhỏ như sợ đánh thức em bé — ngón vẫn cong, nhịp vẫn đều từ đầu đến cuối.',
    action: { kind: 'library' },
  },
  singPlay: {
    desc: 'Hát một bài bằng tên nốt, rồi đàn bài đó',
    howTo: 'Chọn một bài con đã thuộc. Hát to tên nốt (Đô Rê Mi…) cả bài trước, rồi mới đàn. Hát đúng thì đàn sẽ dễ hơn!',
    action: { kind: 'library' },
  },
  teach: {
    desc: 'Làm thầy: dạy bố hoặc mẹ đàn một bài',
    howTo: 'Con chỉ cho bố mẹ ngồi đúng, đặt tay đúng ngón và đàn một bài con đã thuộc (hoặc một câu). Bố mẹ đàn được là con dạy giỏi!',
    action: { kind: 'library' },
  },
};

function describe(pick: Pick): { desc: string; howTo: string; action: ChallengeAction; unit: string } {
  switch (pick.id) {
    case 'days4':
      return {
        desc: `Học ${DAYS_NEED} ngày khác nhau trong tuần này`,
        howTo: `Mỗi ngày con học một buổi. Đủ ${DAYS_NEED} ngày trong tuần là được cúp — nghỉ ngày nào cũng không sao!`,
        action: { kind: 'lesson' },
        unit: 'ngày',
      };
    case 'faster': {
      const t = findSong(pick.songId!);
      const name = t?.titleVi ?? pick.songId!;
      return {
        desc: `Chơi trọn "${name}" ở tốc độ ${pick.bpm}`,
        howTo: `Mở bài "${name}", chọn Theo nhịp ở tốc độ 🐇 ${pick.bpm} và chơi trọn bài thật đều. Chậm mà chắc trước, rồi nhanh dần nhé!`,
        action: { kind: 'song', songId: pick.songId!, bpm: pick.bpm! },
        unit: 'lần',
      };
    }
    case 'perfect':
      return {
        desc: 'Chơi trọn một bài đã thuộc mà không sai nốt nào',
        howTo: 'Chọn một bài con đã thuộc. Micro nghe đúng hết các nốt — hoặc bố mẹ tích đủ 3 ý ✓ (đúng nốt, đều nhịp, đúng ngón).',
        action: { kind: 'library' },
        unit: 'lần',
      };
    case 'review3':
      return {
        desc: `Chơi lại ${REVIEW_NEED} bài cũ con đã thuộc`,
        howTo: `Vào Bài hát, chọn ${REVIEW_NEED} bài khác nhau con đã thuộc (có ★) và chơi trọn mỗi bài một lần.`,
        action: { kind: 'library' },
        unit: 'bài',
      };
    case 'vn':
      return {
        desc: 'Chơi trọn một bài dân ca / bài hát Việt Nam',
        howTo: 'Vào Bài hát → mục 🇻🇳 Bài Việt Nam, chọn một bài con thích và chơi trọn bài.',
        action: { kind: 'library', filter: 'vn' },
        unit: 'bài',
      };
    case 'ear':
      return {
        desc: `Trò chơi nghe nốt đúng 5/6 câu, ${EAR_TIMES_NEED} lần`,
        howTo: `Ở trò chơi nghe / đọc nốt, con trả lời đúng ít nhất 5 trong 6 câu. Làm được ${EAR_TIMES_NEED} lần trong tuần là xong!`,
        action: { kind: 'lesson' },
        unit: 'lần',
      };
    case 'record':
      return {
        desc: 'Phá kỷ lục của chính con ở một trò chơi',
        howTo: 'Vào 🎮 Trò chơi, chọn một trò và cố đạt điểm cao hơn kỷ lục cũ của con.',
        action: { kind: 'games' },
        unit: 'lần',
      };
    default:
      return { ...SELF_TEXT[pick.id], unit: 'lần' };
  }
}

/** Đọc mềm các tuần đã LƯU (progress.challenges) — bỏ qua bản ghi hỏng. */
export function storedChallenges(data: Readonly<AppData>): Map<string, ChallengeRecord> {
  const out = new Map<string, ChallengeRecord>();
  const c = (data.progress as { challenges?: unknown }).challenges;
  if (!isObj(c)) return out;
  for (const [k, v] of Object.entries(c)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(v) && typeof v.id === 'string') {
      out.set(k, { id: v.id, doneAt: num(v.doneAt) ?? 0 });
    }
  }
  return out;
}

/** Thử thách của tuần chứa ngày `today` ("YYYY-MM-DD") kèm tiến độ. */
export function weeklyChallenge(data: Readonly<AppData>, today: string): WeeklyChallenge {
  const monday = mondayKey(today);
  return memo(data, `challenge:${monday}`, () => challengeOfWeek(data, monday));
}

function challengeOfWeek(data: Readonly<AppData>, monday: string): WeeklyChallenge {
  const { pick, curWeek } = pickFor(data, monday);
  const stored = storedChallenges(data).get(monday);
  const m = measure(data, monday, pick);
  const done = !!stored || m.have >= m.need;
  const have = done ? m.need : Math.min(m.have, m.need);
  const d = describe(pick);
  const info = CHALLENGE_INFO[pick.id];
  return {
    id: pick.id,
    icon: info.icon,
    title: info.title,
    desc: d.desc,
    howTo: d.howTo,
    monday,
    curWeek,
    need: m.need,
    have,
    progress: have / m.need,
    text: done ? 'Xong!' : m.need === 1 ? 'chưa xong' : `${have}/${m.need} ${d.unit}`,
    done,
    action: d.action,
    selfReport: SELF_CHALLENGES.has(pick.id),
  };
}

/**
 * (+ 2026-10-08) Bố mẹ xác nhận bé đã làm thử thách "ngoài đời" của tuần chứa `today` (SỬA TẠI CHỖ — chỉ thêm).
 * Chỉ ghi khi thử thách của tuần đúng là `id` và chưa xong. Trả về true nếu có đổi.
 */
export function confirmSelfChallenge(data: AppData, today: string, id: string, now: number): boolean {
  const c = weeklyChallenge(data, today);
  if (c.id !== id || c.done || !c.selfReport) return false;
  const prog = data.progress;
  const store: Record<string, ChallengeRecord> = isObj(prog.challenges) ? prog.challenges : (prog.challenges = {});
  store[c.monday] = { id: c.id, doneAt: now };
  bumpDataRev(data);
  return true;
}

/** Tuần lịch còn ĐỦ buổi (chưa gộp lịch sử): thứ 2 ≥ history.compactedThrough. */
const intact = (data: Readonly<AppData>, monday: string) => monday >= hist(data).compactedThrough;

/**
 * Các tuần được SUY RA trực tiếp (ngoài các tuần đã lưu): tuần lịch còn đủ buổi, từ tuần của mốc kỷ lục trò chơi
 * (progress.gameBase) trở đi — tuần trước đó có thể đã đổi tập trò "phá kỷ lục" nên chỉ tin bản đã lưu.
 */
function liveMondays(data: Readonly<AppData>, extra?: string): string[] {
  const from = storedGameBase(data)?.monday ?? '';
  const set = new Set<string>();
  for (const s of data.sessions) set.add(mondayKey(s.date));
  if (from) set.add(from);
  if (extra) set.add(extra);
  return [...set].filter((m) => m >= from && intact(data, m));
}

/**
 * MỌI tuần đã hoàn thành thử thách = đã lưu (progress.challenges) ∪ suy ra từ các tuần lịch còn đủ buổi.
 * Chỉ tăng: bản ghi đã lưu không bao giờ bị xóa; tuần còn đủ buổi chỉ thêm bản ghi.
 */
export function completedChallengeWeeks(data: Readonly<AppData>): Map<string, ChallengeRecord> {
  return memo(data, 'challengeWeeks', () => {
    const out = storedChallenges(data);
    for (const monday of liveMondays(data)) {
      if (out.has(monday)) continue;
      const c = challengeOfWeek(data, monday);
      if (c.done) out.set(monday, { id: c.id, doneAt: 0 });
    }
    return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
  });
}

/**
 * Chuỗi tuần LIỀN NHAU hoàn thành thử thách, tính tới tuần này (hoặc tuần trước nếu tuần này chưa xong — chưa hết tuần
 * thì chuỗi chưa đứt).
 */
export function challengeStreak(data: Readonly<AppData>, today: string): number {
  const done = completedChallengeWeeks(data);
  let m = mondayKey(today);
  if (!done.has(m)) m = prevMonday(m);
  let n = 0;
  while (done.has(m)) {
    n++;
    m = prevMonday(m);
  }
  return n;
}

/**
 * LƯU (SỬA TẠI CHỖ data.progress — chỉ thêm): các tuần đã xong mà chưa lưu (kể cả tuần này khi chưa có buổi nào — vd chỉ
 * chơi trò chơi), và sang tuần mới thì chụp mốc kỷ lục trò chơi (progress.gameBase) SAU khi đã lưu tuần cũ.
 * Gọi cuối buổi, khi về màn chính và TRƯỚC khi gộp lịch sử (compaction.ts) — cúp không mất khi buổi cũ bị gộp.
 * Trả về true nếu có đổi.
 */
export function recordChallenges(data: AppData, today: string, now: number): boolean {
  const cur = mondayKey(today);
  const have = storedChallenges(data);
  const add: Array<[string, ChallengeRecord]> = [];
  const seen = new Set<string>();
  for (const monday of [...liveMondays(data, cur)]) {
    if (have.has(monday) || seen.has(monday)) continue;
    seen.add(monday);
    const c = challengeOfWeek(data, monday);
    if (c.done) add.push([monday, { id: c.id, doneAt: now }]);
  }
  const prog = data.progress;
  let changed = false;
  if (add.length) {
    const store: Record<string, ChallengeRecord> = isObj(prog.challenges) ? prog.challenges : (prog.challenges = {});
    for (const [m, r] of add) store[m] = r;
    changed = true;
  }
  // Sang tuần mới → chụp mốc kỷ lục trò chơi (chỉ các trò chưa chơi lại từ thứ 2 — biết chắc kỷ lục đầu tuần)
  const snap = storedGameBase(data);
  if (!snap || snap.monday < cur) {
    const t0 = dayStartMs(cur);
    const bests: Record<string, number> = {};
    for (const [k, [best, at]] of gameBests(data)) if (at < t0) bests[k] = best;
    if (snap || Object.keys(bests).length) {
      prog.gameBase = { monday: cur, bests };
      changed = true;
    }
  }
  if (changed) bumpDataRev(data);
  return changed;
}
