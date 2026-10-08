/**
 * (+ 2026-10-08) Độ tin cậy (rà soát chuyên gia): nhập/đặt lại báo lỗi khi KHÔNG ghi được, dọn bản "corrupt-*" rác,
 * bản sao thứ hai trong IndexedDB (mirror.ts), nhắc sao lưu ở màn chính, nhật ký lỗi, tải lại một lần khi chunk lỗi,
 * service worker giữ bản cache trước, màn "Ối" khi một màn lỗi lúc vẽ.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import swSrc from '../src/pwa/sw-template.js?raw';
import {
  MAX_UNREADABLE_CORRUPT,
  MemoryStorage,
  ProgressStore,
  STORAGE_KEY,
} from '../src/progress/ProgressStore';
import { defaultData } from '../src/progress/schema';
import { sessionCount } from '../src/progress/history';
import { SaveMirror, restoreFromMirror, type MirrorBackend } from '../src/progress/mirror';
import { BACKUP_NUDGE_SESSIONS, backupNudgeDue } from '../src/progress/backup';
import { ERROR_LOG_KEY, ERROR_LOG_MAX, describeError, installErrorCapture, logError, readErrors } from '../src/pwa/errorLog';
import { composeReport, diagSections, type DiagSnapshot } from '../src/pwa/diagnostics';
import { LAZY_RELOAD_KEY, LAZY_RELOAD_WINDOW_MS, reloadOnceForUpdate } from '../src/ui/lazy';

const DAY = 86_400_000;
const now = () => new Date(2026, 9, 8, 18);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Dữ liệu đã học `n` buổi (đã xong) ở tuần `week`. */
function savedWith(week: number, n: number): string {
  const st = new ProgressStore(new MemoryStorage(), now, { pageEvents: false });
  st.setCurrentWeek(week);
  for (let i = 0; i < n; i++) {
    const s = st.startSession('w1-l1');
    st.addParentAssessment(s.id, 'C4', 'correct');
    st.finishSession(s.id);
  }
  return st.exportJSON();
}

/** localStorage giả: ghi khóa chính lỗi khi `failMain` bật. */
class FlakyStorage extends MemoryStorage {
  failMain = false;
  setItem(k: string, v: string) {
    if (this.failMain && k === STORAGE_KEY) throw new Error('disk I/O error');
    super.setItem(k, v);
  }
}

class QuotaStorage extends MemoryStorage {
  constructor(public limit: number) {
    super();
  }
  setItem(k: string, v: string) {
    let used = 0;
    for (let i = 0; i < this.length; i++) {
      const key = this.key(i)!;
      if (key !== k) used += key.length + this.getItem(key)!.length;
    }
    if (used + k.length + v.length > this.limit) {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    }
    super.setItem(k, v);
  }
}

const keysOf = (kv: MemoryStorage) => Array.from({ length: kv.length }, (_, i) => kv.key(i)!);

// ---------------------------------------------------------------- B3: nhập / đặt lại báo lỗi khi không ghi được

