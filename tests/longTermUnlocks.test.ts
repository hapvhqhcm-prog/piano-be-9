import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_INFO,
  CHALLENGE_ORDER,
  NEW_CHALLENGES_FROM,
  SELF_CHALLENGES,
  completedChallengeWeeks,
  eligibleChallenges,
  weeklyChallenge,
  type ChallengeId,
} from '../src/lessons/challenges';
import { BONUS_POOL, EGG_POOL_V2_FROM, bonusCollection, bonusTimeline, poolOn } from '../src/lessons/bonusStickers';
import { ACTIVE_WEEK_MILESTONES, PRACTICE_DAY_MILESTONES, activeWeekCount, allStickers, practiceDayCount } from '../src/lessons/stickers';
import { UNLOCKS, autoEquip, equipped, unlockedItems, unseenUnlocks, withSeen, withToggle } from '../src/lessons/unlocks';
import { accompaniment, backingStyle, findSong, setBackingStyle, totalBeats } from '../src/music/tune';
import { TIMBRES, TIMBRE_IDS, isTimbre } from '../src/audio/timbres';
import { OUTFITS } from '../src/ui/components/mascot';
import { mondayKey } from '../src/progress/history';
import { MemoryStorage, ProgressStore } from '../src/progress/ProgressStore';
import { defaultData, localDateStr, validateAppData, type AppData, type Session, type SongRun } from '../src/progress/schema';
import { migrate } from '../src/progress/migrations';
import { fixtureChallenges, fixtureEggs, pastMondays } from './fixtures/longTerm';

import goldenJson from './fixtures/longTerm.golden.json';

const golden = goldenJson as {
  challenges: string[];
  completed: string[];
  eggs: string[];
  collection: string[];
  stickers: string[];
};

const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, dd + n));
};

let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `t${seq.toString(36)}-${(seq * 7919).toString(36)}`,
    date: '2026-10-01',
    lessonId: 'w4-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: seq,
    endedAt: seq,
    minutes: 10,
    completed: true,
    checklist: {},
    ...p,
  };
}

describe('🔒 Quá khứ KHÔNG đổi (giá trị chụp trước khi thêm thử thách / trứng mới)', () => {
  it('thử thách của mọi tuần đã qua + các cúp đã có giữ nguyên', () => {
    const d = fixtureChallenges();
    expect(pastMondays().map((m) => `${m}=${weeklyChallenge(d, m).id}`)).toEqual(golden.challenges);
    expect([...completedChallengeWeeks(d)].map(([m, r]) => `${m}:${r.id}`)).toEqual(golden.completed);
    // tuần cũ: kho chỉ gồm 7 loại gốc
    for (const m of pastMondays()) for (const p of eligibleChallenges(d, m)) expect(CHALLENGE_ORDER.indexOf(p.id)).toBeLessThan(7);
  });

  it('dòng thời gian trứng 🎁 + bộ sưu tập của các buổi cũ giữ nguyên', () => {
    const e = fixtureEggs();
    expect(bonusTimeline(e).map((x) => `${x.sessionId}:${x.sticker.key}`)).toEqual(golden.eggs);
    expect(bonusCollection(e).map((c) => `${c.sticker.key}x${c.count}`)).toEqual(golden.collection);
  });

  it('sticker đã nhận vẫn còn (kể cả "N ngày liền" cũ — giữ id, nay hiện "N ngày tập")', () => {
    const d = fixtureChallenges();
    const all = allStickers(d);
    const now = new Set(all.filter((s) => s.earned).map((s) => s.id));
    for (const id of golden.stickers) expect(now.has(id), id).toBe(true);
    for (const s of all) expect(s.title).not.toMatch(/(ngày|tuần) liền/);
    const streak = all.filter((s) => s.id.startsWith('streak-'));
    expect(streak.length).toBeGreaterThan(0);
    for (const s of streak) expect(s.title).toBe(`${s.n} ngày tập`);
  });
});

