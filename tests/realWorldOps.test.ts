import { describe, expect, it, vi } from 'vitest';
import { BT_OUTPUT_LATENCY_MS, OutputRouteWatcher, ROUTE_POLL_MS, assessRoute, type RouteEnv } from '../src/audio/outputRoute';
import { MemoryStorage, ProgressStore, STORAGE_KEY, isGuestMode } from '../src/progress/ProgressStore';
import { defaultData, type AppData } from '../src/progress/schema';
import { clearMicSetupNeeded, resetDeviceSpecific } from '../src/progress/newDevice';
import { BACKUP_MESSAGE } from '../src/progress/backup';
import {
  LONG_ABSENCE_DAYS,
  healthEnvFromOps,
  noteAppOpen,
  noteVoice,
  opsNotes,
  osVersionOf,
  readOps,
} from '../src/pwa/opsState';
import { envFromOps, healthCheckDue, healthFlags } from '../src/pwa/healthCheck';
import { ActivityWakeLock, type WakeEnv } from '../src/ui/screenAwake';
import { diagSections, type DiagSnapshot } from '../src/pwa/diagnostics';

/* ------------------------------------------------------------------ Bluetooth */

function fakeRoute(o: { lat?: number | null; mic?: string | null; devices?: Array<{ kind: string; label: string }> | null; measured?: number } = {}) {
  const st = { lat: o.lat ?? 0.005, mic: o.mic ?? null, devices: o.devices ?? [], measured: o.measured ?? 0, now: 1000 };
  const timers: Array<() => void> = [];
  let devChange: (() => void) | null = null;
  const env: RouteEnv = {
    latencySec: () => st.lat,
    micLabel: () => st.mic,
    devices: o.devices === null ? null : async () => st.devices,
    onDeviceChange: (fn) => {
      devChange = fn;
      return () => (devChange = null);
    },
    measuredMs: () => st.measured,
    now: () => st.now,
    setInterval: (fn) => (timers.push(fn), timers.length),
    clearInterval: () => void timers.splice(0),
  };
  return { st, env, timers, fire: () => devChange?.() };
}

