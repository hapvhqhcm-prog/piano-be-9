import { describe, expect, it } from 'vitest';
import { OPEN_GAP_MS, canCelebrate, initTracker, markCelebrated, onHidden, onVisible } from '../src/ui/celebrationQueue';
import { fixtureWeek4Child } from './fixtures/week4Child';
import { unseenUnlocks } from '../src/lessons/unlocks';
import { playableSongCount, welcomeBack } from '../src/lessons/shortSession';
import { backupNudgeDue } from '../src/progress/backup';
import { sessionCount } from '../src/progress/history';

describe('celebrationQueue: mỗi lần mở app tối đa một màn mừng', () => {
  it('lần mở mới: được mừng; đã mừng → không mừng thêm trong cùng lần mở', () => {
    let t = initTracker();
    expect(canCelebrate(t)).toBe(true);
    t = markCelebrated(t);
    expect(canCelebrate(t)).toBe(false);
  });

  it('app nằm nền ngắn (< 30 phút) rồi mở lại = vẫn lần mở cũ', () => {
    let t = markCelebrated(initTracker());
    t = onHidden(t, 1_000);
    t = onVisible(t, 1_000 + OPEN_GAP_MS - 1);
    expect(t.openId).toBe(1);
    expect(canCelebrate(t)).toBe(false);
  });

  it('app nằm nền ≥ 30 phút rồi mở lại = lần mở mới → quà để dành được mừng', () => {
    let t = markCelebrated(initTracker());
    t = onHidden(t, 5_000);
    t = onHidden(t, 9_000_000); // ẩn lần nữa không dời mốc
    t = onVisible(t, 5_000 + OPEN_GAP_MS);
    expect(t.openId).toBe(2);
    expect(canCelebrate(t)).toBe(true);
  });

  it('hiện lại khi chưa từng ẩn: không đổi gì', () => {
    const t = initTracker();
    expect(onVisible(t, 123)).toBe(t);
  });
});

describe('fixture bé thật tuần 4 (lần mở đầu sau cập nhật v0.18)', () => {
  const now = new Date(2026, 9, 9, 18, 0);
  const d = fixtureWeek4Child(now);

  it('~40 buổi, tuần 4, chưa sao lưu → có nhắc sao lưu; buổi gần nhất hôm qua → không chào "nhớ con"', () => {
    expect(sessionCount(d)).toBe(40);
    expect(d.progress.currentWeek).toBe(4);
    expect(backupNudgeDue(d.settings, sessionCount(d), now.getTime())).toBe(true);
    expect(welcomeBack(d, now)).toBe(false);
  });

  it('3 món quà của tuần 1–3 chưa xem (màn mừng gộp MỘT lần), vài bài chơi được', () => {
    expect(unseenUnlocks(d).map((x) => x.week)).toEqual([1, 2, 3]);
    expect(playableSongCount(d)).toBeGreaterThanOrEqual(2);
  });
});
