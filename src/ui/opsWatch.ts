/**
 * (+ 2026-10-17, OWNER duyệt — rà soát vận hành thực tế) Gắn các "người gác" vận hành vào App:
 *  1. Loa / tai nghe Bluetooth (audio/outputRoute.ts): 'devicechange' + độ trễ ra loa → báo MỘT lần mỗi lần đổi,
 *     songTempo tạm không chấm nhịp.
 *  2. Mở app: ghi đổi bản iPadOS / lần nghỉ dài (pwa/opsState.ts noteAppOpen) → "nên chạy Kiểm tra sức khỏe app".
 *  3. iPad từ chối giữ màn hình sáng → ghi lại + lời khuyên Tự động khóa MỘT lần.
 *  4. Giọng tiếng Việt từng có nay mất → báo MỘT lần + ghi lại.
 * Chế độ khách: không ghi gì. Mọi bước bọc try/catch — không bao giờ làm hỏng app.
 */
import { BT_NOTE, BT_PARENT_HINT, OutputRouteWatcher, browserRouteEnv } from '../audio/outputRoute';
import { viVoiceKnown } from '../audio/voice';
import { WAKE_TIP, mergeOps, noteAppOpen, noteVoice, osVersionOf, readOps } from '../pwa/opsState';
import { confirmDialog, toast } from './components/dom';
import { lazy, lazyScreen } from './lazy';
import type { App } from './App';

/** Chờ danh sách giọng sau khi mở app (ms) — Safari nạp ngầm */
const VOICE_CHECK_DELAY_MS = 2500;
const micTestMod = lazy(() => import('./screens/micTest'));

/** Text mời cài lại micro sau khi nhập dữ liệu (có thể từ iPad khác) */
export const MIC_SETUP_AFTER_IMPORT =
  'Dữ liệu vừa nhập có thể từ iPad khác — số đo micro cũ đã được đặt lại. Làm “Cài micro 3 bước” (khoảng 2 phút) để micro nghe đúng trên iPad này nhé.';

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* bỏ qua */
  }
}

export function installOps(app: App): OutputRouteWatcher {
  const store = app.store;
  const route = new OutputRouteWatcher(
    browserRouteEnv({
      latencySec: () => app.audio.outputLatency || null,
      micLabel: () => app.micIfReady?.trackLabel() ?? null,
      measuredMs: () => store.settings.micLatencyMs || 0,
    }),
  );
  if (typeof window === 'undefined' || typeof document === 'undefined') return route;
  safe(() => route.start());
  // 1) Bluetooth: báo MỘT lần cho mỗi lần đổi sang không dây
  route.onChange((s) => {
    if (s.wireless && route.timingPaused) toast(`🎧 ${BT_NOTE}. ${BT_PARENT_HINT}.`, 7000);
  });
  // 2) Đổi iPadOS / nghỉ lâu (ghi trước khi bé học buổi mới)
  safe(() => {
    if (store.guest || store.futureVersion) return;
    const os = osVersionOf(navigator.userAgent || '', navigator.maxTouchPoints || 0);
    const next = noteAppOpen(store.get(), { now: Date.now(), osVersion: os });
    if (next) store.updateSettings({ ops: next });
  });
  // 3) Màn hình không được giữ sáng
  app.screenAwake.onDenied(() =>
    safe(() => {
      if (store.guest || store.futureVersion) return;
      const ops = readOps(store.settings);
      const now = Date.now();
      const first = ops.wakeTipAt === undefined;
      store.updateSettings({ ops: mergeOps(ops, { wakeDeniedAt: now, ...(first ? { wakeTipAt: now } : {}) }) });
      if (first) toast(`🔆 Bố mẹ ơi, iPad không cho giữ màn hình sáng — ${WAKE_TIP}`, 8000);
    }),
  );
  // 5) Vừa nhập dữ liệu mà micro đang bật → mời "Cài micro 3 bước" (ProgressStore.importJSON → newDevice.ts)
  store.subscribe(() =>
    safe(() => {
      if (!store.lastImportNeedsMicSetup) return;
      store.lastImportNeedsMicSetup = false;
      window.setTimeout(
        () =>
          confirmDialog({
            title: '🎤 Cài lại micro',
            text: MIC_SETUP_AFTER_IMPORT,
            okIcon: '🎤',
            okLabel: 'Cài micro 3 bước',
            onOk: () => app.show(lazyScreen(micTestMod, (m) => m.micTestScreen(app))),
          }),
        300,
      );
    }),
  );
  // 4) Mất giọng tiếng Việt
  window.setTimeout(
    () =>
      void viVoiceKnown(3000)
        .then((has) => {
          if (store.guest || store.futureVersion) return;
          const r = noteVoice(store.settings, has, Date.now());
          if (!r) return;
          store.updateSettings({ ops: r.ops });
          if (r.lost) toast('🗣️ iPad không còn giọng đọc tiếng Việt — bố mẹ cài lại giọng “Linh” (Phụ huynh → 🩺 Kiểm tra iPad)', 7000);
        })
        .catch(() => undefined),
    VOICE_CHECK_DELAY_MS,
  );
  return route;
}