describe('Bluetooth: phát hiện + tạm không chấm nhịp', () => {
  it('assessRoute: độ trễ > 100 ms hoặc tên AirPods/Bluetooth → không dây', () => {
    expect(assessRoute({ latencySec: 0.003, labels: ['iPad Micrô'] })).toEqual({ wireless: false, reason: null });
    expect(assessRoute({ latencySec: (BT_OUTPUT_LATENCY_MS + 50) / 1000, labels: [] }).reason).toBe('latency');
    expect(assessRoute({ latencySec: null, labels: ['AirPods Pro của Ba'] }).reason).toBe('label');
    expect(assessRoute({ latencySec: undefined, labels: ['JBL Bluetooth'] }).wireless).toBe(true);
    expect(assessRoute({ latencySec: NaN, labels: [null, undefined] }).wireless).toBe(false);
  });

  it('báo MỘT lần khi đổi sang Bluetooth; về loa iPad → chấm nhịp lại', () => {
    const f = fakeRoute();
    const w = new OutputRouteWatcher(f.env);
    const seen: boolean[] = [];
    w.onChange((s) => seen.push(s.wireless));
    w.check();
    expect(w.timingPaused).toBe(false);
    f.st.lat = 0.22;
    f.st.now = 2000;
    w.check();
    w.check(); // vẫn Bluetooth → không báo lại
    expect(seen).toEqual([true]);
    expect(w.timingPaused).toBe(true);
    expect(w.state.latencyMs).toBe(220);
    f.st.lat = 0.004;
    f.st.now = 3000;
    w.check();
    expect(seen).toEqual([true, false]);
    expect(w.timingPaused).toBe(false);
  });

  it('"Đo lại độ trễ" (noteMeasured) hoặc độ trễ đã đo qua Bluetooth (> 120 ms) → chấm nhịp lại', () => {
    const f = fakeRoute({ lat: 0.2 });
    const w = new OutputRouteWatcher(f.env);
    w.check();
    expect(w.timingPaused).toBe(true);
    f.st.now = 5000;
    w.noteMeasured();
    expect(w.timingPaused).toBe(false);
    const g = fakeRoute({ lat: 0.2, measured: 260 });
    const w2 = new OutputRouteWatcher(g.env);
    w2.check();
    expect(w2.state.wireless).toBe(true);
    expect(w2.timingPaused).toBe(false);
  });

  it('devicechange + tên thiết bị (enumerateDevices) + tên micro', async () => {
    const f = fakeRoute({ devices: [{ kind: 'audioinput', label: 'iPad Micrô' }] });
    const w = new OutputRouteWatcher(f.env);
    w.start();
    await w.refresh();
    expect(w.state.wireless).toBe(false);
    expect(w.state.inputs).toEqual(['iPad Micrô']);
    f.st.devices = [
      { kind: 'audioinput', label: 'iPad Micrô' },
      { kind: 'audioinput', label: 'AirPods' },
    ];
    f.fire();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.state.wireless).toBe(true);
    expect(w.state.reason).toBe('label');
    f.st.devices = [];
    f.st.mic = 'AirPods Pro';
    await w.refresh();
    expect(w.state.micLabel).toBe('AirPods Pro');
    expect(w.state.wireless).toBe(true);
  });

  it('chỉ hỏi định kỳ khi màn bài hát mở; thiếu API / API ném lỗi → không hỏng', async () => {
    const f = fakeRoute({ devices: null });
    const w = new OutputRouteWatcher(f.env);
    w.setActive(true);
    expect(f.timers).toHaveLength(1);
    w.setActive(true); // không gắn hai lần
    expect(f.timers).toHaveLength(1);
    f.st.lat = 0.3;
    f.timers[0]();
    expect(w.state.wireless).toBe(true);
    w.setActive(false);
    expect(f.timers).toHaveLength(0);
    expect(ROUTE_POLL_MS).toBeGreaterThanOrEqual(1000);
    const bad = new OutputRouteWatcher({
      ...f.env,
      latencySec: () => {
        throw new Error('x');
      },
      micLabel: () => {
        throw new Error('y');
      },
      devices: async () => {
        throw new Error('z');
      },
      onDeviceChange: null,
      measuredMs: () => {
        throw new Error('m');
      },
    });
    bad.start();
    await expect(bad.refresh()).resolves.toMatchObject({ wireless: false });
    expect(bad.timingPaused).toBe(false);
  });
});

/* ------------------------------------------------------------------ iPadOS / nghỉ lâu / giọng / wake */

const IPAD_26_6 = 'Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_26_7 = IPAD_26_6.replace('26_6', '26_7');

function dataWithSession(date: string): AppData {
  const d = defaultData(new Date(2026, 9, 1));
  d.sessions.push({
    id: 's1',
    date,
    lessonId: 'w1-l1',
    parentAssessments: [{ note: 'C4', result: 'correct', ts: 1 }],
    appAssessments: [],
    micAssessments: [],
    songRuns: [],
    selfRating: 'all',
    startedAt: 1,
    endedAt: 2,
    minutes: 5,
    completed: true,
    checklist: {},
  });
  return d;
}

