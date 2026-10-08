import { describe, expect, it } from 'vitest';
import {
  WELCOME_BACK_HOME_DAYS,
  daysAway,
  favouriteSong,
  playableSongCount,
  playableSongIds,
  reviewSongFor,
  shortSessionSongs,
  welcomeBack,
} from '../src/lessons/shortSession';
import { buildReminderIcs, firstOccurrence, foldLine, icsEscape, normDays, parseTime, reminderSummary } from '../src/lessons/reminder';
import { compactData } from '../src/progress/compaction';
import { defaultData, type AppData, type Session, type SongRun } from '../src/progress/schema';

let seq = 0;
const run = (o: Partial<SongRun>): SongRun => ({
  songId: 'mary_lamb', mode: 'tempo', level: 2, bpm: 60, hints: 'names', phrase: null, total: 20, hits: 20, source: 'mic', passed: true, ts: ++seq, ...o,
});
function session(date: string, runs: SongRun[] = [], p: Partial<Session> = {}): Session {
  seq++;
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d, 17).getTime() + seq;
  return {
    id: `h${seq}`, date, lessonId: 'w4-l1', parentAssessments: [], appAssessments: [], micAssessments: [], songRuns: runs.map((r) => ({ ...r, ts: t })),
    selfRating: null, startedAt: t, endedAt: t, minutes: 10, completed: true, checklist: {}, ...p,
  };
}
const data = (sessions: Session[]): AppData => {
  const d = defaultData(new Date(2026, 8, 1));
  d.progress.currentWeek = 4;
  d.sessions = sessions;
  return d;
};

describe('🎵 "Con chơi được N bài"', () => {
  it('= bài (không phải gam / đọc nhạc) đã ít nhất một lần chơi TRỌN, đủ tay, ĐẠT', () => {
    const d = data([
      session('2026-09-01', [
        run({ songId: 'mary_lamb' }), // trọn, đạt (theo nhịp)
        run({ songId: 'hot_cross_buns', mode: 'wait', bpm: 40 }), // trọn, đạt (từng nốt) — vẫn tính
        run({ songId: 'frog_hop', phrase: [0, 2] }), // chỉ một câu — không tính
        run({ songId: 'jingle_bells', passed: false, hits: 12 }), // chưa đạt — không tính
        run({ songId: 'ode_to_joy_both', hand: 'RH' }), // tách tay — không tính
        run({ songId: 'scale_c_rh' }), // bài tập gam — không tính
        run({ songId: 'sight-123' }), // đọc nhạc ngẫu nhiên — không tính
      ]),
    ]);
    expect(playableSongIds(d).sort()).toEqual(['hot_cross_buns', 'mary_lamb']);
    expect(playableSongCount(data([]))).toBe(0);
  });
  it('chỉ tăng: giữ nguyên sau khi gộp lịch sử', () => {
    const d = data([session('2026-03-01', [run({ songId: 'mary_lamb' })], { lessonId: 'w2-l1' }), session('2026-10-01', [run({ songId: 'twinkle_easy' })])]);
    const n = playableSongCount(d);
    const c = JSON.parse(JSON.stringify(d)) as AppData;
    expect(compactData(c, new Date(2026, 9, 8), 56).folded).toBe(1);
    expect(c.sessions.length).toBeLessThan(d.sessions.length);
    expect(playableSongCount(c)).toBe(n);
  });
});

describe('👋 Mừng con quay lại + buổi ngắn', () => {
  it(`nghỉ ≥ ${WELCOME_BACK_HOME_DAYS} ngày (theo lịch) mới chào`, () => {
    const d = data([session('2026-10-01', [run({})])]);
    expect(daysAway(d, new Date(2026, 9, 3, 20))).toBe(2);
    expect(welcomeBack(d, new Date(2026, 9, 3, 20))).toBe(false);
    expect(welcomeBack(d, new Date(2026, 9, 4, 8))).toBe(true);
    expect(welcomeBack(data([]), new Date(2026, 9, 4))).toBe(false); // chưa học buổi nào → không "nhớ con"
  });
  it('bài con thích = chơi trọn đạt nhiều lần nhất; bài ôn = bài đã thuộc khác, ưu tiên bài lâu chưa chơi', () => {
    const d = data([
      session('2026-09-01', [run({ songId: 'hot_cross_buns' }), run({ songId: 'mary_lamb' })]),
      session('2026-09-20', [run({ songId: 'mary_lamb' }), run({ songId: 'twinkle_easy' })]),
      session('2026-09-25', [run({ songId: 'mary_lamb' }), run({ songId: 'twinkle_easy' })]),
    ]);
    expect(favouriteSong(d)?.id).toBe('mary_lamb');
    const now = new Date(2026, 9, 1).getTime();
    expect(reviewSongFor(d, 'mary_lamb', now)?.id).toBe('hot_cross_buns'); // lâu chưa chơi nhất
    expect(shortSessionSongs(d, now).map((t) => t.id)).toEqual(['mary_lamb', 'hot_cross_buns']);
  });
  it('chưa có bài nào: vẫn có một bài của tuần hiện tại (không ôn)', () => {
    const s = shortSessionSongs(data([]), Date.now());
    expect(s).toHaveLength(1);
    expect(s[0].week ?? 1).toBeLessThanOrEqual(4);
  });
});

describe('⏰ Lời nhắc .ics', () => {
  const now = new Date(2026, 9, 8, 10, 0); // thứ 5
  const ics = buildReminderIcs({ days: [1, 3, 5], time: '19:30', now, minutes: 15, name: 'Bin' });
  const lines = ics.split('\r\n');
  it('lịch hợp lệ: CRLF, VEVENT lặp hằng tuần, báo đúng giờ, giờ Việt Nam', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(lines).toContain('DTSTART;TZID=Asia/Ho_Chi_Minh:20261009T193000'); // thứ 6 gần nhất
    expect(lines).toContain('DURATION:PT15M');
    expect(lines).toContain('TRIGGER:PT0M');
    expect(lines).toContain('TZID:Asia/Ho_Chi_Minh');
    expect(lines).toContain('TZOFFSETTO:+0700');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(ics).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/m);
  });
  it('dòng dài được gấp ≤ 75 byte (chữ Việt nhiều byte); thoát ký tự đặc biệt', () => {
    const enc = new TextEncoder();
    for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    const long = 'DESCRIPTION:' + 'Đàn đều tay nhé, '.repeat(10);
    const folded = foldLine(long);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('kiểm tra đầu vào', () => {
    expect(parseTime('7:05')).toEqual([7, 5]);
    expect(parseTime('24:00')).toBeNull();
    expect(normDays([5, 1, 1, 9, -1, 2.5])).toEqual([1, 5]);
    expect(() => buildReminderIcs({ days: [], time: '19:00', now })).toThrow();
    expect(() => buildReminderIcs({ days: [1], time: 'x', now })).toThrow();
    expect(firstOccurrence(now, [4]).getDate()).toBe(8); // hôm nay là thứ 5
    expect(reminderSummary([0, 1, 3], '19:00')).toBe('T2, T4, CN lúc 19:00');
  });
});