describe('importJSON / resetAll: ghi không được → báo lỗi (không còn { ok: true } giả)', () => {
  it('importJSON: ghi lỗi → ok:false, dữ liệu cũ vẫn dùng, localStorage không đổi', () => {
    const kv = new FlakyStorage();
    const st = new ProgressStore(kv, now, { pageEvents: false });
    st.setLearnerName('Bống');
    const s = st.startSession('w1-l1');
    st.addParentAssessment(s.id, 'C4', 'correct');
    st.flush();
    const before = kv.getItem(STORAGE_KEY);
    kv.failMain = true;
    const r = st.importJSON(savedWith(7, 2));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/Chưa lưu được/);
    expect(st.get().learner.name).toBe('Bống'); // vẫn là dữ liệu cũ (khớp với bộ nhớ)
    expect(st.get().progress.currentWeek).toBe(1);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    // Hết lỗi → nhập lại được
    kv.failMain = false;
    expect(st.importJSON(savedWith(7, 2))).toEqual({ ok: true });
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).progress.currentWeek).toBe(7);
  });

  it('resetAll: ghi lỗi → ok:false, KHÔNG xóa dữ liệu đang dùng', () => {
    const kv = new FlakyStorage();
    const st = new ProgressStore(kv, now, { pageEvents: false });
    const s = st.startSession('w1-l1');
    st.addParentAssessment(s.id, 'C4', 'correct');
    kv.failMain = true;
    const r = st.resetAll();
    expect(r.ok).toBe(false);
    expect(st.get().sessions).toHaveLength(1);
    expect(st.resetAll({ force: true }).ok).toBe(false);
    kv.failMain = false;
    expect(st.resetAll()).toEqual({ ok: true });
    expect(st.get().sessions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- 6: dọn bản "corrupt-*" không đọc được

describe('bản "corrupt-*" không đọc được: dọn để bộ nhớ không đầy dần', () => {
  it('mở app: chỉ giữ MAX_UNREADABLE_CORRUPT bản rác mới nhất; bản đọc được vẫn khôi phục như cũ', () => {
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, savedWith(4, 3));
    for (const t of [100, 200, 300]) kv.setItem(`${STORAGE_KEY}:corrupt-${t}`, `{hỏng ${t}`);
    const st = new ProgressStore(kv, now, { pageEvents: false });
    expect(sessionCount(st.get())).toBe(3);
    const left = keysOf(kv).filter((k) => k.includes(':corrupt-'));
    expect(MAX_UNREADABLE_CORRUPT).toBe(1);
    expect(left).toEqual([`${STORAGE_KEY}:corrupt-300`]);
  });

  it('dữ liệu chính hỏng mỗi lần mở → không tích lũy bản rác (giữ bản mới nhất)', () => {
    const kv = new MemoryStorage();
    let t = new Date(2026, 9, 8).getTime();
    for (let i = 0; i < 4; i++) {
      kv.setItem(STORAGE_KEY, `{hỏng lần ${i}`);
      t += 1000;
      const st = new ProgressStore(kv, () => new Date(t), { pageEvents: false });
      expect(st.recoveredFromCorrupt).toBe(true);
      st.dispose();
    }
    const left = keysOf(kv).filter((k) => k.includes(':corrupt-'));
    expect(left).toHaveLength(1);
    expect(kv.getItem(left[0])).toBe('{hỏng lần 3');
  });

  it('bản "corrupt-*" của bản app MỚI HƠN không bị coi là rác', () => {
    const kv = new MemoryStorage();
    const future = JSON.stringify({ ...JSON.parse(savedWith(2, 1)), schemaVersion: 999 });
    kv.setItem(`${STORAGE_KEY}:corrupt-100`, future);
    kv.setItem(`${STORAGE_KEY}:corrupt-200`, '{hỏng');
    new ProgressStore(kv, now, { pageEvents: false });
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-100`)).toBe(future);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-200`)).toBe('{hỏng');
  });

  it('hết chỗ: bỏ cả bản rác cuối cùng để ghi được dữ liệu chính', () => {
    const kv = new QuotaStorage(9_000);
    kv.setItem(`${STORAGE_KEY}:corrupt-100`, 'x'.repeat(5_000));
    const st = new ProgressStore(kv, now, { pageEvents: false });
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-100`)).not.toBeNull(); // còn chỗ thì giữ
    const s = st.startSession('w1-l1');
    // dữ liệu chính lớn dần tới mức chỉ ghi được khi bỏ bản rác
    while ((kv.getItem(STORAGE_KEY)?.length ?? 0) < 4_500) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(st.storageStatus().ok).toBe(true);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-100`)).toBeNull();
  });
});

// ---------------------------------------------------------------- 5a: bản sao IndexedDB

class MemBackend implements MirrorBackend {
  value: string | null = null;
  writes = 0;
  failWrite = false;
  readDelay: 'never' | number = 0;
  read(): Promise<string | null> {
    if (this.readDelay === 'never') return new Promise(() => undefined);
    return Promise.resolve(this.value);
  }
  write(json: string): Promise<void> {
    this.writes++;
    if (this.failWrite) return Promise.reject(new Error('idb fail'));
    this.value = json;
    return Promise.resolve();
  }
}

