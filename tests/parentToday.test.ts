/**
 * (2026-10-25, OWNER "tôi hầu như không có thời gian vào app, hãy bỏ phần phụ huynh ra") — thay cho test "✅ Hôm nay bố mẹ cần"
 * (parentToday.ts todayPlan), "MỘT viên cho bố mẹ" (parentPill.ts) và "3 điều cần nhớ": các phần đó ĐÃ BỎ. Màn ⚙️ Cài đặt chỉ còn
 * thiết lập một lần + dữ liệu; báo cáo tuần vẫn mở được từ ⚙️ nhưng KHÔNG nhắc. Lý do độ khó (difficultyWhy) giữ cho thẻ Tuần.
 */
import { describe, expect, it } from 'vitest';
import { difficultyWhy } from '../src/ui/screens/parentWeek';
import { weeklyReportDue } from '../src/progress/weeklyReportDue';
import { defaultData } from '../src/progress/schema';

const RAW = import.meta.glob('../src/ui/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const has = (rel: string) => `../src/${rel}` in RAW;
const src = (rel: string) => {
  const s = RAW[`../src/${rel}`];
  if (s === undefined) throw new Error(`không thấy ${rel}`);
  return s;
};

describe('không còn việc hằng ngày cho bố mẹ', () => {
  it('các mô-đun "Hôm nay bố mẹ cần", viên nhắc bố mẹ, hàng chờ bố mẹ xem đã bỏ', () => {
    for (const f of ['ui/screens/parentToday.ts', 'ui/screens/parentTodayCards.ts', 'ui/components/parentPill.ts', 'ui/screens/parentReview.ts', 'ui/selfStudy.ts'])
      expect(has(f), f).toBe(false);
    expect(has('ui/screens/home.ts')).toBe(true);
  });
  it('⚙️ Cài đặt: không còn thẻ hôm nay / 3 điều / Có gì mới / băng nhắc sao lưu; vẫn có sao lưu, micro, báo cáo tuần (thủ công)', () => {
    const p = src('ui/screens/parent.ts');
    for (const k of ['todayCard', 'tipsCard', 'whatsNewCard', 'backup-overdue', 'parentReviewScreen', 'weeklyReportDue']) expect(p.includes(k), k).toBe(false);
    expect(p).toContain('⚙️ Cài đặt');
    expect(p).toContain('weeklyReportScreen');
    expect(p).toContain('setupSection');
    expect(p).toContain('advancedSection');
  });
  it('màn của bé không gọi weeklyReportDue / backupOverdue (không nhắc)', () => {
    for (const f of ['ui/screens/home.ts', 'ui/screens/session.ts', 'ui/screens/sessionFlow.ts', 'ui/screens/sessionEnd.ts'])
      expect(src(f), f).not.toMatch(/weeklyReportDue|backupOverdue|healthNow/);
  });
  it('hàm tính "báo cáo tuần sẵn sàng" vẫn đúng (dùng trong ⚙️ / báo cáo, không nhắc bé)', () => {
    const d = defaultData(new Date(2026, 7, 1));
    d.progress.practiceDays = { '2026-10-06': { minutes: 10, stars: 3 } };
    expect(weeklyReportDue(d, new Date(2026, 9, 14, 10))).toBe('2026-10-05');
  });
});

describe('Tuần N (⚙️)', () => {
  it('lý do độ khó bằng lời thường cho mọi trường hợp', () => {
    for (const why of ['little-data', 'low', 'kind-stops', 'homework', 'cruising', 'ok'] as const) {
      const s = difficultyWhy({ why, index: 0.6, sessions: 5, kindStops: 2 });
      expect(s.length, why).toBeGreaterThan(10);
    }
    expect(difficultyWhy({ why: 'low', index: 0.6, sessions: 5, kindStops: 0 })).toContain('60%');
  });
});
