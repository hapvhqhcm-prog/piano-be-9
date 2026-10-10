/**
 * (+ 2026-10-10) Các ĐỢT THÊM BÀI vào Thư viện — dữ liệu để gắn nhãn "Mới" (src/lessons/discovery.ts).
 *
 * Chỉ bài trong danh sách này mới có thể hiện "Mới": 126 bài có từ trước 2026-10-09 KHÔNG nằm ở đây → không bao giờ
 * bị coi là mới với bé đang học. Lần sau thêm bài: thêm MỘT đợt mới (ngày + mã bài) ở CUỐI danh sách — không cần sửa
 * JSON bài hát (src/data/songs) hay scripts/gen-songs.py.
 */
export interface SongAddition {
  /** Ngày phát hành đợt bài (YYYY-MM-DD) */
  added: string;
  /** Mã bài (Tune.id) */
  ids: readonly string[];
}

export const SONG_ADDITIONS: readonly SongAddition[] = [
  {
    // OWNER duyệt "Thêm bài hát" — 24 bài chỉ để trong Thư viện, tuần 3–28 (tests/fixtures/library20261009.ts)
    added: '2026-10-09',
    ids: [
      'goldfish_swim', 'ants_march', 'tick_tock_clock', 'morning_sun', 'playground_slide', 'busy_bee', 'dolphin_jump',
      'little_turtle', 'ducklings_swim', 'woodpecker',
      'morning_mood', 'steamboat', 'ducklings_both', 'yankee_doodle', 'squirrel_nuts', 'merry_christmas', 'fireworks', 'auld_lang_syne',
      'spring_comes', 'sakura', 'mountain_king', 'swan_lake', 'shooting_star', 'lion_dance',
    ],
  },
];

const ADDED = new Map<string, string>(SONG_ADDITIONS.flatMap((a) => a.ids.map((id) => [id, a.added] as [string, string])));

/** Ngày bài được thêm (đợt nào), hoặc undefined = bài có từ đầu. */
export function songAddedIn(id: string): string | undefined {
  return ADDED.get(id);
}