describe('bản sao IndexedDB: ghi ngầm sau mỗi lần lưu', () => {
  it('store gửi dữ liệu sang bản sao (gộp nhiều lần ghi); lỗi bản sao không ảnh hưởng gì', async () => {
    vi.useFakeTimers();
    const be = new MemBackend();
    const mirror = new SaveMirror(be, 1000);
    const st = new ProgressStore(new MemoryStorage(), now, { pageEvents: false, mirror });
    const s = st.startSession('w1-l1');
    for (let i = 0; i < 5; i++) st.addParentAssessment(s.id, 'C4', 'correct');
    expect(be.writes).toBe(0); // chưa tới hạn
    await vi.advanceTimersByTimeAsync(1100);
    expect(be.writes).toBe(1);
    expect(JSON.parse(be.value!).sessions[0].parentAssessments).toHaveLength(5);
    expect(mirror.lastSavedAt).toBeGreaterThan(0);
    be.failWrite = true;
    st.addParentAssessment(s.id, 'D4', 'retry');
    await vi.advanceTimersByTimeAsync(1100);
    expect(mirror.lastError).toBe('idb fail');
    expect(st.storageStatus().ok).toBe(true);
  });

  it('mở app có dữ liệu → bản sao có ngay; dữ liệu chính hỏng → KHÔNG ghi đè bản sao', () => {
    const be = new MemBackend();
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, savedWith(4, 3));
    new ProgressStore(kv, now, { pageEvents: false, mirror: new SaveMirror(be, 0) });
    expect(sessionCount(JSON.parse(be.value!))).toBe(3);
    const good = be.value;
    kv.setItem(STORAGE_KEY, '{hỏng');
    const st2 = new ProgressStore(kv, now, { pageEvents: false, mirror: new SaveMirror(be, 0) });
    expect(st2.recoveredFromCorrupt).toBe(true);
    st2.setLearnerName('x');
    expect(be.value).toBe(good);
  });
});