describe('🎁 Kho trứng lớn thêm (chỉ thêm vào cuối, từ EGG_POOL_V2_FROM)', () => {
  it('16 sticker gốc giữ thứ tự; 40 sticker mới đều có `from`; key không trùng', () => {
    expect(BONUS_POOL.slice(0, 16).every((d) => !d.from)).toBe(true);
    expect(BONUS_POOL.slice(16).every((d) => d.from === EGG_POOL_V2_FROM)).toBe(true);
    expect(BONUS_POOL.length).toBe(56);
    expect(new Set(BONUS_POOL.map((d) => d.key)).size).toBe(BONUS_POOL.length);
    expect(poolOn('2026-10-08')).toHaveLength(16);
    expect(poolOn(EGG_POOL_V2_FROM)).toHaveLength(56);
  });

  it('bé mới bắt đầu từ ngày kho mới: còn sticker MỚI (chưa có) tới tận buổi thứ 150+', () => {
    const d = defaultData(new Date(2026, 9, 9));
    for (let i = 0; i < 220; i++) d.sessions.push(session({ id: `n${i}-${(i * 104729).toString(36)}`, date: addDays(EGG_POOL_V2_FROM, i), startedAt: i }));
    const seen = new Set<string>();
    let lastNew = 0;
    bonusTimeline(d).forEach((e) => {
      if (!seen.has(e.sticker.key)) {
        seen.add(e.sticker.key);
        lastNew = d.sessions.findIndex((s) => s.id === e.sessionId) + 1;
      }
    });
    expect(seen.size).toBe(57); // Chào mừng + 56
    expect(lastNew).toBeGreaterThanOrEqual(150);
  });

  it('bé đang học (đã có trứng cũ): buổi sau ngày kho mới nhận được sticker mới', () => {
    const e = fixtureEggs();
    const before = bonusTimeline(e).length;
    for (let i = 0; i < 40; i++) e.sessions.push(session({ id: `x${i}-z`, date: addDays(EGG_POOL_V2_FROM, i), startedAt: 1e13 + i }));
    const tl = bonusTimeline(e);
    expect(tl.slice(0, before).map((x) => `${x.sessionId}:${x.sticker.key}`)).toEqual(golden.eggs);
    const fresh = tl.slice(before).map((x) => x.sticker.key);
    expect(fresh.length).toBeGreaterThan(5);
    expect(fresh.every((k) => BONUS_POOL.findIndex((d) => d.key === k) >= 16)).toBe(true); // ưu tiên con chưa có
  });
});

/** Kho có đồng hồ chỉnh được. */
function clock(start: string) {
  const [y, m, d] = start.split('-').map(Number);
  let t = new Date(y, m - 1, d, 17);
  const st = new ProgressStore(new MemoryStorage(), () => t, { saveDelayMs: 0, pageEvents: false });
  return {
    st,
    at: (ds: string) => {
      const [yy, mm, dd] = ds.split('-').map(Number);
      t = new Date(yy, mm - 1, dd, 17);
    },
  };
}
const run = (o: Partial<SongRun>): Omit<SongRun, 'ts'> => ({
  songId: 'x', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ...o,
});