describe('Đổi iPadOS / nghỉ lâu → nên chạy Kiểm tra sức khỏe app', () => {
  it('osVersionOf đọc iPadOS từ userAgent (kể cả app Màn hình chính không có Version/)', () => {
    expect(osVersionOf(IPAD_26_6)).toBe('iPadOS 26.6');
    expect(osVersionOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/26.6 Safari/605', 5)).toBe('iPadOS 26.6');
    expect(osVersionOf('')).toBeNull();
  });

  it('lần đầu chỉ nhớ bản; bản đổi → osChanged tới khi kiểm tra xong', () => {
    const now = new Date(2026, 9, 17, 18).getTime();
    const d = dataWithSession('2026-10-16');
    const first = noteAppOpen(d, { now, osVersion: 'iPadOS 26.6' })!;
    expect(first.os).toBe('iPadOS 26.6');
    expect(first.osChangedAt).toBeUndefined();
    d.settings.ops = first;
    expect(noteAppOpen(d, { now, osVersion: 'iPadOS 26.6' })).toBeNull(); // không ghi mỗi lần mở
    const changed = noteAppOpen(d, { now: now + 1000, osVersion: osVersionOf(IPAD_26_7) })!;
    expect(changed).toMatchObject({ os: 'iPadOS 26.7', osPrev: 'iPadOS 26.6', osChangedAt: now + 1000 });
    d.settings.ops = changed;
    expect(healthEnvFromOps(d, { now: now + 2000 }).osChanged).toBe(true);
    expect(opsNotes(d, { now: now + 2000 })[0]).toContain('iPadOS 26.6 → iPadOS 26.7');
    // healthCheck (agent khác) dùng được: envFromOps → healthCheckDue / healthFlags
    expect(healthCheckDue(d, envFromOps(d.settings, now + 2000)).reasons).toContain('os');
    expect(healthFlags(d, envFromOps(d.settings, now + 2000)).map((f) => f.id)).toContain('os');
    // Đã kiểm tra sau lúc đổi → hết
    expect(healthEnvFromOps(d, { now: now + 3000, lastCheckAt: now + 2500 }).osChanged).toBe(false);
    d.settings.ops = { ...changed, healthAt: now + 2500 };
    expect(envFromOps(d.settings, now + 3000).osChanged).toBe(false);
  });

  it(`nghỉ ≥ ${LONG_ABSENCE_DAYS} ngày → ghi MỘT lần cho lần nghỉ đó`, () => {
    const d = dataWithSession('2026-10-01');
    const now = new Date(2026, 9, 20, 9).getTime();
    const a = noteAppOpen(d, { now, osVersion: null })!;
    expect(a.awayDays).toBe(19);
    d.settings.ops = a;
    expect(noteAppOpen(d, { now: now + 3600_000, osVersion: null })).toBeNull();
    expect(healthEnvFromOps(d, { now: now + 1 }).daysAway).toBe(19);
    expect(opsNotes(d, { now: now + 1 }).join(' ')).toContain('Bé nghỉ 19 ngày');
    // Nghỉ ngắn → không ghi
    expect(noteAppOpen(dataWithSession('2026-10-15'), { now, osVersion: null })).toBeNull();
    // Chưa học buổi nào → không có "nghỉ"
    expect(noteAppOpen(defaultData(new Date(now)), { now, osVersion: null })).toBeNull();
  });

  it('mất giọng tiếng Việt: chỉ kết luận khi danh sách giọng đã nạp; báo một lần', () => {
    const st: { ops?: unknown } = {};
    expect(noteVoice(st, null, 1)).toBeNull();
    expect(noteVoice(st, false, 1)).toBeNull(); // chưa từng có giọng → không phải "mất"
    const had = noteVoice(st, true, 1)!;
    expect(had).toEqual({ ops: { hadViVoice: true }, lost: false });
    st.ops = had.ops;
    expect(noteVoice(st, true, 2)).toBeNull();
    const lost = noteVoice(st, false, 3)!;
    expect(lost.lost).toBe(true);
    st.ops = lost.ops;
    expect(noteVoice(st, false, 4)).toBeNull(); // không báo lại
    const d = defaultData();
    d.settings.ops = lost.ops;
    expect(healthEnvFromOps(d, { now: 5, voiceAvailable: false }).voiceLost).toBe(true);
    // cài lại giọng → hết
    const back = noteVoice(st, true, 6)!;
    expect(readOps({ ops: back.ops })).toEqual({ hadViVoice: true });
  });

  it('readOps đọc mềm (trường hỏng bị bỏ)', () => {
    expect(readOps({ ops: { os: 5, osChangedAt: 'x', awayDays: -1, wakeDeniedAt: 10, hadViVoice: 'yes' } })).toEqual({ wakeDeniedAt: 10 });
    expect(readOps({ ops: [] })).toEqual({});
    expect(readOps(null)).toEqual({});
  });
});

describe('Giữ màn hình sáng: ghi lại lần bị từ chối', () => {
  it('onDenied + denials khi request() bị từ chối', async () => {
    const env: WakeEnv = {
      api: { request: () => Promise.reject(new Error('NotAllowedError')) },
      now: () => 0,
      visible: () => true,
      setTimer: () => 1,
      clearTimer: () => undefined,
    };
    const w = new ActivityWakeLock(env);
    const fn = vi.fn();
    w.onDenied(fn);
    w.poke();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.denials).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(w.held).toBe(false);
  });
});