describe('restoreFromMirror: chỉ khi dữ liệu chính trống / hỏng', () => {
  it('localStorage trống, bản sao có tiến độ → khôi phục', async () => {
    const be = new MemBackend();
    be.value = savedWith(4, 5);
    const kv = new MemoryStorage();
    expect(await restoreFromMirror(kv, be)).toBe(true);
    const st = new ProgressStore(kv, now, { pageEvents: false });
    expect(sessionCount(st.get())).toBe(5);
    expect(st.get().progress.currentWeek).toBe(4);
  });

  it('dữ liệu chính hỏng → khôi phục, bản hỏng được cất "corrupt-*"', async () => {
    const be = new MemBackend();
    be.value = savedWith(4, 2);
    const kv = new MemoryStorage();
    kv.setItem(STORAGE_KEY, '{hỏng');
    expect(await restoreFromMirror(kv, be, { now: () => 123 })).toBe(true);
    expect(kv.getItem(`${STORAGE_KEY}:corrupt-123`)).toBe('{hỏng');
    expect(sessionCount(JSON.parse(kv.getItem(STORAGE_KEY)!))).toBe(2);
  });

  it('dữ liệu chính đọc được → KHÔNG BAO GIỜ bị đè (kể cả ít buổi hơn bản sao / sau khi đặt lại)', async () => {
    const be = new MemBackend();
    be.value = savedWith(9, 6);
    const kv = new MemoryStorage();
    const fresh = JSON.stringify(defaultData(now()));
    kv.setItem(STORAGE_KEY, fresh);
    const read = vi.spyOn(be, 'read');
    expect(await restoreFromMirror(kv, be)).toBe(false);
    expect(read).not.toHaveBeenCalled(); // không chờ IndexedDB khi không cần
    expect(kv.getItem(STORAGE_KEY)).toBe(fresh);
  });

  it('dữ liệu của bản app mới hơn → giữ nguyên', async () => {
    const be = new MemBackend();
    be.value = savedWith(4, 2);
    const kv = new MemoryStorage();
    const future = JSON.stringify({ ...JSON.parse(savedWith(2, 1)), schemaVersion: 999 });
    kv.setItem(STORAGE_KEY, future);
    expect(await restoreFromMirror(kv, be)).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(future);
  });

  it('bản sao trống / dữ liệu mới tinh / hỏng / không có IndexedDB → không làm gì', async () => {
    const kv = new MemoryStorage();
    const be = new MemBackend();
    expect(await restoreFromMirror(kv, be)).toBe(false);
    be.value = JSON.stringify(defaultData(now()));
    expect(await restoreFromMirror(kv, be)).toBe(false);
    be.value = '{hỏng';
    expect(await restoreFromMirror(kv, be)).toBe(false);
    expect(await restoreFromMirror(kv, null)).toBe(false);
    const bad: MirrorBackend = { read: () => Promise.reject(new Error('x')), write: () => Promise.resolve() };
    expect(await restoreFromMirror(kv, bad)).toBe(false);
    expect(kv.length).toBe(0);
  });

  it('IndexedDB treo → hết thời gian chờ, app vẫn mở (không khôi phục)', async () => {
    vi.useFakeTimers();
    const be = new MemBackend();
    be.readDelay = 'never';
    const p = restoreFromMirror(new MemoryStorage(), be, { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(600);
    expect(await p).toBe(false);
  });
});

// ---------------------------------------------------------------- 5b: nhắc sao lưu ở màn chính

describe('backupNudgeDue: nhắc bố mẹ sao lưu (không làm phiền)', () => {
  const T = new Date(2026, 9, 8).getTime();
  it('chưa sao lưu lần nào: chỉ nhắc khi đã học ≥ 10 buổi', () => {
    expect(BACKUP_NUDGE_SESSIONS).toBe(10);
    expect(backupNudgeDue({ lastBackupAt: 0 }, 9, T)).toBe(false);
    expect(backupNudgeDue({ lastBackupAt: 0 }, 10, T)).toBe(true);
  });
  it('đã sao lưu: nhắc khi ≥ 14 ngày', () => {
    expect(backupNudgeDue({ lastBackupAt: T - 13 * DAY }, 50, T)).toBe(false);
    expect(backupNudgeDue({ lastBackupAt: T - 14 * DAY }, 0, T)).toBe(true);
  });
  it('bấm ✕ → ẩn 3 ngày rồi nhắc lại', () => {
    const s = { lastBackupAt: T - 30 * DAY, backupNudgeHiddenAt: T - 2 * DAY };
    expect(backupNudgeDue(s, 20, T)).toBe(false);
    expect(backupNudgeDue(s, 20, T + 1 * DAY)).toBe(true);
  });
  it('trường backupNudgeHiddenAt lưu được (schema hợp lệ)', () => {
    const kv = new MemoryStorage();
    const st = new ProgressStore(kv, now, { pageEvents: false });
    st.updateSettings({ backupNudgeHiddenAt: 123 });
    const again = new ProgressStore(kv, now, { pageEvents: false });
    expect(again.recoveredFromCorrupt).toBe(false);
    expect(again.settings.backupNudgeHiddenAt).toBe(123);
  });
});

// ---------------------------------------------------------------- B2: nhật ký lỗi

describe('nhật ký lỗi (errorLog)', () => {
  it('giữ ERROR_LOG_MAX dòng mới nhất, cắt ngắn tin nhắn / stack, kèm bản app', () => {
    const kv = new MemoryStorage();
    for (let i = 0; i < ERROR_LOG_MAX + 5; i++) logError('error', new Error(`lỗi ${i}`), kv, () => i);
    const list = readErrors(kv);
    expect(list).toHaveLength(ERROR_LOG_MAX);
    expect(list[0].msg).toBe('lỗi 5');
    expect(list[list.length - 1].msg).toBe(`lỗi ${ERROR_LOG_MAX + 4}`);
    expect(typeof list[0].v).toBe('string');
    const big = new Error('x'.repeat(5000));
    expect(describeError(big).msg.length).toBeLessThanOrEqual(301);
    expect((describeError(big).stack ?? '').length).toBeLessThanOrEqual(801);
    expect(describeError({ name: 'NotAllowedError', message: 'chặn' }).msg).toBe('NotAllowedError: chặn');
  });

  it('không bao giờ ném lỗi (bộ nhớ hỏng / đầy / không có)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => logError('error', new Error('a'), throwing)).not.toThrow();
    expect(() => logError('error', undefined, null)).not.toThrow();
    const kv = new MemoryStorage();
    kv.setItem(ERROR_LOG_KEY, '{hỏng');
    expect(readErrors(kv)).toEqual([]);
    logError('rejection', 'chuỗi', kv);
    expect(readErrors(kv)[0]).toMatchObject({ kind: 'rejection', msg: 'chuỗi' });
  });

  it('installErrorCapture: bắt error + unhandledrejection', () => {
    const mem = new MemoryStorage();
    vi.stubGlobal('localStorage', mem);
    const ls: Record<string, (e: unknown) => void> = {};
    installErrorCapture({ addEventListener: (t: string, fn: (e: unknown) => void) => (ls[t] = fn) } as unknown as Window);
    ls.error({ message: 'boom', error: new Error('boom') });
    ls.error({ message: '', error: null }); // lỗi nạp ảnh → bỏ qua
    ls.unhandledrejection({ reason: new Error('hứa hỏng') });
    expect(readErrors(mem).map((e) => `${e.kind}:${e.msg}`)).toEqual(['error:boom', 'rejection:hứa hỏng']);
  });

  it('màn 🩺: có dòng "Lỗi gần đây" và bản kết quả có danh sách lỗi', () => {
    const base = {
      at: Date.now(),
      appVersion: '0.17.0',
      ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      standalone: true,
      screen: { w: 1080, h: 810, vw: 1080, vh: 810, dpr: 2 },
      language: 'vi-VN',
      updateReady: false,
      audio: { supported: true, state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: null, heard: null },
      voice: { supported: true, loaded: true, viVoices: ['Linh'], total: 40, enabled: true, heard: null },
      mic: { getUserMedia: true, secure: true, permission: 'granted', state: 'off', enabled: false, sensitivity: 'normal', tuningCents: 0, latencyMs: 0, lastCheck: null },
      storage: { text: 'ok', percent: 1, ok: true, full: false, persisted: true, lastBackupAt: 0, sessions: 1, completed: 1, curriculumRev: 4, week: 4 },
      offline: { swSupported: true, controller: true, caches: ['piano-be-9-x'], online: true },
      perf: { planMs: 1, homeMs: 1, cores: 6, memoryGB: null },
    } satisfies DiagSnapshot;
    const errors = [{ t: Date.now(), kind: 'screen', msg: 'TypeError: x is undefined', v: '0.17.0', screen: 'screen session' }];
    const row = diagSections({ ...base, errors }).find((x) => x.id === 'device')!.rows.find((r) => r.id === 'errors')!;
    expect(row.status).toBe('warn');
    const text = composeReport({ ...base, errors });
    expect(text).toContain('[🐞 Lỗi gần đây]');
    expect(text).toContain('TypeError: x is undefined');
    expect(text).toContain('"errors":[');
    const clean = diagSections({ ...base, errors: [] }).find((x) => x.id === 'device')!.rows.find((r) => r.id === 'errors')!;
    expect(clean.status).toBe('ok');
  });
});

// ---------------------------------------------------------------- B4: chunk lỗi sau cập nhật → tải lại một lần

describe('reloadOnceForUpdate: tải lại MỘT lần, chặn vòng lặp', () => {
  it('lần đầu: báo "Đang cập nhật app…" rồi tải lại; trong khung thời gian chặn → không tải lại nữa', () => {
    vi.useFakeTimers();
    const ss = new MemoryStorage();
    const reload = vi.fn();
    const notify = vi.fn();
    let t = 1_000_000;
    const env = { storage: ss, now: () => t, reload, notify, delayMs: 500 };
    expect(reloadOnceForUpdate(env)).toBe(true);
    expect(notify).toHaveBeenCalledWith('Đang cập nhật app…');
    vi.advanceTimersByTime(600);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ss.getItem(LAZY_RELOAD_KEY)).toBe(String(t));
    t += 10_000;
    expect(reloadOnceForUpdate(env)).toBe(false);
    t += LAZY_RELOAD_WINDOW_MS;
    expect(reloadOnceForUpdate(env)).toBe(true);
  });
  it('không có sessionStorage → không tự tải lại (không chặn được vòng lặp)', () => {
    expect(reloadOnceForUpdate({ storage: null, reload: vi.fn(), notify: vi.fn() })).toBe(false);
  });
});

