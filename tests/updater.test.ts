import { afterEach, describe, expect, it, vi } from 'vitest';
import swSrc from '../src/pwa/sw-template.js?raw';

type Listener = () => void;

/** ServiceWorker giả: ghi nhận postMessage, phát 'statechange'. */
function fakeWorker(state = 'installing') {
  const ls: Listener[] = [];
  const w = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_t: string, fn: Listener) => ls.push(fn),
    setState(s: string) {
      w.state = s;
      ls.forEach((fn) => fn());
    },
  };
  return w;
}

/** Giả lập navigator.serviceWorker + window/document đủ cho updater.ts (môi trường node). */
function setup(initialController: object | null, opts: { waiting?: ReturnType<typeof fakeWorker> } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const regListeners: Record<string, Listener[]> = {};
  const reg = {
    waiting: opts.waiting ?? null,
    installing: null as ReturnType<typeof fakeWorker> | null,
    update: vi.fn(async () => {}),
    addEventListener: (t: string, fn: Listener) => (regListeners[t] ??= []).push(fn),
  };
  let resolveRegister: (r: typeof reg) => void = () => {};
  const sw = {
    controller: initialController,
    addEventListener: (t: string, fn: Listener) => (listeners[t] ??= []).push(fn),
    register: vi.fn(() => new Promise((r) => (resolveRegister = r))),
    getRegistration: vi.fn(async () => undefined),
  };
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: sw, onLine: false });
  vi.stubGlobal('window', { isSecureContext: true, location: { reload }, addEventListener: () => {} });
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  vi.stubEnv('PROD', true);
  const fire = () => listeners.controllerchange?.forEach((fn) => fn());
  const registered = async () => {
    resolveRegister(reg);
    await new Promise((r) => setTimeout(r, 0));
  };
  /** Bản mới được tải về và cài xong (đang chờ) */
  const newVersionInstalled = () => {
    const w = fakeWorker();
    reg.installing = w;
    regListeners.updatefound?.forEach((fn) => fn());
    w.setState('installed');
    reg.waiting = w;
    return w;
  };
  return { fire, reload, registered, newVersionInstalled, sw };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('updater: nhận biết bản mới qua controllerchange', () => {
  it('trang cài lần đầu: lần đổi controller đầu bỏ qua, lần sau là bản mới', async () => {
    const { fire, reload } = setup(null);
    const u = await import('../src/pwa/updater');
    u.registerServiceWorker();
    fire(); // SW vừa cài nhận quyền
    expect(u.isUpdateReady()).toBe(false);
    fire(); // bản mới thật sự
    expect(u.isUpdateReady()).toBe(true);
    expect(reload).not.toHaveBeenCalled(); // chưa ở màn an toàn → không cắt ngang
    u.markSafePoint(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('trang đã có controller: lần đổi đầu tiên đã là bản mới', async () => {
    const { fire } = setup({});
    const u = await import('../src/pwa/updater');
    u.registerServiceWorker();
    fire();
    expect(u.isUpdateReady()).toBe(true);
  });
});

describe('updater: bản mới CHỜ, chỉ kích hoạt ở điểm an toàn (không đổi bản giữa buổi học)', () => {
  it('bản mới cài xong giữa buổi học: KHÔNG gửi SKIP_WAITING; tới màn an toàn mới gửi, đổi controller thì tải lại', async () => {
    const { fire, reload, registered, newVersionInstalled } = setup({});
    const u = await import('../src/pwa/updater');
    u.registerServiceWorker();
    await registered();
    u.markSafePoint(false); // bé đang học
    const w = newVersionInstalled();
    expect(u.isUpdateReady()).toBe(true);
    expect(w.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    u.markSafePoint(true); // về màn chính
    expect(w.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    expect(reload).not.toHaveBeenCalled(); // chờ bản mới nhận quyền
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('mở app khi đã có bản chờ sẵn (reg.waiting) và đang ở màn an toàn → gửi SKIP_WAITING một lần', async () => {
    const waiting = fakeWorker('installed');
    const { registered } = setup({}, { waiting });
    const u = await import('../src/pwa/updater');
    u.markSafePoint(true);
    u.registerServiceWorker();
    await registered();
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
    u.markSafePoint(true);
    expect(waiting.postMessage).toHaveBeenCalledTimes(1);
  });

  it('gửi SKIP_WAITING rồi bé vào học ngay trước khi đổi controller → chưa tải lại, chờ điểm an toàn sau', async () => {
    const { fire, reload, registered, newVersionInstalled } = setup({});
    const u = await import('../src/pwa/updater');
    u.registerServiceWorker();
    await registered();
    newVersionInstalled();
    u.markSafePoint(true);
    u.markSafePoint(false);
    fire();
    expect(reload).not.toHaveBeenCalled();
    u.markSafePoint(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('lần cài đầu (chưa có controller): SW tự kích hoạt, không coi là bản mới, không gửi gì', async () => {
    const { fire, reload, registered, newVersionInstalled } = setup(null);
    const u = await import('../src/pwa/updater');
    u.registerServiceWorker();
    await registered();
    const w = newVersionInstalled();
    u.markSafePoint(true);
    expect(w.postMessage).not.toHaveBeenCalled();
    fire(); // clients.claim()
    expect(u.isUpdateReady()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('sw-template: không skipWaiting lúc cài, có nhận SKIP_WAITING', () => {
  it('nội dung template', () => {
    const src = swSrc;
    const install = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('message'"));
    expect(install).not.toMatch(/self\.skipWaiting\(\)/);
    expect(src).toMatch(/SKIP_WAITING[\s\S]*self\.skipWaiting\(\)/);
    expect(src).toMatch(/clients\.claim\(\)/);
  });
});
