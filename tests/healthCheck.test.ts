/**
 * (+ 2026-10-17) 🩺 Kiểm tra sức khỏe app — hàm thuần pwa/healthCheck.ts: khi nào mời kiểm tra, cờ "⚠️" trên nút Phụ huynh,
 * so micro tháng này với lần trước, bản ghi localStorage.
 */
import { describe, expect, it } from 'vitest';
import {
  HEALTH_AWAY_DAYS,
  compareMic,
  healthCheckDue,
  healthFlags,
  loadHealth,
  micOverrideRate,
  returnGapDays,
  saveHealth,
  type HealthData,
} from '../src/pwa/healthCheck';
import { healthReportText } from '../src/ui/screens/healthCheck';

const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const days = (...ds: string[]): HealthData & { settings: { lastBackupAt: number; micEnabled: boolean } } => ({
  settings: { lastBackupAt: at(2026, 10, 10), micEnabled: true },
  progress: { practiceDays: Object.fromEntries(ds.map((d) => [d, { minutes: 10, stars: 3 }])) },
  sessions: [],
});

class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('healthCheckDue', () => {
  const d = days('2026-10-01', '2026-10-03', '2026-10-05', '2026-10-15');
  it('đầu tháng: chưa kiểm tra trong tháng này → month; đã kiểm tra sau ngày 1 → không', () => {
    expect(healthCheckDue(d, { now: at(2026, 10, 16) }).reasons).toContain('month');
    expect(healthCheckDue(d, { now: at(2026, 10, 16), lastCheckAt: at(2026, 10, 2) }).due).toBe(false);
    expect(healthCheckDue(d, { now: at(2026, 11, 1), lastCheckAt: at(2026, 10, 2) }).reasons).toContain('month');
  });
  it('cài mới (ít hơn 3 ngày tập) → không làm phiền', () => {
    expect(healthCheckDue(days('2026-10-15'), { now: at(2026, 10, 16) }).due).toBe(false);
  });
  it('vắng ≥ 14 ngày rồi quay lại → away (tới khi kiểm tra)', () => {
    const x = days('2026-09-01', '2026-09-02', '2026-09-03', '2026-10-17');
    expect(returnGapDays(x, at(2026, 10, 17))).toBeGreaterThanOrEqual(HEALTH_AWAY_DAYS);
    expect(healthCheckDue(x, { now: at(2026, 10, 17), lastCheckAt: at(2026, 10, 1, 9) }).reasons).toEqual(['away']);
    expect(healthCheckDue(x, { now: at(2026, 10, 17, 20), lastCheckAt: at(2026, 10, 17, 19) }).due).toBe(false);
  });
  it('iPadOS đổi (agent khác điền env.osChanged) → os; env.daysAway thay cho tự tính', () => {
    expect(healthCheckDue(d, { now: at(2026, 10, 16), lastCheckAt: at(2026, 10, 2), osChanged: true }).reasons).toEqual(['os']);
    expect(healthCheckDue(d, { now: at(2026, 10, 16), lastCheckAt: at(2026, 10, 2), daysAway: 20 }).reasons).toEqual(['away']);
  });
});

describe('healthFlags', () => {
  it('ổn hết → rỗng', () => {
    expect(healthFlags(days('2026-10-01'), { now: at(2026, 10, 16) })).toEqual([]);
  });
  it('sao lưu > 30 ngày, lỗi, iPadOS, màn hình, giọng đọc', () => {
    const x = days('2026-08-01');
    x.settings.lastBackupAt = 0;
    const ids = healthFlags(x, { now: at(2026, 10, 16), errors: 2, osChanged: true, wakeLockDenied: true, voiceLost: true }).map((f) => f.id);
    expect(ids).toEqual(['backup', 'errors', 'os', 'screenAwake', 'voice']);
  });
  it('bố mẹ sửa micro ≥ 20% (≥ 10 nốt, 14 ngày) → mic; micro tắt thì không xét', () => {
    const x = days('2026-10-10');
    const a = (o: boolean) => (o ? { parentOverride: 'correct' } : {});
    x.sessions = [{ date: '2026-10-12', micAssessments: [...Array(8)].map(() => a(false)).concat([a(true), a(true)]) }];
    expect(micOverrideRate(x, at(2026, 10, 16))).toBeCloseTo(0.2);
    expect(healthFlags(x, { now: at(2026, 10, 16) }).map((f) => f.id)).toEqual(['mic']);
    x.settings.micEnabled = false;
    expect(healthFlags(x, { now: at(2026, 10, 16) })).toEqual([]);
    x.settings.micEnabled = true;
    expect(micOverrideRate(x, at(2026, 11, 16))).toBeNull(); // ngoài 14 ngày
  });
});

describe('so micro & bản ghi', () => {
  const m = (hits: number, softHits: number) => ({ hits, total: 10, softHits, softTotal: 4, sensitivity: 'normal' });
  it('tốt hơn / như cũ / kém hơn (chênh ≥ 10 điểm %)', () => {
    expect(compareMic(m(10, 4), m(7, 1))).toBe('better');
    expect(compareMic(m(8, 3), m(8, 2))).toBe('same');
    expect(compareMic(m(5, 0), m(9, 3))).toBe('worse');
    expect(compareMic(m(5, 0), null)).toBeNull();
  });
  it('lưu / đọc mốc; hỏng → null', () => {
    const kv = new Mem();
    expect(loadHealth(kv)).toBeNull();
    saveHealth({ at: 123, mic: m(9, 3), latencyMs: 40 }, kv);
    expect(loadHealth(kv)?.mic?.hits).toBe(9);
    kv.setItem('piano-be-9:health', '{bad');
    expect(loadHealth(kv)).toBeNull();
  });
  it('bản gửi người hỗ trợ: đủ 5 bước, cảnh báo Bluetooth', () => {
    const t = healthReportText(
      { at: at(2026, 10, 16), backup: true, sound: 'yes', voice: 'no', mic: m(9, 3), latencyMs: 180, checklist: ['autolock'] },
      { device: 'iPad', standalone: true, errors: [], micText: null, prevAt: null, trend: null },
    );
    for (const k of ['1) Sao lưu', '2) Tiếng đàn', '3) Micro', '4) Độ trễ', '5) Bảng kiểm']) expect(t).toContain(k);
    expect(t).toContain('Bluetooth');
    expect(t).toContain('1/5');
  });
});