// ---------------------------------------------------------------- B4: service worker giữ bản cache trước

describe('sw-template: giữ một bản cache trước, nạp chunk cũ từ đó', () => {
  function runSW(existing: string[]) {
    const store = new Map<string, Map<string, string>>();
    for (const k of existing) store.set(k, new Map([[`/assets/old-${k}.js`, `old ${k}`]]));
    const listeners: Record<string, (e: unknown) => void> = {};
    const caches = {
      keys: async () => [...store.keys()],
      delete: async (k: string) => store.delete(k),
      open: async (k: string) => {
        if (!store.has(k)) store.set(k, new Map());
        const m = store.get(k)!;
        return { match: async (req: { url: string }) => m.get(new URL(req.url).pathname), addAll: async () => undefined };
      },
      match: async (req: { url: string }) => {
        for (const m of store.values()) {
          const v = m.get(new URL(req.url).pathname);
          if (v) return v;
        }
        return undefined;
      },
    };
    const self = {
      location: { origin: 'https://x.test' },
      addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(async () => undefined) },
    };
    const fetchFn = vi.fn(async () => 'network');
    const code = swSrc.replace("'__VERSION__'", "'new'").replace('__PRECACHE__', '[]');
    new Function('self', 'caches', 'fetch', 'Request', code)(self, caches, fetchFn, class {});
    return { store, listeners, fetchFn };
  }

  it('kích hoạt: giữ bản ngay trước, xóa bản cũ hơn', async () => {
    const { store, listeners } = runSW(['piano-be-9-v1', 'piano-be-9-v2', 'other-cache']);
    store.set('piano-be-9-new', new Map());
    let done: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...store.keys()].sort()).toEqual(['other-cache', 'piano-be-9-new', 'piano-be-9-v2']);
  });

  it('fetch: không có trong bản mới → lấy từ bản cũ còn giữ, không ra mạng', async () => {
    const { listeners, fetchFn } = runSW(['piano-be-9-v2']);
    let res: Promise<unknown> = Promise.resolve();
    listeners.fetch({ request: { method: 'GET', url: 'https://x.test/assets/old-piano-be-9-v2.js', mode: 'cors' }, respondWith: (p: Promise<unknown>) => (res = p) });
    expect(await res).toBe('old piano-be-9-v2');
    expect(fetchFn).not.toHaveBeenCalled();
    listeners.fetch({ request: { method: 'GET', url: 'https://x.test/assets/missing.js', mode: 'cors' }, respondWith: (p: Promise<unknown>) => (res = p) });
    expect(await res).toBe('network');
  });
});

