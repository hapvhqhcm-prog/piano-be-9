import { describe, expect, it } from 'vitest';
import { warmupMusic, WEEKS } from '../src/lessons/lessonEngine';
import { emptyHistory } from '../src/progress/history';
import { defaultData, type AppData } from '../src/progress/schema';

/** v0.18: "Ôn bài cũ" bị bỏ khi buổi đã đủ 7 màn → bài đến hạn ôn được dùng làm bài khởi động (giữ ôn ngắt quãng). */
describe('khởi động bằng nhạc — giữ ôn ngắt quãng', () => {
  const lesson = WEEKS.find((w) => w.week === 12)!.lessons[0];
  const data = (): AppData => {
    const d = defaultData();
    const h = emptyHistory();
    h.songs = {
      ode_to_joy_easy: { n: 9, p: 8, h: 1, s: 3, m: 60 },
      hot_cross_buns: { n: 3, p: 2, h: 1, s: 3 },
    } as never;
    return { ...d, history: h };
  };

  it('có bài ưu tiên → dùng bài đó', () => {
    const w = warmupMusic(lesson, data(), [], 'hot_cross_buns');
    expect(w.kind === 'song' ? w.songId : null).toBe('hot_cross_buns');
  });

  it('không có bài ưu tiên → chọn bài đã thuộc như cũ', () => {
    const w = warmupMusic(lesson, data(), []);
    expect(w.kind === 'song' ? w.songId : null).toBe('ode_to_joy_easy');
  });

  it('bài ưu tiên chưa từng chơi → bỏ qua', () => {
    const w = warmupMusic(lesson, data(), [], 'swing_waltz');
    expect(w.kind === 'song' ? w.songId : null).toBe('ode_to_joy_easy');
  });
});