describe('🏆 6 thử thách mới — "ngoài đời", bố mẹ xác nhận', () => {
  function learner() {
    const c = clock('2026-09-01');
    c.st.setCurrentWeek(6);
    const s = c.st.startSession('w5-l1');
    for (const songId of ['frog_hop', 'hot_cross_buns', 'mary_lamb', 'jingle_bells']) c.st.addSongRun(s.id, run({ songId }));
    c.st.finishSession(s.id);
    return c;
  }
  const mondayWith = (d: Readonly<AppData>, id: ChallengeId) => {
    let m = NEW_CHALLENGES_FROM;
    for (let i = 0; i < 40; i++, m = addDays(m, 7)) if (weeklyChallenge(d, m).id === id) return m;
    throw new Error(id);
  };

  it('có tên / biểu tượng, đều là thử thách bố mẹ xác nhận', () => {
    for (const id of CHALLENGE_ORDER.slice(7)) {
      expect(SELF_CHALLENGES.has(id)).toBe(true);
      expect(CHALLENGE_INFO[id].title.length).toBeGreaterThan(3);
    }
  });

  it('bố mẹ xác nhận → xong tuần, có cúp; sai mã / tuần khác thì không ghi', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), 'findC');
    c.at(addDays(m, 2));
    const w = weeklyChallenge(c.st.get(), addDays(m, 2));
    expect(w.selfReport).toBe(true);
    expect(w.done).toBe(false);
    expect(w.action.kind).toBe('none');
    expect(c.st.confirmChallenge('teach')).toBe(false);
    expect(c.st.confirmChallenge('findC')).toBe(true);
    expect(c.st.confirmChallenge('findC')).toBe(false); // đã xong
    expect(weeklyChallenge(c.st.get(), addDays(m, 3)).done).toBe(true);
    expect(allStickers(c.st.get()).some((s) => s.id === `challenge-${m}` && s.earned)).toBe(true);
    expect(validateAppData(c.st.get())).toEqual([]);
  });

  it('"Sáng tác 1 câu": lưu bài sáng tác trong tuần là tự xong', () => {
    const c = learner();
    const m = mondayWith(c.st.get(), 'compose');
    c.at(addDays(m, 1));
    expect(weeklyChallenge(c.st.get(), addDays(m, 1)).done).toBe(false);
    const [y, mo, dd] = addDays(m, 1).split('-').map(Number);
    c.st.addComposition({ id: 'c1', title: 'Bài của con', createdAt: new Date(y, mo - 1, dd, 18).getTime(), timeSignature: '4/4', notes: [{ pitch: 'C4', beats: 4 }] });
    expect(weeklyChallenge(c.st.get(), addDays(m, 1)).done).toBe(true);
  });
});

describe('📅 Ngày tập / tuần có tập (cộng dồn — không phải chuỗi)', () => {
  it('đếm NGÀY khác nhau có buổi hoàn thành; nghỉ xen kẽ vẫn cộng', () => {
    const dates = Array.from({ length: 12 }, (_, i) => addDays('2026-08-03', i * 3)); // cách 3 ngày
    const d: AppData = { ...defaultData(new Date(2026, 7, 1)), sessions: [...dates.map((date) => session({ date })), session({ date: dates[0] })] };
    expect(practiceDayCount(d)).toBe(12);
    const st = allStickers(d);
    const earned = new Set(st.filter((s) => s.earned).map((s) => s.id));
    expect(earned.has('days-5') && earned.has('days-10')).toBe(true);
    expect(earned.has('days-20')).toBe(false);
    expect(activeWeekCount(d)).toBe(new Set(dates.map(mondayKey)).size);
    expect(earned.has('wk-4')).toBe(true);
    expect(st.filter((s) => s.kind === 'days' && s.id.startsWith('days-')).map((s) => s.n)).toEqual([...PRACTICE_DAY_MILESTONES]);
    expect(st.filter((s) => s.kind === 'activeWeeks').map((s) => s.n)).toEqual([...ACTIVE_WEEK_MILESTONES]);
  });
});

