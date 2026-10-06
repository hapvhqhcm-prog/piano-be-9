import { describe, expect, it } from 'vitest';
import {
  STUCK_DAYS,
  WELCOME_BACK_ACTION,
  daysSince,
  findTarget,
  practiceFor,
  readiness,
  tonightPlan,
  tonightSegment,
  weekHeld,
} from '../src/ui/screens/tonight';
import { gateQuestion } from '../src/ui/screens/parentGate';
import { SONG_CHECKS, RHYTHM_CHECKS } from '../src/ui/components/parentCheck';
import { PARENT_PHRASES } from '../src/ui/screens/posture';
import { defaultData, localDateStr, type AppData, type Session } from '../src/progress/schema';

const NOW = new Date(2026, 9, 20, 19, 0, 0);
const ago = (k: number) => localDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - k));
let seq = 0;
function session(p: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: ago(1),
    lessonId: 'w3-l1',
    parentAssessments: [],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: null,
    startedAt: 0,
    endedAt: null,
    minutes: 10,
    completed: true,
    checklist: {},
    ...p,
  };
}
function data(sessions: Session[], week = 3): AppData {
  const d = defaultData(NOW);
  d.sessions = sessions;
  d.progress.currentWeek = week;
  return d;
}
const pa = (note: string, result: 'correct' | 'retry') => ({ note, result, ts: 0 });

describe('Việc tối nay — Làm ngay, quay lại sau kỳ nghỉ', () => {
  it('chỗ khó là nốt → đoạn Từng nốt với các nốt đó (1 nốt = 5 lần)', () => {
    const d = data([session({ parentAssessments: [pa('F4', 'retry'), pa('F4', 'retry'), pa('G4', 'retry')] })]);
    const t = tonightPlan(d, NOW);
    expect(t.welcomeBack).toBe(false);
    expect(t.practice).toEqual({ kind: 'notes', noteIds: ['F4', 'G4'] });
    const seg = tonightSegment(['F4']);
    expect(seg.targets).toHaveLength(5);
    expect(seg.targets.every((x) => x.keys[0] === 'F4')).toBe(true);
    expect(tonightSegment(['F4', 'G4']).targets.map((x) => x.keys[0])).toEqual(['F4', 'G4', 'F4', 'G4', 'F4', 'G4']);
  });
  it('chỗ khó là bài hát → mở bài; đọc nhạc ngẫu nhiên / trò chơi → không có Làm ngay', () => {
    expect(practiceFor([{ kind: 'song', key: 'song:mary_lamb', label: 'x', misses: 2 }])).toEqual({ kind: 'song', songId: 'mary_lamb' });
    expect(practiceFor([{ kind: 'song', key: 'song:sight', label: 'x', misses: 2 }])).toBeNull();
    expect(practiceFor([{ kind: 'game', key: 'x', label: 'x', misses: 2 }])).toBeNull();
    expect(practiceFor([])).toBeNull();
  });
  it('mã trong giáo trình / phím nối "+" của micro đều tìm được bài tập', () => {
    expect(findTarget('twins-4')?.keys.length).toBeGreaterThan(0);
    expect(findTarget('C4')?.keys).toEqual(['C4']);
    expect(findTarget('teach-back')).toBeUndefined();
  });
  it('nghỉ ≥ 5 ngày → "Mừng con quay lại", bỏ chỗ khó cũ hơn 7 ngày', () => {
    const d = data([session({ date: ago(9), parentAssessments: [pa('F4', 'retry'), pa('F4', 'retry')] })]);
    const t = tonightPlan(d, NOW);
    expect(t.welcomeBack).toBe(true);
    expect(t.daysAway).toBe(9);
    expect(t.action).toBe(WELCOME_BACK_ACTION);
    expect(t.struggles).toEqual([]);
    // nghỉ 5 ngày: chỗ khó 5 ngày trước vẫn còn (trong 7 ngày)
    const d2 = data([session({ date: ago(5), parentAssessments: [pa('F4', 'retry')] })]);
    expect(tonightPlan(d2, NOW)).toMatchObject({ welcomeBack: true, struggles: [{ key: 'F4' }] });
    // học hôm qua → bình thường
    expect(tonightPlan(data([session({ date: ago(1) })]), NOW).welcomeBack).toBe(false);
    expect(daysSince(ago(3), NOW)).toBe(3);
  });
});

describe('Sẵn sàng sang tuần mới?', () => {
  it('chưa đạt tiêu chí → 🟡', () => {
    const r = readiness(data([session({ selfRating: 'all' })]), NOW);
    expect(r.level).toBe('more');
    expect(r.title).toContain('🟡');
  });
  it('2/3 buổi gần đây "Khó" → 🔴 nên chậm lại', () => {
    const r = readiness(data([session({ selfRating: 'hard' }), session({ selfRating: 'hard' }), session({ selfRating: 'all' })]), NOW);
    expect(r.level).toBe('slow');
    expect(r.reasons.join(' ')).toContain('Khó');
  });
  it('ở một tuần ≥ 14 ngày → cảnh báo', () => {
    const r = readiness(data([session({ date: ago(STUCK_DAYS), selfRating: 'all' }), session({ date: ago(1), selfRating: 'all' })]), NOW);
    expect(r.daysOnWeek).toBe(STUCK_DAYS);
    expect(r.stuck).toBe(true);
    expect(r.level).toBe('slow');
  });
  it('nhiều "Thử lại" trong 7 ngày → 🔴', () => {
    const r = readiness(data([session({ parentAssessments: Array.from({ length: 8 }, (_, i) => pa('F4', i < 5 ? 'retry' : 'correct')) })]), NOW);
    expect(r.level).toBe('slow');
  });
  it('giữ ở lại tuần: settings.holdWeek', () => {
    const d = data([]);
    expect(weekHeld(d.settings, 3)).toBe(false);
    (d.settings as { holdWeek?: number | null }).holdWeek = 3;
    expect(weekHeld(d.settings, 3)).toBe(true);
    expect(weekHeld(d.settings, 4)).toBe(false);
    expect(readiness(d, NOW).held).toBe(true);
  });
});

describe('Cổng phụ huynh, phiếu chấm, câu nói cho bố mẹ', () => {
  it('cổng: số hai chữ số × một chữ số (đôi khi + một số) — đáp án đúng', () => {
    for (let i = 0; i < 200; i++) {
      const q = gateQuestion();
      const m = /^(\d+) × (\d) (?:\+ (\d) )?= \?$/.exec(q.text)!;
      expect(m).toBeTruthy();
      const a = Number(m[1]);
      expect(a).toBeGreaterThanOrEqual(11);
      expect(a % 10).not.toBe(0);
      expect(q.answer).toBe(a * Number(m[2]) + Number(m[3] ?? 0));
    }
  });
  it('mỗi ý chấm có một dòng hướng dẫn bằng lời thường', () => {
    for (const c of [...SONG_CHECKS, ...RHYTHM_CHECKS]) expect(c.hint?.length).toBeGreaterThan(5);
    expect(SONG_CHECKS.find((c) => c.key === 'beat')!.hint).toContain('1 tiếng tích');
  });
  it('3 câu ngắn cho bố mẹ', () => {
    expect(PARENT_PHRASES).toHaveLength(3);
  });
});
