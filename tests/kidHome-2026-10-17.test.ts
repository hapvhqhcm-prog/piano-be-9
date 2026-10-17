/**
 * (2026-10-17, OWNER duyệt) Màn chính "1 nút to + bản đồ" + "Gộp phần thưởng, kết buổi 1 màn":
 * - tên nút ▶ (lessons/todayLabel.playLabel)
 * - sổ sticker chỉ "Sắp có" gần nhất (lessons/kidRewards.nextStickers), một bất ngờ mỗi ngày (surpriseFree)
 * - bố cục màn kết MỘT màn (endScreenPlan) + bản thu của buổi (sessionTake) + sao của buổi (sessionStars)
 */
import { describe, expect, it } from 'vitest';
import { defaultData, type AppData, type Session } from '../src/progress/schema';
import type { Lesson } from '../src/lessons/types';
import { LABEL_MAX, activityName, playLabel, tidyLabel, upcomingActivities } from '../src/lessons/todayLabel';
import { stepTitle } from '../src/lessons/stepTitle';
import { endScreenPlan, nextStickers, stickerProgress, surpriseFree, type StickerProgress } from '../src/lessons/kidRewards';
import { allStickers, type Sticker } from '../src/lessons/stickers';
import type { BonusEvent } from '../src/lessons/bonusStickers';
import { WEEKS, nextLesson, weekPlan } from '../src/lessons/lessonEngine';
import { fixtureWeek4Child } from './fixtures/week4Child';
import type { AlbumMeta } from '../src/progress/albumStore';

const lesson = (activities: Lesson['activities'], extra: Partial<Lesson> = {}): Lesson => ({
  id: 'w9-l9',
  week: 9,
  title: 'Mức 2: Mỗi phách một nốt',
  emoji: '🥁',
  activities,
  ...extra,
});
const song = (songId: string) => ({ kind: 'song' as const, songId, mode: 'wait' as const, hints: 'full' as const });
const quiz = (title: string) => ({ kind: 'quiz' as const, title, intro: '', quiz: { variant: 'read' } as never });
const data = (done: string[] = []): AppData => {
  const d = defaultData(new Date(2026, 9, 17));
  d.progress.lessonsCompleted = done;
  return d;
};
const titles: Record<string, string> = { frog: 'Ếch con nhảy', star: 'Ngôi sao nhỏ' };
const songTitle = (id: string) => titles[id] ?? null;

describe('nút ▶ màn chính: tên bài hát hôm nay', () => {
  it('bài hát đầu tiên của bài → "🎵 <tên bài>" (không phải tên bài học)', () => {
    const l = lesson([quiz('Nốt nào đây?'), song('frog'), song('star')]);
    expect(playLabel(l, data(), { songTitle })).toEqual({ icon: '🎵', text: 'Ếch con nhảy', index: 1 });
  });

  it('bỏ hoạt động đã xong ("<bài>#<i>") như buổi học tiếp phần còn dở', () => {
    const l = lesson([song('frog'), song('star')]);
    expect(upcomingActivities(l, data(['w9-l9#0'])).map((x) => x.index)).toEqual([1]);
    expect(playLabel(l, data(['w9-l9#0']), { songTitle }).text).toBe('Ngôi sao nhỏ');
    // Bài đã xong (học lại) → cả bài
    expect(playLabel(l, data(['w9-l9', 'w9-l9#0']), { songTitle }).text).toBe('Ếch con nhảy');
  });

  it('không có bài hát → tên hoạt động (stepTitle trước), kèm emoji bài học; bỏ tiền tố "Mức N:"', () => {
    const l = lesson([{ kind: 'notes', segment: {} as never }, quiz('Nốt nào đây?')]);
    expect(playLabel(l, data(), { songTitle })).toEqual({ icon: '🥁', text: 'Nốt nào đây?', index: 1 });
    expect(playLabel(l, data(), { songTitle, stepTitle: (a) => (a.kind === 'notes' ? 'Học nốt Fa' : null) }).text).toBe('Học nốt Fa');
    const bare = lesson([{ kind: 'notes', segment: {} as never }]);
    expect(playLabel(bare, data(), { songTitle })).toEqual({ icon: '🥁', text: 'Mỗi phách một nốt', index: null });
  });

  it('bài tập (không phải bài hát thật) → tên bài tập bỏ ghi chú trong ngoặc', () => {
    const l = lesson([song('ex-beat')]);
    expect(activityName(l.activities[0], () => 'Mỗi phách một nốt (8 ô nhịp)')).toBe('Mỗi phách một nốt');
  });

  it('tên dài cắt "…" cho vừa một dòng', () => {
    const t = tidyLabel('Mức 3: ' + 'Rất dài '.repeat(10));
    expect([...t].length).toBeLessThanOrEqual(LABEL_MAX);
    expect(t.endsWith('…')).toBe(true);
    expect(t.startsWith('Mức')).toBe(false);
  });

  it('giáo trình thật: mọi bài của mọi tuần có tên nút, không bắt đầu bằng "Mức N:"', () => {
    const d = data();
    for (const { week } of WEEKS) {
      for (const l of weekPlan(week).lessons) {
        const p = playLabel(l, d);
        expect(p.text.length, l.id).toBeGreaterThan(0);
        expect(/^Mức\s*\d/.test(p.text), `${l.id}: ${p.text}`).toBe(false);
      }
    }
  });

  it('bé tuần 4 thật (fixture): nút mang tên hoạt động/bài hát, không phải "Mức 2: …"', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 17, 18));
    const p = playLabel(nextLesson(d, () => 0.5, new Date(2026, 9, 17, 18)), d);
    expect(p.text).not.toMatch(/^Mức/);
    // (+ tích hợp 2026-10-17) có stepTitle (như home.ts homePlayLabel): bài tập cũng mang TÊN BÀI + 🎵
    const q = playLabel(nextLesson(d, () => 0.5, new Date(2026, 9, 17, 18)), d, { stepTitle });
    expect(q).toMatchObject({ icon: '🎵', text: 'Ếch con nhảy' });
  });
});