/* ------------------------------------------------------------------ iPad mới: nhập JSON */

describe('Nhập JSON (iPad mới): đặt lại số đo micro, mời Cài micro', () => {
  it('resetDeviceSpecific: độ trễ / tự học / độ nhạy → mặc định; giữ micEnabled + bù tay', () => {
    const d = defaultData();
    Object.assign(d.settings, { micEnabled: true, micLatencyMs: 180, micSensitivity: 'high', micTuningCents: 12 });
    d.settings.micAutoTune = { v: 1 } as unknown as AppData['settings']['micAutoTune'];
    d.settings.ops = { wakeTipAt: 5, os: 'iPadOS 18.0' };
    const r = resetDeviceSpecific(d, 1000);
    expect(r).toEqual({ micReset: true, needsMicSetup: true });
    expect(d.settings).toMatchObject({ micEnabled: true, micLatencyMs: 0, micSensitivity: 'normal', micTuningCents: 12 });
    expect(d.settings.micAutoTune).toBeUndefined();
    expect(d.settings.ops).toEqual({ os: 'iPadOS 18.0', micSetupNeededAt: 1000 });
    expect(opsNotes(d, { now: 2000 }).join(' ')).toContain('cần cài lại micro');
    expect(clearMicSetupNeeded(d.settings)).toEqual({ os: 'iPadOS 18.0' });
  });

  it('dữ liệu mặc định (micro tắt) → không đổi gì', () => {
    const d = defaultData();
    const before = JSON.stringify(d);
    expect(resetDeviceSpecific(d, 1)).toEqual({ micReset: false, needsMicSetup: false });
    expect(JSON.stringify(d)).toBe(before);
  });

  it('importJSON: đặt lại + lastImportNeedsMicSetup; báo lại cho giao diện', () => {
    const st = new ProgressStore(new MemoryStorage(), () => new Date(2026, 9, 17));
    const src = defaultData(new Date(2026, 9, 1));
    Object.assign(src.settings, { micEnabled: true, micLatencyMs: 240, micSensitivity: 'low' });
    const seen: boolean[] = [];
    st.subscribe(() => seen.push(st.lastImportNeedsMicSetup));
    expect(st.importJSON(JSON.stringify(src))).toEqual({ ok: true });
    expect(st.settings).toMatchObject({ micEnabled: true, micLatencyMs: 0, micSensitivity: 'normal' });
    expect(st.lastImportNeedsMicSetup).toBe(true);
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('nhắc Album không nằm trong bản sao lưu ở mọi lời báo sao lưu thành công', () => {
    for (const k of ['shared', 'downloaded', 'copied'] as const) expect(BACKUP_MESSAGE[k]).toContain('Album không nằm trong bản sao lưu');
    expect(BACKUP_MESSAGE.failed).not.toContain('Album');
  });
});

/* ------------------------------------------------------------------ Khách chơi */

describe('👤 Khách chơi: không lưu gì, thoát trả lại nguyên vẹn', () => {
  function setup() {
    const kv = new MemoryStorage();
    let now = new Date(2026, 9, 17, 17).getTime();
    const mirror = { save: vi.fn() };
    const st = new ProgressStore(kv, () => new Date(now), { mirror, saveDelayMs: 0 });
    const s = st.startSession('w1-l1');
    st.addSongRun(s.id, { songId: 'mary', mode: 'wait', bpm: 60, hints: 'full', total: 4, hits: 4, source: 'mic', passed: true });
    st.recordGame('ear', 5);
    st.flush();
    return { kv, st, mirror, tick: (ms: number) => (now += ms) };
  }

  it('trong lúc khách chơi: bộ nhớ không đổi, lượt / kỷ lục / buổi / bài xong / album-hàng chờ không ghi', () => {
    const { kv, st, mirror, tick } = setup();
    const before = kv.getItem(STORAGE_KEY);
    const mirrorCalls = mirror.save.mock.calls.length;
    const runsBefore = st.get().sessions.flatMap((x) => x.songRuns).length;
    expect(st.enterGuest()).toBe(true);
    expect(st.guest).toBe(true);
    expect(isGuestMode()).toBe(true);
    tick(60_000);
    const g = st.startSession('w1-l2');
    st.addSongRun(g.id, { songId: 'mary', mode: 'tempo', bpm: 80, hints: 'staff', total: 4, hits: 4, source: 'mic', passed: true });
    st.addParentAssessment(g.id, 'C4', 'correct');
    st.setSelfRating(g.id, 'all');
    st.finishSession(g.id);
    expect(st.recordGame('ear', 99)).toEqual({ best: 5, prevBest: 5, record: false });
    st.markLessonCompleted('w1-l2');
    st.addComposition({ id: 'c1', title: 'x', notes: [], createdAt: 1 } as never);
    expect(st.deferReview({ kind: 'song', group: 'g', label: 'x' } as never)).toBe('');
    expect(st.takeDroppedReviews()).toEqual([]);
    st.updateSettings({ micSensitivity: 'high' });
    st.recordChallenges();
    expect(st.importJSON(JSON.stringify(defaultData())).ok).toBe(false);
    expect(st.resetAll().ok).toBe(false);
    st.flush();
    // Không ghi xuống localStorage / bản sao IndexedDB
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    expect(mirror.save.mock.calls.length).toBe(mirrorCalls);
    // Lượt chơi + kỷ lục không được ghi kể cả trong bộ nhớ
    expect(st.get().sessions.flatMap((x) => x.songRuns)).toHaveLength(runsBefore);
    expect(st.get().games?.ear?.best).toBe(5);
    expect(st.get().progress.lessonsCompleted).not.toContain('w1-l2');
    // Thoát → dữ liệu như lúc vào
    st.exitGuest();
    expect(st.guest).toBe(false);
    expect(isGuestMode()).toBe(false);
    expect(JSON.stringify(st.get())).toBe(before);
    expect(st.settings.micSensitivity).toBe('normal');
    // Sau khi thoát: ghi lại bình thường
    const s2 = st.startSession('w1-l1');
    st.addSongRun(s2.id, { songId: 'mary', mode: 'wait', bpm: 60, hints: 'full', total: 4, hits: 3, source: 'mic', passed: false });
    st.flush();
    expect(kv.getItem(STORAGE_KEY)).not.toBe(before);
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).sessions.flatMap((x: { songRuns: unknown[] }) => x.songRuns)).toHaveLength(runsBefore + 1);
    st.dispose();
  });

  it('app tắt giữa lúc khách chơi → mở lại vẫn là dữ liệu của bé', () => {
    const { kv, st } = setup();
    const before = kv.getItem(STORAGE_KEY);
    st.enterGuest();
    st.startSession('w2-l1');
    st.updateSettings({ timing: 'strict' });
    st.dispose(); // pagehide / tắt app → flush
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    const again = new ProgressStore(kv, () => new Date(2026, 9, 18));
    expect(again.guest).toBe(false);
    expect(again.settings.timing).toBe('easy');
    again.dispose();
  });

  it('thay đổi còn chờ trước khi vào chế độ khách được ghi trước', () => {
    const kv = new MemoryStorage();
    const st = new ProgressStore(kv, () => new Date(2026, 9, 17), { saveDelayMs: 10_000 });
    st.setLearnerName('Bin');
    st.enterGuest();
    expect(JSON.parse(kv.getItem(STORAGE_KEY)!).learner.name).toBe('Bin');
    st.exitGuest();
    st.dispose();
  });
});