// ---------------------------------------------------------------- B2: màn lỗi khi vẽ → màn "Ối"

/** DOM giả tối thiểu cho h() / button() (môi trường test là node). */
class FakeEl {
  children: FakeEl[] = [];
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  disabled = false;
  scrollTop = 0;
  parent: FakeEl | null = null;
  constructor(public tagName: string) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  addEventListener(t: string, fn: () => void) {
    (this.listeners[t] ??= []).push(fn);
  }
  append(...c: Array<FakeEl | string>) {
    for (const y of c) {
      const x = typeof y === 'string' ? Object.assign(new FakeEl('#text'), { textContent: y }) : y;
      x.parent = this;
      this.children.push(x);
    }
  }
  replaceChildren(...c: FakeEl[]) {
    this.children = [];
    this.append(...c);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get text(): string {
    return this.textContent + this.children.map((c) => c.text).join('');
  }
}

describe('App.show: màn lỗi khi vẽ → màn "Ối, có trục trặc nhỏ" + ghi nhật ký', () => {
  it('không để màn trắng; có nút "Về màn chính" và "Kiểm tra iPad"', async () => {
    const mem = new MemoryStorage();
    vi.stubGlobal('localStorage', mem);
    vi.stubGlobal('document', { createElement: (t: string) => new FakeEl(t) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { App } = await import('../src/ui/App');
    const audio = { stopAll: vi.fn(), onStateChange: () => () => undefined } as unknown as ConstructorParameters<typeof App>[1];
    const root = new FakeEl('div');
    const app = new App(root as unknown as HTMLElement, audio, new ProgressStore(new MemoryStorage(), now, { pageEvents: false }));
    app.show((r) => {
      r.append(Object.assign(new FakeEl('div'), { className: 'screen session' }) as unknown as HTMLElement);
      throw new TypeError('cannot read x of undefined');
    });
    expect(root.text).toContain('Ối, có trục trặc nhỏ');
    expect(root.text).toContain('Về màn chính');
    expect(root.text).toContain('Kiểm tra iPad');
    const log = readErrors(mem);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'screen', msg: 'TypeError: cannot read x of undefined' });
  });
});
