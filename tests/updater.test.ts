import { afterEach, describe, expect, it, vi } from 'vitest';

/** Giả lập navigator.serviceWorker + window/document đủ cho updater.ts (môi trường node). */
function setup(initialController: object | null) {
  const listeners: Record<string, Array<() => void>> = {};
  const sw = {
    controller: initialController,
    addEventListener: (t: string, fn: () => void) => (listeners[t] ??= []).push(fn),
    register: vi.fn(() => new Promise(() => {})), // không cần hoàn tất
    getRegistration: vi.fn(async () => undefined),
  };
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: sw, onLine: false });
  vi.stubGlobal('window', { isSecureContext: true, location: { reload }, addEventListener: () => {} });
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  vi.stubEnv('PROD', true);
  const fire = () => listeners.controllerchange?.forEach((fn) => fn());
  return { fire, reload };
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