/* ------------------------------------------------------------------ 🩺 */

describe('🩺 Kiểm tra iPad: loa / micro / giữ sáng / nhắc vận hành', () => {
  const base: DiagSnapshot = {
    at: Date.now(),
    appVersion: 't',
    ua: IPAD_26_6,
    maxTouchPoints: 5,
    standalone: true,
    screen: { w: 1180, h: 820, vw: 1180, vh: 820, dpr: 2 },
    language: 'vi',
    updateReady: false,
    audio: { supported: true, state: 'running', sampleRate: 48000, baseLatency: 0.005, outputLatency: 0.22, heard: null },
    voice: { supported: true, loaded: true, viVoices: ['Linh'], total: 3, enabled: true, heard: null },
    mic: { getUserMedia: true, secure: true, permission: 'granted', state: 'on', enabled: true, sensitivity: 'normal', tuningCents: 0, latencyMs: 0, lastCheck: null },
    storage: { text: '', percent: 1, ok: true, full: false, persisted: true, lastBackupAt: 0, sessions: 0, completed: 0, curriculumRev: 4, week: 1 },
    offline: { swSupported: true, controller: true, caches: [], online: true },
    perf: { planMs: 1, homeMs: 1, cores: 4, memoryGB: null },
  };
  const rows = (s: DiagSnapshot) => diagSections(s).flatMap((x) => x.rows);

  it('không có trường mới → không có dòng mới (bản cũ không đổi)', () => {
    const ids = rows(base).map((r) => r.id);
    expect(ids).not.toContain('route');
    expect(ids).not.toContain('wake');
    expect(ids).not.toContain('track');
  });

  it('Bluetooth, tên micro, bị từ chối giữ sáng, nhắc vận hành', () => {
    const s: DiagSnapshot = {
      ...base,
      audio: { ...base.audio, route: { wireless: true, reason: 'latency', latencyMs: 220, outputs: [], timingPaused: true } },
      mic: { ...base.mic, trackLabel: 'AirPods Pro', inputs: ['iPad Micrô', 'AirPods Pro'] },
      wake: { supported: true, held: false, denials: 2, deniedAt: null },
      opsNotes: ['iPad vừa cập nhật iPadOS 26.6 → iPadOS 26.7 — nên chạy Kiểm tra sức khỏe app'],
    };
    const r = rows(s);
    const by = (id: string) => r.find((x) => x.id === id)!;
    expect(by('route')).toMatchObject({ status: 'warn' });
    expect(by('route').value).toContain('tạm không chấm nhịp');
    expect(by('track')).toMatchObject({ status: 'warn', value: expect.stringContaining('AirPods Pro') });
    expect(by('wake')).toMatchObject({ status: 'warn' });
    expect(by('wake').tip).toContain('Tự động khóa');
    expect(by('ops0').value).toContain('Kiểm tra sức khỏe app');
    const ok: DiagSnapshot = {
      ...base,
      audio: { ...base.audio, route: { wireless: false, reason: null, latencyMs: 4, outputs: [], timingPaused: false } },
      mic: { ...base.mic, trackLabel: 'iPad Micrô' },
      wake: { supported: true, held: true, denials: 0, deniedAt: null },
    };
    const r2 = rows(ok);
    expect(r2.find((x) => x.id === 'route')!.status).toBe('ok');
    expect(r2.find((x) => x.id === 'track')!.status).toBe('info');
    expect(r2.find((x) => x.id === 'wake')!.status).toBe('ok');
  });
});
