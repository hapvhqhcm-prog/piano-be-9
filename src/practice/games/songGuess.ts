/**
 * 🎵 "Nghe đoán bài" — app đàn câu đầu của một bài con biết, bé chọn tên bài trong 3 thẻ.
 * Phần THUẦN: bài đủ điều kiện (đã từng chơi, hoặc đã mở theo tuần), câu nhạc đầu (ngắn), sinh các lượt.
 */
import { songEverPlayed } from '../../lessons/lessonEngine';
import { beatsPerMeasure, measureCount, phraseRanges, playable, slice, type Tune } from '../../music/tune';
import type { AppData } from '../../progress/schema';

export const SONG_ROUNDS = 6;
export const SONG_MIN = 3;
/** Câu đầu dài quá thì cắt bớt ô nhịp (giây, ở tốc độ phát) */
const MAX_CLIP_SEC = 9;

type Rng = () => number;

/**
 * Tên GỐC của bài cho thẻ đoán: bỏ phần biến thể sau "—" ("Chú cừu nhỏ — tay trái" → "Chú cừu nhỏ")
 * và ghi chú trong ngoặc ("(dân ca Nam Bộ)").
 */
export const baseTitle = (t: Pick<Tune, 'titleVi'>): string =>
  t.titleVi.split(/\s+—\s+/)[0].replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * Bài đủ điều kiện: đã mở theo tuần hiện tại HOẶC bé đã từng chơi; có nốt để đàn.
 * Các biến thể của CÙNG một bài (tay trái, hai tay, thế Sol…) gộp làm một — ưu tiên bản gốc (không hậu tố).
 */
export function eligibleSongs(data: Readonly<AppData>, songs: readonly Tune[]): Tune[] {
  const week = data.progress.currentWeek;
  const byBase = new Map<string, Tune>();
  for (const s of songs) {
    if (!(((s.week ?? 1) <= week || songEverPlayed(data, s.id)) && playable(s).length >= 3)) continue;
    const key = baseTitle(s).toLocaleLowerCase('vi');
    const had = byBase.get(key);
    if (!had || (had.titleVi.includes('—') && !s.titleVi.includes('—'))) byBase.set(key, s);
  }
  return [...byBase.values()];
}

/** Tốc độ phát cho trò đoán: tự nhiên hơn tốc độ tập (bài tập chậm khó nhận ra), trong khoảng 80–132. */
export const guessBpm = (t: Tune): number => Math.round(Math.min(132, Math.max(80, t.bpm * 1.2)));

/** Câu nhạc đầu (cắt còn ≤ MAX_CLIP_SEC giây, ít nhất 1 ô) — đủ để nhận ra bài. */
export function firstPhrase(t: Tune): Tune {
  const [from, to0] = phraseRanges(t)[0] ?? [0, measureCount(t)];
  const secPerBar = (beatsPerMeasure(t) * 60) / guessBpm(t);
  let to = to0;
  while (to - from > 1 && (to - from) * secPerBar > MAX_CLIP_SEC) to--;
  // Câu đầu rất ngắn (1 ô) → lấy thêm cho dễ nhận ra
  if (to - from < 2) to = Math.min(measureCount(t), from + 2);
  return slice(t, from, to);
}

export interface SongRound {
  answer: Tune;
  /** 3 thẻ đã trộn (ít hơn nếu thiếu bài) */
  options: Tune[];
  correct: number;
}

/**
 * Sinh `rounds` lượt: đáp án không lặp (trừ khi ít bài — khi đó không lặp liền nhau);
 * thẻ nhiễu ưu tiên bài có emoji KHÁC đáp án và khác nhau (thẻ nhìn phân biệt rõ).
 */
export function makeSongRounds(
  pool: readonly Tune[],
  emojiOf: (t: Tune) => string,
  rng: Rng = Math.random,
  rounds = SONG_ROUNDS,
): SongRound[] {
  if (pool.length < 2) return [];
  const shuffled = <T>(a: readonly T[]): T[] => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)) % (i + 1);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const answers: Tune[] = [];
  let bag: Tune[] = [];
  while (answers.length < rounds) {
    if (!bag.length) bag = shuffled(pool);
    const last = answers[answers.length - 1];
    const i = bag.findIndex((t) => t !== last);
    answers.push(bag.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return answers.map((answer) => {
    const others = shuffled(pool.filter((t) => t !== answer && baseTitle(t) !== baseTitle(answer)));
    const picked: Tune[] = [];
    const emojis = new Set([emojiOf(answer)]);
    for (const t of others) {
      if (picked.length >= 2) break;
      if (!emojis.has(emojiOf(t))) {
        picked.push(t);
        emojis.add(emojiOf(t));
      }
    }
    for (const t of others) if (picked.length < 2 && !picked.includes(t)) picked.push(t);
    const options = shuffled([answer, ...picked]);
    return { answer, options, correct: options.indexOf(answer) };
  });
}

/** Sao cuối trò (6 lượt): 1★ ≥ 2 · 2★ ≥ 4 · 3★ = 6. */
export function songStars(score: number): 0 | 1 | 2 | 3 {
  return score >= SONG_ROUNDS ? 3 : score >= 4 ? 2 : score >= 2 ? 1 : 0;
}