describe('sổ sticker: chỉ "Sắp có" gần nhất', () => {
  const st = (id: string, kind: Sticker['kind'], n: number | undefined, earned: boolean, extra: Partial<Sticker> = {}): Sticker => ({
    id,
    kind,
    title: id,
    hint: id,
    earned,
    ...(n !== undefined ? { n } : {}),
    ...extra,
  });
  const prog: StickerProgress = {
    songs: 3,
    busyWeeks: 3,
    days: 20,
    activeWeeks: 4,
    currentWeek: 4,
    levelEndWeek: 10,
    micEnabled: false,
    folkOpen: false,
  };
  const all: Sticker[] = [
    st('island-3', 'island', undefined, true, { week: 3 }),
    st('island-4', 'island', undefined, false, { week: 4 }),
    st('island-5', 'island', undefined, false, { week: 5 }),
    st('medal-1', 'medal', undefined, false, { week: 10 }),
    st('songs-1', 'songs', 1, true),
    st('songs-5', 'songs', 5, false),
    st('songs-10', 'songs', 10, false),
    st('days-20', 'days', 20, true),
    st('days-40', 'days', 40, false),
    st('days-120', 'days', 120, false),
    st('wk-4', 'activeWeeks', 4, true),
    st('wk-8', 'activeWeeks', 8, false),
    st('mic-perfect', 'mic', undefined, false),
    st('folk', 'folk', undefined, false),
  ];

  it('mỗi loại chỉ mốc kế tiếp; không bao giờ "120 ngày" khi còn mốc 40; tối đa 3', () => {
    const ids = nextStickers(all, prog).map((s) => s.id);
    expect(ids.length).toBe(3);
    expect(ids.slice(0, 2)).toEqual(['island-4', 'songs-5']);
    expect(['days-40', 'wk-8']).toContain(ids[2]);
    expect(ids).not.toContain('days-120');
    expect(ids).not.toContain('songs-10');
    expect(ids).not.toContain('island-5');
    expect(ids).not.toContain('medal-1');
  });

  it('sticker micro chỉ khi micro bật; huy chương chỉ ở tuần sân khấu; dân ca khi đã mở bài dân ca', () => {
    expect(nextStickers(all, { ...prog, micEnabled: true }, 10).map((s) => s.id)).toContain('mic-perfect');
    expect(nextStickers(all, { ...prog, currentWeek: 10 }, 10).map((s) => s.id)).toContain('medal-1');
    expect(nextStickers(all, { ...prog, folkOpen: true }, 10).map((s) => s.id)).toContain('folk');
    expect(nextStickers(all, prog, 10).map((s) => s.id)).not.toContain('mic-perfect');
  });

  it('dữ liệu thật của bé tuần 4: "Sắp có" ≤ 3, đều chưa có; mọi sticker đã nhận vẫn còn (chỉ đổi cách hiện)', () => {
    const d = fixtureWeek4Child(new Date(2026, 9, 17, 18));
    const stickers = allStickers(d);
    const soon = nextStickers(stickers, stickerProgress(d));
    expect(soon.length).toBeLessThanOrEqual(3);
    expect(soon.every((s) => !s.earned)).toBe(true);
    expect(soon.some((s) => s.id === 'days-120' || s.id === 'wk-52')).toBe(false);
    expect(stickers.filter((s) => s.earned).length).toBeGreaterThan(0);
  });

  it('một bất ngờ mỗi ngày', () => {
    expect(surpriseFree(null, '2026-10-17')).toBe(true);
    expect(surpriseFree('2026-10-16', '2026-10-17')).toBe(true);
    expect(surpriseFree('2026-10-17', '2026-10-17')).toBe(false);
  });
});

