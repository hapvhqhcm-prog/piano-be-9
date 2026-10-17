/**
 * (+ 2026-10-17) "✅ Hôm nay bố mẹ cần" (parentToday.ts todayPlan) + MỘT viên cho bố mẹ ở màn của bé (parentPill.ts) +
 * "3 điều cần nhớ" + lý do độ khó.
 */
import { describe, expect, it } from 'vitest';
import { todayPlan, type TodayId, type TodayInput } from '../src/ui/screens/parentToday';
import { parentPillKind } from '../src/ui/components/parentPill';
import { difficultyWhy, threeTips } from '../src/ui/screens/parentWeek';
import { defaultData } from '../src/progress/schema';

const base: TodayInput = { pending: 0, weeklyDue: null, backupNeeded: false, micNever: false, healthDue: false };
const ids = (r: ReturnType<typeof todayPlan>) => r.items.map((x) => x.id + (x.done ? '+' : ''));

describe('todayPlan', () => {
  it('ngày thường: chỉ "Tối nay"', () => {
    expect(ids(todayPlan(base, null, '2026-10-17'))).toEqual(['tonight']);
  });
  it('thứ tự ưu tiên, tối đa 3: chờ xem → tối nay → báo cáo tuần (micro / sức khỏe chờ chỗ)', () => {
    const r = todayPlan({ ...base, pending: 4, weeklyDue: '2026-10-05', micNever: true, healthDue: true }, null, '2026-10-17');
    expect(ids(r)).toEqual(['review', 'tonight', 'weekly']);
    const r2 = todayPlan({ ...base, micNever: true, healthDue: true }, null, '2026-10-17');
    expect(ids(r2)).toEqual(['tonight', 'mic', 'health']);
  });
  it('việc đã hiện hôm nay ở lại (đánh dấu xong) khi xong; ngày mới bắt đầu lại', () => {
    const a = todayPlan({ ...base, pending: 2, weeklyDue: '2026-10-05' }, null, '2026-10-17');
    const b = todayPlan(base, a.state, '2026-10-17'); // đã chấm hết + đã xem báo cáo & sao lưu
    expect(ids(b)).toEqual(['review+', 'tonight', 'weekly+']);
    const c = todayPlan(base, { ...b.state, ticked: ['tonight'] }, '2026-10-17');
    expect(c.items.every((x) => x.done)).toBe(true);
    expect(ids(todayPlan(base, c.state, '2026-10-18'))).toEqual(['tonight']);
  });
  it('việc chưa xong được ưu tiên giữ khi phải cắt bớt', () => {
    const shown: TodayId[] = ['review', 'tonight', 'weekly'];
    const r = todayPlan({ ...base, healthDue: true }, { date: '2026-10-17', shown, ticked: ['tonight'] }, '2026-10-17');
    expect(r.items.length).toBe(3);
    expect(ids(r)).toContain('health');
  });
});

describe('parentPillKind: MỘT viên — chờ xem → sao lưu (30 ngày) → báo cáo tuần', () => {
  const now = new Date(2026, 9, 14, 10);
  it('ưu tiên đúng thứ tự', () => {
    const d = defaultData(new Date(2026, 7, 1));
    d.progress.practiceDays = { '2026-08-02': { minutes: 10, stars: 3 }, '2026-10-06': { minutes: 10, stars: 3 } };
    expect(parentPillKind(d, 2, now)).toBe('review');
    expect(parentPillKind(d, 0, now)).toBe('backup');
    d.settings.lastBackupAt = new Date(2026, 9, 1).getTime();
    expect(parentPillKind(d, 0, now)).toBe('weekly');
    (d.settings as { weeklyReportSeen?: string }).weeklyReportSeen = '2026-10-05';
    expect(parentPillKind(d, 0, now)).toBeNull();
  });
});

describe('Tuần N', () => {
  it('3 điều cần nhớ: mẹo tuần + chuẩn "Đúng rồi" + khi bé vấp', () => {
    const t = threeTips(4);
    expect(t).toHaveLength(3);
    expect(t[1].title).toContain('Đúng rồi');
  });
  it('lý do độ khó bằng lời thường cho mọi trường hợp', () => {
    for (const why of ['little-data', 'low', 'kind-stops', 'homework', 'cruising', 'ok'] as const) {
      const s = difficultyWhy({ why, index: 0.6, sessions: 5, kindStops: 2 });
      expect(s.length, why).toBeGreaterThan(10);
    }
    expect(difficultyWhy({ why: 'low', index: 0.6, sessions: 5, kindStops: 0 })).toContain('60%');
  });
});