describe('🎁 Quà mở khóa theo đảo', () => {
  const at = (week: number): AppData => {
    const d = defaultData(new Date(2026, 9, 1));
    d.progress.currentWeek = week;
    return d;
  };
  it('mở theo đảo đã qua; mã không trùng; mỗi tuần nhiều nhất một món', () => {
    expect(new Set(UNLOCKS.map((u) => u.id)).size).toBe(UNLOCKS.length);
    expect(new Set(UNLOCKS.map((u) => u.week)).size).toBe(UNLOCKS.length);
    expect(unlockedItems(at(1))).toEqual([]);
    expect(unlockedItems(at(4)).map((u) => u.id)).toEqual(['outfit:cap', 'timbre:musicbox', 'backing:march']);
    for (const u of UNLOCKS) {
      if (u.kind === 'outfit') expect(OUTFITS[u.key], u.id).toBeTruthy();
      if (u.kind === 'timbre') expect(isTimbre(u.key), u.id).toBe(true);
    }
  });
  it('màn mừng: chưa xem → mặc trang phục mới nhất (tiếng / nhạc đệm không tự đổi); đã xem thì thôi', () => {
    const d = at(5);
    const fresh = unseenUnlocks(d);
    expect(fresh.map((u) => u.key)).toEqual(['cap', 'musicbox', 'march', 'headphones']);
    d.settings.cosmetics = autoEquip(d, fresh);
    expect(equipped(d)).toEqual({ outfit: 'headphones', timbre: null, backing: null });
    expect(unseenUnlocks(d)).toEqual([]);
    expect(validateAppData(d)).toEqual([]);
  });
  it('chọn / bỏ chọn; món chưa mở hoặc mã lạ không dùng được', () => {
    const d = at(4);
    d.settings.cosmetics = withToggle(d, 'backing:march');
    expect(equipped(d).backing).toBe('march');
    d.settings.cosmetics = withToggle(d, 'backing:march');
    expect(equipped(d).backing).toBe(null);
    d.settings.cosmetics = withToggle(d, 'outfit:crown'); // chưa mở
    expect(equipped(d).outfit).toBe(null);
    d.settings.cosmetics = { ...withSeen(d, []), outfit: 'crown', timbre: 'nope' };
    expect(equipped(d)).toEqual({ outfit: null, timbre: null, backing: null });
  });
  it('schema: cosmetics / reminder tùy chọn; kiểu sai bị chặn; giữ qua migrate', () => {
    const d = at(4);
    d.settings.cosmetics = { outfit: 'cap', seen: ['outfit:cap'] };
    d.settings.reminder = { days: [1, 3, 5], time: '19:00' };
    expect(validateAppData(d)).toEqual([]);
    const m = migrate(JSON.parse(JSON.stringify(d)));
    expect(m.settings.cosmetics).toEqual({ outfit: 'cap', seen: ['outfit:cap'] });
    expect(m.settings.reminder).toEqual({ days: [1, 3, 5], time: '19:00' });
    expect(validateAppData({ ...d, settings: { ...d.settings, cosmetics: 'x' } })).toContain('settings.cosmetics');
    expect(validateAppData({ ...d, settings: { ...d.settings, reminder: { days: 'x', time: 1 } } })).toContain('settings.reminder');
  });
  it('tiếng đàn: thông số hợp lệ', () => {
    for (const id of TIMBRE_IDS) {
      const t = TIMBRES[id];
      expect(t.partials.length).toBeGreaterThan(0);
      expect(t.volume).toBeGreaterThan(0);
      expect(t.volume).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('🎵 Kiểu nhạc đệm', () => {
  const tune = findSong('ode_to_joy_easy')!;
  it('mặc định = như cũ; mã lạ → cơ bản', () => {
    setBackingStyle(null);
    expect(backingStyle()).toBe('basic');
    expect(accompaniment(tune)).toEqual(accompaniment(tune, 'basic'));
    setBackingStyle('lol');
    expect(backingStyle()).toBe('basic');
  });
  it('các kiểu đều nằm trong bài, có nốt mỗi phách', () => {
    const total = totalBeats(tune);
    for (const style of ['march', 'arpeggio', 'bounce'] as const) {
      const a = accompaniment(tune, style);
      expect(a.length).toBeGreaterThanOrEqual(total);
      for (const n of a) {
        expect(n.start).toBeGreaterThanOrEqual(0);
        expect(n.start).toBeLessThan(total);
        expect(n.midi).toBeGreaterThan(30);
        expect(n.midi).toBeLessThan(80);
      }
    }
    setBackingStyle('march');
    expect(accompaniment(tune)).toEqual(accompaniment(tune, 'march'));
    setBackingStyle(null);
  });
});

describe('rà soát 2026-10-09: kho trứng lớn từ đúng ngày SAU bản phát hành v0.18.0 (8/10)', () => {
  it('buổi 8/10 (bản cũ) bốc kho cũ; từ 9/10 bốc kho lớn — không đổi trứng bé đã thấy', () => {
    expect(EGG_POOL_V2_FROM).toBe('2026-10-09');
    expect(poolOn('2026-10-08')).toHaveLength(16);
    expect(poolOn('2026-10-09')).toHaveLength(56);
  });
});
