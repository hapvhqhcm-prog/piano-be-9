import { describe, expect, it } from 'vitest';
import {
  composeReport,
  countStatus,
  diagSections,
  micCheckFromLog,
  parseDevice,
  technicalJSON,
  type DiagSnapshot,
} from '../src/pwa/diagnostics';
import { MIC_LOG_KEY, loadMicLog, saveMicLog } from '../src/audio/micLogStore';

const MAC_UA = (v: string) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`;

describe('parseDevice — userAgent', () => {
  it.each([
    ['15.0', '15.0', 15],
    ['15.6.1', '15.6.1', 15],
    ['16.6', '16.6', 16],
    ['17.4.1', '17.4.1', 17],
    ['18.0', '18.0', 18],
    ['26.0', '26.0', 26],
  ])('iPadOS %s ở chế độ máy tính (UA "Macintosh" + màn cảm ứng) → iPad', (v, want, major) => {
    const d = parseDevice(MAC_UA(v), 5);
    expect(d.kind).toBe('ipad');
    expect(d.os).toBe('iPadOS');
    expect(d.version).toBe(want);
    expect(d.major).toBe(major);
    expect(d.desktopUA).toBe(true);
    expect(d.browser).toBe('Safari');
  });

  it('cùng UA nhưng không có màn cảm ứng → máy Mac', () => {
    const d = parseDevice(MAC_UA('17.4'), 0);
    expect(d.kind).toBe('mac');
    expect(d.os).toBe('macOS');
    expect(d.version).toBe('10.15.7');
  });

  it('iPad UA kiểu di động ("CPU OS 15_7") → lấy phiên bản từ CPU OS', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
    const d = parseDevice(ua, 5);
    expect(d).toMatchObject({ kind: 'ipad', version: '15.7', major: 15, desktopUA: false });
  });

  it('app trên Màn hình chính ở chế độ máy tính (không có "Version/") → iPad, phiên bản không rõ', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    const d = parseDevice(ua, 5);
    expect(d.kind).toBe('ipad');
    expect(d.version).toBeNull();
    expect(d.major).toBeNull();
  });

  it('iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(parseDevice(ua, 5)).toMatchObject({ kind: 'iphone', os: 'iOS', version: '17.5', major: 17 });
  });

  it('Chrome trên iPad', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
    expect(parseDevice(ua, 5)).toMatchObject({ kind: 'ipad', version: '17.2', browser: 'Chrome' });
  });

  it('Android / Windows / rỗng', () => {
    expect(parseDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 5)).toMatchObject({
      kind: 'android',
      version: '14.0',
      browser: 'Chrome',
    });
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126', 0)).toMatchObject({
      kind: 'other',
      os: 'Windows',
      browser: 'Edge',
    });
    expect(parseDevice('', 0)).toMatchObject({ kind: 'other', version: null });
  });
});

const T = new Date(2026, 9, 7, 20, 15).getTime();

function snap(patch: Partial<DiagSnapshot> = {}): DiagSnapshot {
  return {
    at: T,
    appVersion: '0.14.0',
    ua: MAC_UA('17.4'),
    maxTouchPoints: 5,
    standalone: true,
    screen: { w: 1080, h: 810, vw: 1080, vh: 810, dpr: 2 },
    language: 'vi-VN',
    updateReady: false,
    audio: { supported: true, state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: null, heard: 'yes' },
    voice: { supported: true, loaded: true, viVoices: ['Linh'], total: 40, enabled: true, heard: 'yes' },
    mic: {
      getUserMedia: true,
      secure: true,
      permission: 'granted',
      state: 'off',
      enabled: true,
      sensitivity: 'normal',
      tuningCents: 0,
      latencyMs: 120,
      lastCheck: { ok: 5, total: 5, at: '06/10/2026' },
    },
    storage: {
      text: 'Bộ nhớ dữ liệu: 40 KB / 5,0 MB (1%)',
      percent: 1,
      ok: true,
      full: false,
      persisted: true,
      lastBackupAt: T - 86_400_000,
      sessions: 12,
      completed: 11,
      curriculumRev: 4,
      week: 3,
    },
    offline: { swSupported: true, controller: true, caches: ['piano-be-9-0.14.0'], online: true },
    perf: { planMs: 2.5, homeMs: 4, cores: 6, memoryGB: null },
    ...patch,
  };
}

const row = (s: DiagSnapshot, sec: string, id: string) =>
  diagSections(s)
    .find((x) => x.id === sec)!
    .rows.find((r) => r.id === id)!;

describe('diagSections — chấm ✅/⚠️/❌', () => {
  it('máy tốt: không có ⚠️/❌, đủ 7 mục', () => {
    const secs = diagSections(snap());
    expect(secs.map((x) => x.id)).toEqual(['device', 'audio', 'voice', 'mic', 'storage', 'offline', 'perf']);
    const n = countStatus(secs);
    expect(n.warn).toBe(0);
    expect(n.bad).toBe(0);
    expect(n.wait).toBe(0);
    for (const sec of secs) for (const r of sec.rows) expect(r.explain.length).toBeGreaterThan(5);
  });

  it('iPadOS 15 → ⚠️, iPadOS 14 → ❌, iPhone → ⚠️, không rõ bản → ⚠️ + chỉ chỗ xem', () => {
    expect(row(snap({ ua: MAC_UA('15.0') }), 'device', 'os').status).toBe('warn');
    expect(row(snap({ ua: MAC_UA('14.1') }), 'device', 'os').status).toBe('bad');
    const ip = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
    expect(row(snap({ ua: ip }), 'device', 'os').status).toBe('warn');
    const unk = row(snap({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)' }), 'device', 'os');
    expect(unk.status).toBe('warn');
    expect(unk.tip).toMatch(/Giới thiệu/);
  });

  it('mở trong tab Safari → ⚠️ + hướng dẫn Thêm vào MH chính', () => {
    const r = row(snap({ standalone: false }), 'device', 'standalone');
    expect(r.status).toBe('warn');
    expect(r.tip).toMatch(/Thêm vào MH chính/);
  });

  it('âm thanh: không nghe thấy → ❌ + mẹo chế độ im lặng; chưa bật → ℹ️', () => {
    const s = snap();
    s.audio = { ...s.audio, heard: 'no' };
    const r = row(s, 'audio', 'heard');
    expect(r.status).toBe('bad');
    expect(r.tip).toMatch(/im lặng/);
    expect(r.tip).toMatch(/Bluetooth/);
    s.audio = { ...s.audio, state: null, heard: null };
    expect(row(s, 'audio', 'ctx').status).toBe('info');
    expect(diagSections(s).find((x) => x.id === 'audio')!.rows.some((x) => x.id === 'latency')).toBe(false);
  });

  it('âm thanh: iPadOS cũ không có outputLatency → không lỗi, ghi "không báo"', () => {
    const s = snap();
    s.audio = { ...s.audio, baseLatency: null, outputLatency: null };
    expect(row(s, 'audio', 'latency').value).toMatch(/không báo/);
    s.audio = { ...s.audio, outputLatency: 0.25 };
    expect(row(s, 'audio', 'latency').status).toBe('warn');
  });

  it('không có giọng tiếng Việt → ❌ + hướng dẫn từng bước cài "Linh"', () => {
    const s = snap();
    s.voice = { ...s.voice, viVoices: [], heard: null };
    const r = row(s, 'voice', 'vi');
    expect(r.status).toBe('bad');
    expect(r.steps!.join(' ')).toMatch(/Trợ năng → Nội dung được đọc → Giọng nói/);
    expect(r.steps!.join(' ')).toMatch(/Linh/);
    expect(r.steps!.join(' ')).toMatch(/Giọng đọc hướng dẫn/);
    s.voice = { ...s.voice, loaded: false };
    expect(row(s, 'voice', 'vi').status).toBe('wait');
    s.voice = { ...s.voice, supported: false };
    expect(row(s, 'voice', 'tts').status).toBe('bad');
  });

  it('micro: bị chặn → ❌ (Cài đặt → Safari → Micrô); không hỏi được → ℹ️; kiểm tra 2/5 → ❌', () => {
    const s = snap();
    s.mic = { ...s.mic, permission: 'denied' };
    expect(row(s, 'mic', 'perm').status).toBe('bad');
    expect(row(s, 'mic', 'perm').tip).toMatch(/Safari → Micrô/);
    s.mic = { ...s.mic, permission: 'unknown' };
    expect(row(s, 'mic', 'perm').status).toBe('info');
    s.mic = { ...s.mic, permission: undefined };
    expect(row(s, 'mic', 'perm').status).toBe('wait');
    s.mic = { ...s.mic, lastCheck: { ok: 2, total: 5, at: '' } };
    expect(row(s, 'mic', 'check').status).toBe('bad');
    s.mic = { ...s.mic, lastCheck: null, secure: false };
    expect(row(s, 'mic', 'check').status).toBe('info');
    expect(row(s, 'mic', 'api').status).toBe('bad');
  });

  it('lưu trữ: chưa sao lưu sau ≥ 3 buổi → ⚠️; không bền → ⚠️; đầy → ❌', () => {
    const s = snap();
    s.storage = { ...s.storage, lastBackupAt: 0, persisted: false, full: true, ok: false };
    expect(row(s, 'storage', 'backup').status).toBe('warn');
    expect(row(s, 'storage', 'persist').status).toBe('warn');
    expect(row(s, 'storage', 'space').status).toBe('bad');
    s.storage = { ...s.storage, persisted: null };
    expect(row(s, 'storage', 'persist').status).toBe('info');
  });

  it('offline + hiệu năng', () => {
    const s = snap({ offline: { swSupported: true, controller: false, caches: [], online: false } });
    expect(row(s, 'offline', 'sw').status).toBe('warn');
    expect(row(s, 'offline', 'cache').status).toBe('warn');
    expect(row(s, 'offline', 'net').status).toBe('info');
    s.perf = { planMs: 400, homeMs: undefined, cores: null, memoryGB: null };
    expect(row(s, 'perf', 'plan').status).toBe('bad');
    expect(row(s, 'perf', 'home').status).toBe('wait');
  });
});

describe('composeReport — bản gửi người hỗ trợ', () => {
  it('gọn, tiếng Việt, có tóm tắt + góp ý + JSON kỹ thuật đọc được', () => {
    const s = snap({ ua: MAC_UA('15.0'), standalone: false });
    const text = composeReport(s, { feedback: 'Bé thích bài Mary.\nMicro hay nghe nhầm.', micLog: { app: 'piano-be-9 mic log v2', steps: [] } });
    expect(text).toMatch(/^🩺 Piano bé — kết quả kiểm tra iPad/);
    expect(text).toContain('Bản app: 0.14.0');
    expect(text).toContain('iPadOS 15.0 · Safari');
    expect(text).toMatch(/Tóm tắt: \d+ ✅ · 2 ⚠️ · 0 ❌/);
    expect(text).toContain('⚠️ Mở từ Màn hình chính');
    expect(text).toContain('→ Trong Safari bấm nút Chia sẻ');
    expect(text).toContain('Bé thích bài Mary.\nMicro hay nghe nhầm.');
    expect(text).toContain('07/10/2026 20:15');
    const json = JSON.parse(text.split('--- Kỹ thuật (JSON, cho người hỗ trợ) ---\n')[1]);
    expect(json.version).toBe('0.14.0');
    expect(json.device.kind).toBe('ipad');
    expect(json.micLog.app).toBe('piano-be-9 mic log v2');
    expect(json.storage.lastBackupAt).toMatch(/^\d{4}-/);
  });

  it('không kèm tên bé trừ khi bố mẹ tích; tên không bao giờ vào JSON', () => {
    const s = snap();
    const without = composeReport(s, { feedback: '' });
    expect(without).not.toMatch(/^Bé: /m);
    expect(without).toContain('(không có)');
    const withName = composeReport(s, { childName: 'Bông' });
    expect(withName).toMatch(/^Bé: Bông$/m);
    expect(JSON.stringify(technicalJSON(s))).not.toContain('Bông');
    expect(withName.split('--- Kỹ thuật')[1]).not.toContain('Bông');
  });

  it('dòng ✅ không kèm mẹo (gọn); dòng ❌ có mẹo', () => {
    const s = snap();
    s.audio = { ...s.audio, heard: 'no' };
    const text = composeReport(s);
    const i = text.indexOf('❌ Bố mẹ nghe thử: Không nghe thấy');
    expect(i).toBeGreaterThan(0);
    expect(text.slice(i).split('\n')[1]).toMatch(/^ {3}→ .*im lặng/);
    expect(text).not.toContain('→ Đây là');
  });
});

describe('nhật ký micro gần nhất', () => {
  const kv = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('lưu / đọc lại, cắt bớt nốt đàn tự do', () => {
    const store = kv();
    const notes = Array.from({ length: 80 }, (_, i) => ({ note: 'C4', cents: i, latencyMs: null }));
    saveMicLog({ app: 'x', at: '2026-10-06T10:00:00.000Z', steps: [{ result: 'ok' }], free: { heard: 80, notes } }, store);
    expect(store.m.has(MIC_LOG_KEY)).toBe(true);
    const back = loadMicLog(store)!;
    expect((back.free as { notes: unknown[] }).notes).toHaveLength(30);
    expect((back.free as { heard: number }).heard).toBe(80);
  });

  it('dữ liệu hỏng / không có → null; không có bộ nhớ → không lỗi', () => {
    const store = kv();
    expect(loadMicLog(store)).toBeNull();
    store.setItem(MIC_LOG_KEY, '{hỏng');
    expect(loadMicLog(store)).toBeNull();
    expect(loadMicLog(null)).toBeNull();
    expect(() => saveMicLog({}, null)).not.toThrow();
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); } };
    expect(() => saveMicLog({ a: 1 }, throwing)).not.toThrow();
    expect(loadMicLog(throwing)).toBeNull();
  });

  it('micCheckFromLog: đếm nốt đúng, ưu tiên checkAt', () => {
    expect(micCheckFromLog(null)).toBeNull();
    expect(micCheckFromLog({ steps: [] })).toBeNull();
    const steps = [{ result: 'ok' }, { result: 'ok' }, { result: 'wrong' }, { result: 'ok' }, { result: 'none' }];
    expect(micCheckFromLog({ at: new Date(2026, 9, 6, 9).toISOString(), steps })).toEqual({ ok: 3, total: 5, at: '06/10/2026' });
    expect(micCheckFromLog({ at: new Date(2026, 9, 7, 9).toISOString(), checkAt: new Date(2026, 9, 1, 9).toISOString(), steps })?.at).toBe('01/10/2026');
  });
});