describe('màn kết buổi: MỘT màn', () => {
  const sticker = (id: string, kind: Sticker['kind'], extra: Partial<Sticker> = {}): Sticker => ({ id, kind, title: id, hint: '', earned: true, ...extra });
  const egg: BonusEvent = { sessionId: 's1', date: '2026-10-17', kind: 'egg', sticker: { key: 'robot', emoji: '🤖', title: 'Rô-bốt', bg: ['#fff', '#000'] } };
  const welcome: BonusEvent = { ...egg, kind: 'welcome' };
  const base = { advanced: false, fromWeek: 4, toWeek: 4, cheer: false, fresh: [] as Sticker[], bonus: null, surpriseFree: true, offer: null };

  it('không có gì mới → không thẻ nổi bật, không mừng', () => {
    expect(endScreenPlan(base)).toEqual({ highlight: null, more: 0, usesSurprise: false, celebrate: false, offer: null });
  });

  it('cập bến đảo đứng đầu; sticker của đảo vừa qua không đếm hai lần; trứng → dòng "+N"', () => {
    const p = endScreenPlan({
      ...base,
      advanced: true,
      fromWeek: 3,
      toWeek: 4,
      fresh: [sticker('island-3', 'island', { week: 3 }), sticker('songs-5', 'songs', { n: 5 })],
      bonus: egg,
    });
    expect(p.highlight).toEqual({ kind: 'island', fromWeek: 3, toWeek: 4 });
    expect(p.more).toBe(2); // songs-5 + trứng
    expect(p.usesSurprise).toBe(false);
    expect(p.celebrate).toBe(true);
  });

  it('cúp tuần > trứng > sticker; sticker hiếm trước', () => {
    expect(endScreenPlan({ ...base, cheer: true, bonus: egg }).highlight).toEqual({ kind: 'cup' });
    const e = endScreenPlan({ ...base, bonus: egg, fresh: [sticker('days-5', 'days', { n: 5 })] });
    expect(e.highlight).toEqual({ kind: 'egg', bonus: egg });
    expect(e.more).toBe(1);
    expect(e.usesSurprise).toBe(true);
    const s = endScreenPlan({ ...base, fresh: [sticker('days-5', 'days', { n: 5 }), sticker('songs-1', 'songs', { n: 1 })] });
    expect(s.highlight).toEqual({ kind: 'sticker', sticker: sticker('songs-1', 'songs', { n: 1 }) });
    expect(s.more).toBe(1);
  });

  it('hôm nay đã có bất ngờ → không bày quả trứng (vẫn đã nhận: đếm vào "+N"); chào mừng luôn hiện', () => {
    const p = endScreenPlan({ ...base, bonus: egg, surpriseFree: false });
    expect(p.highlight).toBeNull();
    expect(p.more).toBe(1);
    expect(p.usesSurprise).toBe(false);
    expect(endScreenPlan({ ...base, bonus: welcome, surpriseFree: false }).highlight).toEqual({ kind: 'welcome', bonus: welcome });
  });

  it('lời mời: đúng MỘT, giữ nguyên lựa chọn của session', () => {
    expect(endScreenPlan({ ...base, offer: 'concert' }).offer).toBe('concert');
    expect(endScreenPlan({ ...base, offer: null }).offer).toBeNull();
  });

  it('bản thu của buổi: bài có lượt trong buổi, lưu từ lúc bắt đầu buổi; hay nhất trước', async () => {
    const { sessionTake, sessionStars } = await import('../src/ui/screens/sessionEnd');
    const m = (songId: string, savedAt: number, stars: number, accuracy: number): AlbumMeta => ({
      songId,
      title: songId,
      savedAt,
      stars,
      accuracy,
      seconds: 10,
      mime: 'audio/mp4',
      size: 1,
    });
    const sess = { startedAt: 1000, songRuns: [{ songId: 'a' }, { songId: 'b' }] } as unknown as Session;
    const list = [m('a', 900, 3, 1), m('a', 1100, 2, 0.9), m('b', 1200, 3, 0.8), m('c', 1300, 3, 1)];
    expect(sessionTake(list, sess)?.songId).toBe('b');
    expect(sessionTake([m('a', 900, 3, 1)], sess)).toBeNull();
    expect(sessionTake(list, null)).toBeNull();
    expect(sessionStars(null)).toBe(3);
    expect(sessionStars({ selfRating: 'hard' } as Session)).toBe(3);
  });
});
